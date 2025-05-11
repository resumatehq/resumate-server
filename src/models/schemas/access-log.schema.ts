import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'

export interface IAccessLog {
    _id?: ObjectId;
    userId: ObjectId;
    feature: string;
    timestamp: Date;
    ip?: string;
    userAgent?: string;
    metadata?: {
        resourceId?: string;     // ID của tài nguyên được truy cập (nếu có)
        resourceType?: string;   // Loại tài nguyên (resume, template...)
        status: 'success' | 'failed'; // Trạng thái truy cập
        responseTime?: number;   // Thời gian phản hồi (ms)
    };
    expireAt?: Date;          // TTL - tự động xóa sau thời gian (với bản free)
}

export const accessLogCollection = envConfig.dbAccessLogCollection;

export const ACCESS_LOG_RETENTION = {
    FREE: 7,                 // Giữ log 7 ngày với tài khoản free
    PREMIUM: 90              // Giữ log 90 ngày với tài khoản premium
};
