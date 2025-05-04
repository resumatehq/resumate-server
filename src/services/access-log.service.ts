import { ObjectId } from 'mongodb';
import databaseServices from './database.service';
import { IAccessLog, ACCESS_LOG_RETENTION, accessLogCollection } from '~/models/schemas/access-log.schema';
import { IUser } from '~/models/schemas/user.schema';

class AccessLogService {
    async logFeatureAccess(
        userId: string | ObjectId,
        feature: string,
        ip?: string,
        userAgent?: string,
        metadata?: Partial<IAccessLog['metadata']>
    ): Promise<void> {
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        // Lấy thông tin user để xác định thời gian lưu trữ log
        const user = await databaseServices.users.findOne({ _id: userObjId });
        if (!user) return;

        // Tính thời gian hết hạn dựa vào gói dịch vụ
        const expireAt = new Date();
        const retentionDays = user.tier === 'premium' ?
            ACCESS_LOG_RETENTION.PREMIUM :
            ACCESS_LOG_RETENTION.FREE;
        expireAt.setDate(expireAt.getDate() + retentionDays);

        const accessLog: IAccessLog = {
            userId: userObjId,
            feature,
            timestamp: new Date(),
            ip,
            userAgent,
            metadata: metadata as IAccessLog['metadata'],
            expireAt
        };

        await databaseServices.getClient().db().collection(accessLogCollection).insertOne(accessLog);
    }

    async getFeatureAccessCount(
        userId: string | ObjectId,
        feature: string,
        startDate: Date,
        endDate: Date = new Date()
    ): Promise<number> {
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        const count = await databaseServices.getClient().db().collection(accessLogCollection).countDocuments({
            userId: userObjId,
            feature,
            timestamp: { $gte: startDate, $lte: endDate }
        });

        return count;
    }

    async getRecentLogs(
        userId: string | ObjectId,
        limit: number = 20
    ): Promise<IAccessLog[]> {
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        const logs = await databaseServices.getClient().db().collection(accessLogCollection)
            .find({ userId: userObjId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();

        return logs as IAccessLog[];
    }

    // Thêm index TTL để MongoDB tự động xóa document hết hạn
    async setupIndexes(): Promise<void> {
        await databaseServices.getClient().db().collection(accessLogCollection)
            .createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });

        await databaseServices.getClient().db().collection(accessLogCollection)
            .createIndex({ userId: 1, feature: 1, timestamp: -1 });
    }
}

export const accessLogService = new AccessLogService();
export default accessLogService;
