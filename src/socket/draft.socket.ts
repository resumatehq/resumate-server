import { Server, Socket, Namespace } from 'socket.io';
import draftService from '../services/draft.service';
import { logger } from '../loggers/my-logger.log';
import { checkRoomAccess } from './auth-middleware';
import redisClient from '../config/redis';

interface IDraftStatus {
    resumeId: string;
    sectionType: string;
    userId: string;
    lastUpdate: Date;
    status: 'editing' | 'saved' | 'idle';
}

export class DraftSocket {
    private io: Server | Namespace;
    private draftTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private activeDrafts: Map<string, IDraftStatus> = new Map(); // resumeId:sectionType -> status
    private DRAFT_SAVE_DELAY = 2000; // 2 seconds debounce
    private CONFLICT_CHECK_INTERVAL = 5000; // 5 seconds

    constructor(io: Server | Namespace) {
        this.io = io;
        this.setupSocketHandlers();
        this.startConflictDetection();
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket: Socket) => {
            logger.info('Client connected to draft socket:', socket.id);

            // Handle authentication (the middleware should already verify token)
            if (!socket.data.authenticated) {
                logger.warn(`Socket ${socket.id} attempted to connect without authentication`);
                socket.emit('authentication_required');
                // Don't disconnect immediately to allow client to authenticate
                setTimeout(() => {
                    if (!socket.data.authenticated) {
                        socket.disconnect();
                    }
                }, 5000);
            } else {
                logger.info(`User ${socket.data.userId} connected to draft socket ${socket.id}`);
                socket.emit('authenticated', { success: true });
            }

            // User starts editing a resume section
            socket.on('start_editing_section', async (data: {
                resumeId: string;
                userId: string;
                sectionType: string;
            }) => {
                try {
                    // Validate user authentication
                    if (!this.validateUser(socket, data.userId)) return;

                    // Verify access to resume
                    const hasAccess = await checkRoomAccess(socket, data.resumeId);
                    if (!hasAccess) return;

                    // Join room specific to this resume
                    const roomId = `resume:${data.resumeId}`;
                    socket.join(roomId);

                    // Check for conflicts
                    const conflictUser = this.checkEditingConflict(data.resumeId, data.sectionType, data.userId);
                    if (conflictUser) {
                        // Inform user about conflict but still allow editing
                        socket.emit('editing_conflict', {
                            resumeId: data.resumeId,
                            sectionType: data.sectionType,
                            conflictUserId: conflictUser
                        });
                    }

                    // Update active drafts
                    this.setActiveDraft(data.resumeId, data.sectionType, data.userId, 'editing');

                    // Notify others that this section is being edited
                    socket.to(roomId).emit('section_editing_started', {
                        sectionType: data.sectionType,
                        userId: data.userId
                    });

                    logger.info(`User ${data.userId} started editing section ${data.sectionType} of resume ${data.resumeId}`);
                } catch (error: any) {
                    logger.error('Error in start_editing_section:', error);
                    socket.emit('error', { message: 'Failed to start editing section' });
                }
            });

            // User is typing/changing content
            socket.on('draft_content_change', async (data: {
                resumeId: string;
                userId: string;
                sectionType: string;
                sectionData: any;
                resumeData?: any;
                clientTimestamp?: number;
            }) => {
                try {
                    // Validate user authentication
                    if (!this.validateUser(socket, data.userId)) return;

                    // Update active drafts status
                    this.setActiveDraft(data.resumeId, data.sectionType, data.userId, 'editing');

                    // Clear existing timeout for this section
                    const timeoutKey = `${data.resumeId}:${data.userId}:${data.sectionType}`;
                    if (this.draftTimeouts.has(timeoutKey)) {
                        clearTimeout(this.draftTimeouts.get(timeoutKey));
                    }

                    // Calculate round-trip latency if client timestamp provided
                    const latency = data.clientTimestamp ? Date.now() - data.clientTimestamp : null;

                    // Set new timeout to save draft
                    this.draftTimeouts.set(timeoutKey, setTimeout(async () => {
                        try {
                            // Try to get from Redis cache first
                            const redis = await redisClient;
                            const cacheKey = `draft:${data.resumeId}:${data.userId}:${data.sectionType}`;

                            // Check if we need to save draft (if data changed)
                            let needToSave = true;
                            const cachedData = await redis.getObject(cacheKey);

                            if (cachedData && JSON.stringify(cachedData) === JSON.stringify(data.sectionData)) {
                                needToSave = false;
                                logger.debug(`Draft data unchanged for ${data.userId}, section ${data.sectionType}`);
                            }

                            if (needToSave) {
                                // Save to Redis first (faster)
                                await redis.setObject(cacheKey, data.sectionData, 3600); // 1 hour TTL

                                // Then save to database
                                const draft = await draftService.saveSectionDraft(
                                    data.resumeId,
                                    data.userId,
                                    data.sectionType,
                                    data.sectionData,
                                    data.resumeData
                                );

                                // Update status to saved
                                this.setActiveDraft(data.resumeId, data.sectionType, data.userId, 'saved');

                                // Notify client that draft was saved
                                socket.emit('draft_saved', {
                                    sectionType: data.sectionType,
                                    timestamp: new Date(),
                                    draftId: draft._id?.toString()
                                });

                                // Notify other clients about the update
                                const roomId = `resume:${data.resumeId}`;
                                socket.to(roomId).emit('draft_updated', {
                                    sectionType: data.sectionType,
                                    userId: data.userId,
                                    timestamp: new Date()
                                });

                                logger.info(`Draft saved for user ${data.userId}, section ${data.sectionType}`);
                            } else {
                                // Still send saved confirmation with "cached" flag
                                socket.emit('draft_saved', {
                                    sectionType: data.sectionType,
                                    timestamp: new Date(),
                                    cached: true
                                });
                            }
                        } catch (error: any) {
                            logger.error('Error saving draft:', error);
                            socket.emit('draft_save_error', {
                                error: error.message || 'Error saving draft',
                                sectionType: data.sectionType
                            });
                        }
                    }, this.DRAFT_SAVE_DELAY));

                    // Send immediate acknowledgment that we're processing
                    socket.emit('draft_saving', {
                        sectionType: data.sectionType,
                        timestamp: new Date(),
                        latency: latency
                    });
                } catch (error: any) {
                    logger.error('Error in draft_content_change:', error);
                    socket.emit('error', { message: 'Failed to process draft change' });
                }
            });

            // Load draft data for a specific section
            socket.on('load_section_draft', async (data: {
                resumeId: string;
                userId: string;
                sectionType: string;
            }) => {
                try {
                    if (!this.validateUser(socket, data.userId)) return;

                    // Try Redis cache first
                    const redis = await redisClient;
                    const cacheKey = `draft:${data.resumeId}:${data.userId}:${data.sectionType}`;
                    const cachedData = await redis.getObject(cacheKey);

                    if (cachedData) {
                        // Use cached data if available
                        socket.emit('section_draft_loaded', {
                            sectionType: data.sectionType,
                            draftData: cachedData,
                            timestamp: new Date(),
                            source: 'cache'
                        });
                        logger.debug(`Loaded draft from cache for user ${data.userId}, section ${data.sectionType}`);
                        return;
                    }

                    // Fall back to database
                    const draft = await draftService.getDraft(data.resumeId, data.userId);

                    if (draft && draft.draftData && draft.draftData[`section_${data.sectionType}`]) {
                        // Cache the draft data for next time
                        await redis.setObject(cacheKey, draft.draftData[`section_${data.sectionType}`], 3600);

                        socket.emit('section_draft_loaded', {
                            sectionType: data.sectionType,
                            draftData: draft.draftData[`section_${data.sectionType}`],
                            timestamp: draft.lastModified,
                            source: 'database'
                        });
                        logger.info(`Loaded draft from DB for user ${data.userId}, section ${data.sectionType}`);
                    } else {
                        socket.emit('section_draft_loaded', {
                            sectionType: data.sectionType,
                            draftData: null,
                            timestamp: null,
                            source: 'none'
                        });
                    }
                } catch (error: any) {
                    logger.error('Error loading draft:', error);
                    socket.emit('draft_load_error', {
                        error: error.message || 'Error loading draft',
                        sectionType: data.sectionType
                    });
                }
            });

            // User finished editing
            socket.on('stop_editing_section', async (data: {
                resumeId: string;
                sectionType: string;
                userId: string;
                save: boolean;
            }) => {
                try {
                    if (!this.validateUser(socket, data.userId)) return;

                    const roomId = `resume:${data.resumeId}`;

                    // Notify others that user stopped editing
                    socket.to(roomId).emit('section_editing_stopped', {
                        sectionType: data.sectionType,
                        userId: data.userId
                    });

                    // Update status to idle
                    this.removeActiveDraft(data.resumeId, data.sectionType, data.userId);

                    // If not saving, clean up draft data
                    if (!data.save) {
                        // Clear Redis cache
                        const redis = await redisClient;
                        const cacheKey = `draft:${data.resumeId}:${data.userId}:${data.sectionType}`;
                        await redis.del(cacheKey);

                        // We don't delete from DB immediately - that will be handled by TTL
                    }

                    // Leave the room
                    socket.leave(roomId);
                    logger.info(`User ${data.userId} stopped editing section ${data.sectionType} of resume ${data.resumeId}`);
                } catch (error: any) {
                    logger.error('Error in stop_editing_section:', error);
                }
            });

            // Get collaborative editing status
            socket.on('get_collaboration_status', async (data: {
                resumeId: string;
                userId: string;
            }) => {
                try {
                    if (!this.validateUser(socket, data.userId)) return;

                    const status = this.getResumeCollaborationStatus(data.resumeId);
                    socket.emit('collaboration_status', {
                        resumeId: data.resumeId,
                        editors: status
                    });
                } catch (error: any) {
                    logger.error('Error getting collaboration status:', error);
                }
            });

            // Cleanup on disconnect
            socket.on('disconnect', () => {
                try {
                    logger.info('Client disconnected from draft socket:', socket.id);
                    const userId = socket.data.userId;

                    if (userId) {
                        // Find all active drafts for this user and mark them as idle
                        for (const [key, status] of this.activeDrafts.entries()) {
                            if (status.userId === userId) {
                                // Don't remove completely, just update status
                                // This allows reconnection to resume editing
                                status.status = 'idle';
                                status.lastUpdate = new Date();

                                // Notify others this user stopped editing
                                this.io.to(`resume:${status.resumeId}`).emit('section_editing_stopped', {
                                    sectionType: status.sectionType,
                                    userId: status.userId,
                                    reason: 'disconnected'
                                });

                                logger.info(`User ${userId} disconnected while editing section ${status.sectionType} of resume ${status.resumeId}`);
                            }
                        }
                    }
                } catch (error: any) {
                    logger.error('Error in disconnect handler:', error);
                }
            });
        });
    }

    // Start periodic check for editing conflicts and cleanup
    private startConflictDetection() {
        setInterval(() => {
            try {
                // Log active drafts for monitoring
                if (this.activeDrafts.size > 0) {
                    logger.debug(`Active drafts: ${this.activeDrafts.size}`);
                }

                // Check for conflicts
                const now = new Date();
                const conflicts: { resumeId: string, sectionType: string, users: string[] }[] = [];
                const resumeMap = new Map<string, Map<string, string[]>>();

                // Group by resumeId and sectionType
                for (const [key, status] of this.activeDrafts.entries()) {
                    if (status.status === 'editing') {
                        if (!resumeMap.has(status.resumeId)) {
                            resumeMap.set(status.resumeId, new Map<string, string[]>());
                        }

                        const sectionMap = resumeMap.get(status.resumeId)!;
                        if (!sectionMap.has(status.sectionType)) {
                            sectionMap.set(status.sectionType, []);
                        }

                        sectionMap.get(status.sectionType)!.push(status.userId);
                    }
                }

                // Find conflicts (more than one user editing same section)
                for (const [resumeId, sectionMap] of resumeMap.entries()) {
                    for (const [sectionType, users] of sectionMap.entries()) {
                        if (users.length > 1) {
                            conflicts.push({
                                resumeId,
                                sectionType,
                                users
                            });

                            // Notify all users in this room about the conflict
                            this.io.to(`resume:${resumeId}`).emit('editing_conflict_detected', {
                                resumeId,
                                sectionType,
                                users
                            });

                            logger.warn(`Editing conflict detected on resume ${resumeId}, section ${sectionType} between users: ${users.join(', ')}`);
                        }
                    }
                }

                // Clean up very old idle drafts (inactive for more than 1 hour)
                for (const [key, status] of this.activeDrafts.entries()) {
                    const hoursIdle = (now.getTime() - status.lastUpdate.getTime()) / (1000 * 60 * 60);
                    if (status.status === 'idle' && hoursIdle > 1) {
                        this.activeDrafts.delete(key);
                        logger.debug(`Cleaned up idle draft for user ${status.userId}, resume ${status.resumeId}, section ${status.sectionType}`);
                    }
                }
            } catch (error: any) {
                logger.error('Error in conflict detection:', error);
            }
        }, this.CONFLICT_CHECK_INTERVAL);
    }

    // Helper to validate the user
    private validateUser(socket: Socket, userId: string): boolean {
        if (!socket.data.authenticated || !socket.data.userId) {
            socket.emit('authentication_required');
            return false;
        }

        if (socket.data.userId !== userId) {
            socket.emit('unauthorized', { message: 'User ID mismatch' });
            return false;
        }

        return true;
    }

    // Check if another user is editing the same section
    private checkEditingConflict(resumeId: string, sectionType: string, currentUserId: string): string | null {
        for (const [key, status] of this.activeDrafts.entries()) {
            if (status.resumeId === resumeId &&
                status.sectionType === sectionType &&
                status.userId !== currentUserId &&
                status.status === 'editing') {
                return status.userId;
            }
        }
        return null;
    }

    // Set active draft status
    private setActiveDraft(resumeId: string, sectionType: string, userId: string, status: 'editing' | 'saved' | 'idle') {
        const key = `${resumeId}:${sectionType}:${userId}`;
        this.activeDrafts.set(key, {
            resumeId,
            sectionType,
            userId,
            status,
            lastUpdate: new Date()
        });
    }

    // Remove active draft
    private removeActiveDraft(resumeId: string, sectionType: string, userId: string) {
        const key = `${resumeId}:${sectionType}:${userId}`;
        this.activeDrafts.delete(key);
    }

    // Get all users editing a resume
    private getResumeCollaborationStatus(resumeId: string): Array<{
        userId: string,
        sectionType: string,
        status: string,
        lastUpdate: Date
    }> {
        const result = [];
        for (const status of this.activeDrafts.values()) {
            if (status.resumeId === resumeId) {
                result.push({
                    userId: status.userId,
                    sectionType: status.sectionType,
                    status: status.status,
                    lastUpdate: status.lastUpdate
                });
            }
        }
        return result;
    }
}

export default DraftSocket; 