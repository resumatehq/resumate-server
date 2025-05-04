import { ErrorWithStatus } from "~/utils/error.utils";
import { ObjectId, Filter, Document } from "mongodb";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import redisClient from "~/config/redis";
import { resumeVersionCollection } from "~/models/schemas/resume-version.schema";
import usersService from "./user.service";
import { Types } from "mongoose";
import { IResume, ISectionContent, SectionType } from "~/models/schemas/resume.schema";
import databaseServices from "./database.service";
import bcrypt from "bcrypt";
import crypto from 'crypto';
import { getUserById } from "~/utils/user.utils";
import QRCode from 'qrcode';


// Helper function to generate random string
const generateRandomString = (length: number): string => {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
};

class ResumeService {
    async createResume(userId: string, data: {
        title: string;
        templateId: string;
        targetPosition?: string;
        industry?: string;
        language?: string;
    }) {
        const user = await getUserById(userId)

        if (user.permissions.maxResumes && user.usage.createdResumes >= user.permissions.maxResumes) {
            throw new ErrorWithStatus({
                message: "You have reached your maximum number of allowed resumes",
                status: HTTP_STATUS_CODES.FORBIDDEN,
            });
        }

        // Create default sections based on the template and user's allowed sections
        const allowedSectionTypes = user.permissions.allowedSections || ['personal', 'summary', 'experience', 'education', 'skills'];
        const defaultSections: ISectionContent[] = [];

        // Personal section is always included
        defaultSections.push({
            _id: new Types.ObjectId(),
            type: 'personal' as SectionType,
            title: 'Personal Information',
            enabled: true,
            order: 1,
            content: {},
            settings: {
                visibility: 'public',
                layout: 'standard',
                styling: {}
            }
        });

        // Add other sections based on user permissions
        let order = 2;
        const sectionTitles: Record<string, string> = {
            'personal': 'Personal Information',
            'summary': 'Professional Summary',
            'experience': 'Work Experience',
            'education': 'Education',
            'skills': 'Skills',
            'custom': 'Custom Section',
            'languages': 'Languages',
            'certifications': 'Certifications',
            'projects': 'Projects',
            'references': 'References',
            'interests': 'Interests',
            'publications': 'Publications',
            'awards': 'Awards and Honors',
            'volunteer': 'Volunteer Experience'
        };

        // Add other allowed sections
        allowedSectionTypes.forEach((sectionType: string) => {
            if (sectionType !== 'personal') { // Personal already added
                defaultSections.push({
                    _id: new Types.ObjectId(),
                    type: sectionType as SectionType,
                    title: sectionTitles[sectionType] || `${sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}`,
                    enabled: true,
                    order: order++,
                    content: {},
                    settings: {
                        visibility: 'public',
                        layout: 'standard',
                        styling: {}
                    }
                });
            }
        });

        // Create a new resume document
        const newResume = {
            userId: new ObjectId(userId),
            title: data.title,
            templateId: new ObjectId(data.templateId),
            targetPosition: data.targetPosition || '',
            industry: data.industry || '',
            language: data.language || 'en',
            sections: defaultSections,
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                isPublished: false,
                currentVersion: 1,
                viewCount: 0,
                shareableLink: null,
                sharingOptions: {
                    password: null,
                    expiresAt: null,
                    allowDownload: false,
                    allowFeedback: false
                }
            }
        };

        const result = await databaseServices.resumes.insertOne(newResume as any);
        const createdResume = { ...newResume, _id: result.insertedId };

        await usersService.incrementUsageCounter(userId, 'createdResumes');

        await this.clearUserResumesCache(userId);

