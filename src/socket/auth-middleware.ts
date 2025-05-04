import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { envConfig } from '../constants/config';

interface DecodedToken {
    user_id: string;
    email?: string;
    iat?: number;
    exp?: number;
}

/**
 * Middleware xác thực cho Socket.IO
 * Kiểm tra và xác thực token trước khi cho phép kết nối WebSocket
 */
export const socketAuthMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
    try {
        // Lấy token từ handshake
        const token =
            socket.handshake.auth.token ||
            socket.handshake.headers.authorization?.replace('Bearer ', '') ||
            socket.handshake.query.token;

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        // Xác thực token
        try {
            const decoded = jwt.verify(token as string, envConfig.jwtSecretAccessToken) as DecodedToken;

            // Lưu thông tin người dùng vào socket để sử dụng sau này
            socket.data.userId = decoded.user_id;
            socket.data.email = decoded.email;
            socket.data.authenticated = true;

            // Log thông tin kết nối
            console.log(`Socket ${socket.id} authenticated for user ${decoded.user_id}`);

            next();
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
            return next(new Error('Authentication error: Invalid token'));
        }
    } catch (error) {
        console.error('Socket authentication error:', error);
        return next(new Error('Authentication error: Server error'));
    }
};

/**
 * Kiểm tra quyền truy cập vào phòng/tài nguyên
 */
export const checkRoomAccess = async (socket: Socket, resumeId: string): Promise<boolean> => {
    try {
        // Xác minh rằng người dùng đã được xác thực
        if (!socket.data.authenticated || !socket.data.userId) {
            socket.emit('unauthorized', { message: 'Authentication required' });
            return false;
        }

        // TODO: Kiểm tra xem người dùng có quyền truy cập vào resume này không
        // Phát triển: Thêm logic kiểm tra quyền trong database

        return true;
    } catch (error) {
        console.error('Room access check error:', error);
        socket.emit('error', { message: 'Server error during access check' });
        return false;
    }
};

export default socketAuthMiddleware; 