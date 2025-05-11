import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import DraftSocket from './draft.socket';
import { socketAuthMiddleware } from './auth-middleware';
import { instrument } from '@socket.io/admin-ui';
import { envConfig } from '../constants/config';
import { logger } from '../loggers/my-logger.log';

export class SocketManager {
    private io: SocketServer;
    private connectedClients: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

    constructor(httpServer: HttpServer) {
        this.io = new SocketServer(httpServer, {
            cors: {
                origin: [
                    envConfig.clientUrl,
                    process.env.FRONTEND_URL || 'http://localhost:3000',
                    // Cho phép Socket.IO Admin UI trong môi trường dev
                    ...(process.env.NODE_ENV === 'development' ? ['https://admin.socket.io'] : [])
                ],
                methods: ['GET', 'POST'],
                credentials: true
            },
            transports: ['websocket', 'polling'],
            // Tăng timeout để xử lý kết nối chậm
            pingTimeout: 30000,
            pingInterval: 25000,
            // Cấu hình bảo mật
            connectTimeout: 10000,
            maxHttpBufferSize: 1e6 // 1MB
        });

        // Đăng ký middleware xác thực trên tất cả các kết nối
        this.io.use(socketAuthMiddleware);

        // Theo dõi kết nối và ngắt kết nối
        this.io.on('connection', (socket) => {
            const userId = socket.data.userId;
            if (userId) {
                this.trackConnection(userId, socket.id);

                socket.on('disconnect', () => {
                    this.trackDisconnection(userId, socket.id);
                });
            }
        });

        // Cấu hình Socket.IO Admin UI trong môi trường dev
        if (process.env.NODE_ENV === 'development') {
            instrument(this.io, {
                auth: {
                    type: 'basic',
                    username: process.env.SOCKET_ADMIN_USERNAME || 'admin',
                    password: process.env.SOCKET_ADMIN_PASSWORD || 'admin'
                },
                mode: 'development'
            });
        }

        this.initializeHandlers();
    }

    private initializeHandlers() {
        // Draft socket handler với phân đoạn /draft
        const draftNamespace = this.io.of('/draft');
        draftNamespace.use(socketAuthMiddleware);
        new DraftSocket(draftNamespace);

        // Namespace cho các tính năng khác nếu cần
        // this.io.of('/notifications').use(socketAuthMiddleware);
        // this.io.of('/chat').use(socketAuthMiddleware);

        // Thêm logic restart kết nối
        this.setupHeartbeat();

        logger.info('Socket.IO handlers initialized');
    }

    /**
     * Kiểm tra kết nối định kỳ
     */
    private setupHeartbeat() {
        setInterval(() => {
            this.io.emit('heartbeat', { timestamp: new Date() });
        }, 30000); // 30 giây
    }

    /**
     * Theo dõi kết nối mới
     */
    private trackConnection(userId: string, socketId: string) {
        if (!this.connectedClients.has(userId)) {
            this.connectedClients.set(userId, new Set());
        }
        this.connectedClients.get(userId)?.add(socketId);
        logger.info(`User ${userId} connected with socket ${socketId}. Total connections: ${this.connectedClients.get(userId)?.size}`);
    }

    /**
     * Theo dõi ngắt kết nối
     */
    private trackDisconnection(userId: string, socketId: string) {
        const userSockets = this.connectedClients.get(userId);
        if (userSockets) {
            userSockets.delete(socketId);
            if (userSockets.size === 0) {
                this.connectedClients.delete(userId);
            }
            logger.info(`User ${userId} disconnected socket ${socketId}. Remaining connections: ${userSockets.size}`);
        }
    }

    /**
     * Lấy số lượng người dùng đang kết nối
     */
    public getConnectedUsersCount(): number {
        return this.connectedClients.size;
    }

    /**
     * Lấy tổng số kết nối socket
     */
    public getTotalConnectionsCount(): number {
        let count = 0;
        for (const sockets of this.connectedClients.values()) {
            count += sockets.size;
        }
        return count;
    }

    /**
     * Kiểm tra xem người dùng có đang online không
     */
    public isUserOnline(userId: string): boolean {
        return this.connectedClients.has(userId) &&
            (this.connectedClients.get(userId)?.size || 0) > 0;
    }

    /**
     * Gửi thông báo đến tất cả thiết bị của một người dùng
     */
    public sendToUser(userId: string, event: string, data: any): void {
        const userSockets = this.connectedClients.get(userId);
        if (userSockets && userSockets.size > 0) {
            for (const socketId of userSockets) {
                this.io.to(socketId).emit(event, data);
            }
            logger.debug(`Sent event ${event} to user ${userId} on ${userSockets.size} connections`);
        }
    }
}

export default SocketManager; 