        return createdResume;
    }

    async getResumeById(resumeId: string, userId: string, forceRefresh: boolean = false) {
        // Initialize Redis client
        const redis = await redisClient;

        // Try to get from cache first if not forcing refresh
        if (!forceRefresh) {
            const cacheKey = `resume:${resumeId}`;
            const cachedResume = await redis.getObject<IResume>(cacheKey);

            if (cachedResume) {
                if (cachedResume.userId.toString() !== userId) {
                    throw new ErrorWithStatus({
                        message: "You don't have permission to access this resume",
                        status: HTTP_STATUS_CODES.FORBIDDEN,
                    });
                }
                return cachedResume;
            }
        }

        // If not in cache or forcing refresh, get from database
        const resume = await databaseServices.resumes.findOne({ _id: new ObjectId(resumeId) });

        if (!resume) {
            throw new ErrorWithStatus({
                message: "Resume not found",
                status: HTTP_STATUS_CODES.NOT_FOUND,
            });
        }

        // Check ownership
        if (resume.userId.toString() !== userId) {
            throw new ErrorWithStatus({
                message: "You don't have permission to access this resume",
                status: HTTP_STATUS_CODES.FORBIDDEN,
            });
        }

        // Cache the resume (expires in 15 minutes)
        const cacheKey = `resume:${resumeId}`;
        await redis.setObject(cacheKey, resume as unknown as Record<string, unknown>, 900);

        return resume;
    }

    async getUserResumes(userId: string, options: {
        limit?: number;
        page?: number;
        sort?: string;
        search?: string;
    } = {}) {
        const { limit = 10, page = 1, sort = 'createdAt', search } = options;
        const skip = (page - 1) * limit;

        // Construct query
        const query: Filter<Document> = { userId: new ObjectId(userId) };

        // Add search if provided
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { targetPosition: { $regex: search, $options: 'i' } },
                { industry: { $regex: search, $options: 'i' } }
            ];
        }

        // Initialize Redis client
        const redis = await redisClient;

        // Cache key based on query parameters
        const cacheKey = `resumes:${userId}:${limit}:${page}:${sort}:${search || ''}`;
        const cachedResult = await redis.getObject(cacheKey);

        if (cachedResult) {
            return cachedResult;
        }

        // Get total count for pagination
        const total = await databaseServices.resumes.countDocuments(query as any);

        // Set sort options
        const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
        const sortDirection = sort.startsWith('-') ? -1 : 1;

        // Get resumes
        const resumes = await databaseServices.resumes.find(query as any)
            .sort({ [sortField]: sortDirection })
            .skip(skip)
            .limit(limit)
            .project({
                title: 1,
                targetPosition: 1,
                industry: 1,
                templateId: 1,
                'metadata.createdAt': 1,
                'metadata.updatedAt': 1,
                'metadata.isPublished': 1
            })
            .toArray();

        const result = {
            resumes,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        };

        // Cache result (expires in 5 minutes)
        await redis.setObject(cacheKey, result, 300);

        return result;
    }

    async updateResume(resumeId: string, userId: string, updates: Partial<IResume>) {
        // Make sure the resume exists and belongs to the user
        await this.getResumeById(resumeId, userId);

        // Remove fields that shouldn't be directly updated
        const { _id, userId: _, ...validUpdates } = updates as any;

        // Update the resume
        const result = await databaseServices.resumes.findOneAndUpdate(
            { _id: new ObjectId(resumeId) },
            {
                $set: {
                    ...validUpdates,
                    'metadata.updatedAt': new Date()
                }
            },
            { returnDocument: 'after' }
        );

        if (result) {
            // Update the cache with the updated resume
            await this.updateResumeInCache(resumeId, userId, 'update', result);
        } else {
            // If no result, just delete the cache
            await this.updateResumeInCache(resumeId, userId, 'delete');
        }

        return result;
    }

    async deleteResume(resumeId: string, userId: string) {
        await this.getResumeById(resumeId, userId);

        await databaseServices.resume_version.deleteMany({ resumeId: new ObjectId(resumeId) });

        await databaseServices.resumes.deleteOne({ _id: new ObjectId(resumeId) });

        // Update the cache
        await this.updateResumeInCache(resumeId, userId, 'delete');

        return { success: true };
    }

    async shareResume(resumeId: string, userId: string, options: {
        password?: string;
        expiryDays?: number;
        allowDownload?: boolean;
        allowFeedback?: boolean;
        allowEmbed?: boolean;
    } = {}) {
        // Make sure the resume exists and belongs to the user
        const resume = await this.getResumeById(resumeId, userId) as IResume;

        // Create update object
        const updates: any = {
            'metadata.updatedAt': new Date()
        };

        // Generate a shareable link if not already present
        if (!resume.metadata?.shareableLink) {
            updates['metadata.shareableLink'] = generateRandomString(12);
        }

        // Set password if provided
        if (options.password !== undefined) {
            updates['metadata.sharingOptions.password'] = options.password ?
                bcrypt.hashSync(options.password, 10) : null;
        }

        // Set expiry date if provided
        if (options.expiryDays) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + options.expiryDays);
            updates['metadata.sharingOptions.expiresAt'] = expiryDate;
        }

        // Update other sharing options
        if (options.allowDownload !== undefined) {
            updates['metadata.sharingOptions.allowDownload'] = options.allowDownload;
        }

        if (options.allowFeedback !== undefined) {
            updates['metadata.sharingOptions.allowFeedback'] = options.allowFeedback;
        }

        if (options.allowEmbed !== undefined) {
            updates['metadata.sharingOptions.allowEmbed'] = options.allowEmbed;
        }

        // Set as published and record last published time
        updates['metadata.isPublished'] = true;
        updates['metadata.lastPublishedAt'] = new Date();

        // Update the resume
        const result = await databaseServices.resumes.findOneAndUpdate(
            { _id: new ObjectId(resumeId) },
            { $set: updates },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new ErrorWithStatus({
                message: "Failed to update resume sharing settings",
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
            });
        }

        // Update cache with new resume data
        await this.updateResumeInCache(resumeId, userId, 'update', result);

        // Get updated resume info
        const updatedResume = await this.getResumeById(resumeId, userId);

        return {
            shareableLink: `${process.env.CLIENT_URL}/r/${updatedResume.metadata.shareableLink}`,
            sharingOptions: updatedResume.metadata.sharingOptions
        };
    }

    async updateShareSettings(resumeId: string, userId: string, options: {
        password?: string;
        expiryDays?: number;
        allowDownload?: boolean;
        allowFeedback?: boolean;
        allowEmbed?: boolean;
    } = {}) {
        // Reuse the same logic as shareResume but don't generate a new link
        // Make sure the resume exists and belongs to the user
        const resume = await this.getResumeById(resumeId, userId) as IResume;

        // Check if there's a shareable link already
        if (!resume.metadata?.shareableLink) {
            throw new ErrorWithStatus({
                message: "This resume hasn't been shared yet",
                status: HTTP_STATUS_CODES.BAD_REQUEST,
            });
        }

        // Create update object with the same logic as shareResume
        const updates: any = {
            'metadata.updatedAt': new Date()
        };

        // Set password if provided
        if (options.password !== undefined) {
            updates['metadata.sharingOptions.password'] = options.password ?
                bcrypt.hashSync(options.password, 10) : null;
        }

        // Set expiry date if provided
        if (options.expiryDays) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + options.expiryDays);
            updates['metadata.sharingOptions.expiresAt'] = expiryDate;
        } else if (options.expiryDays === 0) {
            // If explicitly set to 0, remove expiry date
            updates['metadata.sharingOptions.expiresAt'] = null;
        }

        // Update other sharing options
        if (options.allowDownload !== undefined) {
            updates['metadata.sharingOptions.allowDownload'] = options.allowDownload;
        }

        if (options.allowFeedback !== undefined) {
            updates['metadata.sharingOptions.allowFeedback'] = options.allowFeedback;
        }

        if (options.allowEmbed !== undefined) {
            updates['metadata.sharingOptions.allowEmbed'] = options.allowEmbed;
        }

        // Update the resume
        const result = await databaseServices.resumes.findOneAndUpdate(
            { _id: new ObjectId(resumeId) },
            { $set: updates },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new ErrorWithStatus({
                message: "Failed to update resume sharing settings",
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
            });
        }

        // Update cache with new resume data
        await this.updateResumeInCache(resumeId, userId, 'update', result);

        // Get updated resume info
        const updatedResume = await this.getResumeById(resumeId, userId);

        return {
            shareableLink: `${process.env.CLIENT_URL}/r/${updatedResume.metadata.shareableLink}`,
            sharingOptions: updatedResume.metadata.sharingOptions
        };
    }

    async revokeShareAccess(resumeId: string, userId: string) {
        // Make sure the resume exists and belongs to the user
        const resume = await this.getResumeById(resumeId, userId) as IResume;

        // Update the resume to revoke sharing
        const result = await databaseServices.resumes.findOneAndUpdate(
            { _id: new ObjectId(resumeId) },
            {
                $set: {
                    'metadata.isPublished': false,
                    'metadata.updatedAt': new Date()
                },
                $unset: { 'metadata.shareableLink': "" }
            },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new ErrorWithStatus({
                message: "Failed to revoke share access",
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
            });
        }

        // Update cache with new resume data
        await this.updateResumeInCache(resumeId, userId, 'update', result);

        return { success: true };
    }

    async generateQRCode(resumeId: string, userId: string, size: number = 300) {
        const resume = await this.getResumeById(resumeId, userId) as IResume;

        if (!resume.metadata?.shareableLink) {
            throw new ErrorWithStatus({
                message: "This resume hasn't been shared yet",
                status: HTTP_STATUS_CODES.BAD_REQUEST,
            });
        }

        const shareableUrl = `${process.env.CLIENT_URL}/r/${resume.metadata.shareableLink}`;

        try {
            // Generate QR code as data URL
            const qrCodeDataUrl = await QRCode.toDataURL(shareableUrl, {
                width: size,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            return {
                qrCodeDataUrl,
                shareableLink: shareableUrl
            };
        } catch (error) {
            throw new ErrorWithStatus({
                message: "Failed to generate QR code",
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
            });
        }
    }

    async getResumeByShareableLink(shareableLink: string, password?: string, viewInfo?: {
        clientIp?: string,
        userAgent?: string,
        referrer?: string
    }) {
        const resume = await databaseServices.resumes.findOne({ 'metadata.shareableLink': shareableLink });

        if (!resume) {
            throw new ErrorWithStatus({
                message: "Resume not found",
                status: HTTP_STATUS_CODES.NOT_FOUND,
            });
        }

        // Check if the resume is published
        if (!resume.metadata.isPublished) {
            throw new ErrorWithStatus({
                message: "This resume is not published",
                status: HTTP_STATUS_CODES.FORBIDDEN,
            });
        }

        // Check if the resume has expired
        if (resume.metadata.sharingOptions.expiresAt && resume.metadata.sharingOptions.expiresAt < new Date()) {
            throw new ErrorWithStatus({
                message: "This shared resume link has expired",
                status: HTTP_STATUS_CODES.GONE,
            });
        }

        // Check for embedding restrictions if applicable
        if (viewInfo?.referrer && !resume.metadata.sharingOptions.allowEmbed) {
            const frontendUrl = process.env.CLIENT_URL || '';
            if (viewInfo.referrer && !viewInfo.referrer.startsWith(frontendUrl)) {
                throw new ErrorWithStatus({
                    message: "Embedding this resume is not allowed",
                    status: HTTP_STATUS_CODES.FORBIDDEN,
                });
            }
        }

        // Verify password if needed
        if (resume.metadata.sharingOptions.password && password) {
            const isPasswordValid = bcrypt.compareSync(password, resume.metadata.sharingOptions.password);
            if (!isPasswordValid) {
                throw new ErrorWithStatus({
                    message: "Invalid password",
                    status: HTTP_STATUS_CODES.UNAUTHORIZED,
                });
            }
        } else if (resume.metadata.sharingOptions.password) {
            throw new ErrorWithStatus({
                message: "Password required to view this resume",
                status: HTTP_STATUS_CODES.UNAUTHORIZED,
            });
        }

        // Increment view count
        await databaseServices.resumes.updateOne(
            { _id: resume._id },
            { $inc: { 'metadata.viewCount': 1 } }
        );

        // Record more detailed analytics if viewInfo is provided
        if (viewInfo && (viewInfo.clientIp || viewInfo.userAgent || viewInfo.referrer)) {
            const viewEntry = {
                timestamp: new Date(),
                ipHash: viewInfo.clientIp ? crypto.createHash('sha256').update(viewInfo.clientIp).digest('hex') : undefined,
                userAgent: viewInfo.userAgent,
                referrer: viewInfo.referrer
            };

            await databaseServices.resumes.updateOne(
                { _id: resume._id },
                { $push: { 'analytics.shareViews': viewEntry } }
            );
        }

        return resume;
    }

    async createVersion(resumeId: string, userId: string, comment?: string) {
        // Get the resume
        const resume = await this.getResumeById(resumeId, userId);

        // Check if user can create versions (based on subscription)
        const user = await usersService.getUserById(userId);
        if (!user.permissions.maxCustomSections && !user.subscription.plan.includes('premium')) {
            throw new ErrorWithStatus({
                message: "Version history is only available for premium users",
                status: HTTP_STATUS_CODES.FORBIDDEN,
            });
        }

        // Create new version
        const newVersionData = {
            resumeId: new ObjectId(resume._id),
            userId: new ObjectId(resume.userId),
            versionNumber: resume.metadata.currentVersion,
            content: {
                title: resume.title,
                targetPosition: resume.targetPosition,
                industry: resume.industry,
                templateId: resume.templateId,
                sections: resume.sections,
                metadata: resume.metadata
            },
            comment: comment || `Version ${resume.metadata.currentVersion}`,
            createdAt: new Date()
        };

        const result = await databaseServices.resume_version.insertOne(newVersionData);

        // Increment the resume version
        await databaseServices.resumes.updateOne(
            { _id: new ObjectId(resumeId) },
            {
                $inc: { 'metadata.currentVersion': 1 },
                $set: { 'metadata.updatedAt': new Date() }
            }
        );

        // Initialize Redis client
        const redis = await redisClient;

        // Clear cache
        await redis.del(`resume:${resumeId}`);

        return { ...newVersionData, _id: result.insertedId };
    }

    async getVersions(resumeId: string, userId: string) {
        // Make sure the resume exists and belongs to the user
        await this.getResumeById(resumeId, userId);

        // Get all versions
        const db = databaseServices.getClient().db();
        const versions = await db.collection(resumeVersionCollection)
            .find({ resumeId: new ObjectId(resumeId) })
            .sort({ versionNumber: -1 })
            .project({
                versionNumber: 1,
                comment: 1,
                createdAt: 1
            })
            .toArray();

        return versions;
    }

    async restoreVersion(resumeId: string, userId: string, versionNumber: number) {
        // Make sure the resume exists and belongs to the user
        await this.getResumeById(resumeId, userId);

        // Get the version
        const db = databaseServices.getClient().db();
        const version = await db.collection(resumeVersionCollection).findOne({
            resumeId: new ObjectId(resumeId),
            versionNumber
        });

        if (!version) {
            throw new ErrorWithStatus({
                message: "Version not found",
                status: HTTP_STATUS_CODES.NOT_FOUND,
            });
        }

        // Create a new version of the current state before restoring
        await this.createVersion(resumeId, userId, "Auto-save before restoring version " + versionNumber);

        // Restore the content from the version
        await databaseServices.resumes.findOneAndUpdate(
            { _id: new ObjectId(resumeId) },
            {
                $set: {
                    title: version.content.title,
                    targetPosition: version.content.targetPosition,
                    industry: version.content.industry,
                    sections: version.content.sections,
                    'metadata.updatedAt': new Date(),
                    'metadata.restoredFromVersion': versionNumber
                }
            },
            { returnDocument: 'after' }
        );

        // Update the cache for this resume
        const updatedResume = await this.getResumeById(resumeId, userId);
        await this.updateResumeInCache(resumeId, userId, 'update', updatedResume);

        // Return the updated resume
        return updatedResume;
    }

    // Helper method to clear all cached resume lists for a user
    private async clearUserResumesCache(userId: string) {
        // Initialize Redis client
        const redis = await redisClient;

        const keys = await redis.keys(`resumes:${userId}:*`);
        if (keys.length > 0) {
            await Promise.all(keys.map(key => redis.del(key)));
        }
    }

    /**
     * Update or delete resume cache in Redis
     * @param resumeId - Resume ID to update or delete
     * @param userId - User ID 
     * @param operation - Operation type: 'update' or 'delete'
     * @param data - New resume data for update operation (optional)
     */
    async updateResumeInCache(resumeId: string, userId: string, operation: 'update' | 'delete', data?: IResume): Promise<void> {
        // Initialize Redis client
        const redis = await redisClient;
        const cacheKey = `resume:${resumeId}`;

        // Delete from cache if operation is 'delete' or no data provided
        if (operation === 'delete' || !data) {
            await redis.del(cacheKey);
        } else {
            // Update cache with new data
            await redis.setObject(cacheKey, data as unknown as Record<string, unknown>, 900);
        }

        // Always clear the user's resume list cache to ensure it's refreshed
        await this.clearUserResumesCache(userId);
    }

    async createEmptyResume(userId: string, data: {
        title: string;
        templateId: string;
        targetPosition?: string;
        industry?: string;
        language?: string;
    }) {
        const user = await getUserById(userId)

        if (user.permissions.maxResumes && user.usage.createdResumes >= user.permissions.maxResumes) {
            throw new ErrorWithStatus({
                message: "You have reached your maximum number of allowed resumes",
                status: HTTP_STATUS_CODES.FORBIDDEN,
            });
        }


        // Create a new empty resume document
        const newResume = {
            userId: new ObjectId(userId),
            title: data.title,
            templateId: new ObjectId(data.templateId),
            targetPosition: data.targetPosition || '',
            industry: data.industry || '',
            language: data.language || 'en',
            sections: [],
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                isPublished: false,
                currentVersion: 1,
                viewCount: 0,
                downloadCount: 0,
                shareableLink: null,
                sharingOptions: {
                    password: null,
                    expiresAt: null,
                    allowDownload: false,
                    allowFeedback: false
                }
            },
            analytics: {
                modificationCount: 0,
                exportHistory: [],
                shareViews: []
            },
            keywords: [],
            aiSuggestions: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await databaseServices.resumes.insertOne(newResume as any);
        const createdResume = { ...newResume, _id: result.insertedId };

        await usersService.incrementUsageCounter(userId, 'createdResumes');

        await this.clearUserResumesCache(userId);

        return createdResume;
    }
}

const resumeService = new ResumeService();
export default resumeService; 