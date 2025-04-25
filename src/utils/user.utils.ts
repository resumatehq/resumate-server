import { Types } from 'mongoose';
import { IUser } from '~/models/schemas/user.schema';
import { ObjectId } from 'mongodb';
import databaseServices from '~/services/database.service';
import redisClient from '~/config/redis';
import { ErrorWithStatus } from './error.utils';
import { USER_MESSAGES } from '~/constants/messages';
import HTTP_STATUS_CODES from '~/core/statusCodes';

/**
 * Remove sensitive fields from user object
 */
export const excludeSensitiveFields = (user: any): Omit<IUser, 'password' | 'forgot_password_token' | 'email_verify_token' | 'forgot_password'> => {
    const { password, forgot_password_token, email_verify_token, forgot_password, ...userWithoutSensitiveData } = user;
    return userWithoutSensitiveData;
};

/**
 * Get user by ID with sensitive fields excluded
 * This is a common utility function that can be used across the application
 * It handles both database and Redis cache operations
 */
export const getUserById = async (userId: string | Types.ObjectId): Promise<IUser> => {
    const redis = await redisClient;
    let user;

    // Try to get from Redis first
    const cachedUser = await redis.getObject(`user:${userId}`);
    if (cachedUser) {
        const { password, ...userWithoutPassword } = cachedUser as any;
        user = userWithoutPassword;
    } else {
        // If not in Redis, get from database
        user = await databaseServices.users.findOne(
            {
                _id: new ObjectId(userId)
            },
            {
                projection: {
                    password: 0,
                    forgot_password_token: 0,
                    email_verify_token: 0,
                    forgot_password: 0,
                }
            }
        );
    }

    if (!user) {
        throw new ErrorWithStatus({
            message: USER_MESSAGES.USER_NOT_FOUND,
            status: HTTP_STATUS_CODES.NOT_FOUND
        });
    }

    return user;
};

/**
 * Update user in both database and Redis cache
 * This function ensures data consistency between database and cache
 * It also ensures sensitive data is never stored in cache
 */
export const updateUserAndCache = async (
    userId: string | Types.ObjectId,
    update: Partial<IUser>
): Promise<IUser> => {
    // Update in database
    const result = await databaseServices.users.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        {
            $set: {
                ...update,
                updated_at: new Date()
            }
        },
        { returnDocument: 'after' }
    );

    if (!result) {
        throw new ErrorWithStatus({
            message: USER_MESSAGES.USER_NOT_FOUND,
            status: HTTP_STATUS_CODES.NOT_FOUND
        });
    }

    // Remove sensitive fields
    const userWithoutSensitiveData = excludeSensitiveFields(result);

    // Update Redis cache
    const redis = await redisClient;
    if (redis) {
        await redis.del(`user:${userId}`);
        await redis.setObject(`user:${userId}`, userWithoutSensitiveData, 3600);
    }

    return userWithoutSensitiveData;
}; 