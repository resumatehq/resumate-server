import { Request, Response, NextFunction } from 'express';
import { TokenPayload } from '~/models/requests/user.request';
import { ac, FEATURES } from '~/config/roles';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import { ObjectId } from 'mongodb';
import { IUser } from '~/models/schemas/user.schema';
import { IResume } from '~/models/schemas/resume.schema';
import redisClient from '~/config/redis';
import { wrapRequestHandler } from '~/utils/wrapHandler';
import usersService from '~/services/user.service';
import databaseServices from '~/services/database.service';
import asyncHandler from 'express-async-handler';
import accessLogService from '~/services/access-log.service';
import { SectionType } from '~/models/schemas/resume.schema';
import { getUserById } from '~/utils/user.utils';

/**
 * Middleware để xác thực quyền truy cập tính năng sử dụng AccessControl từ roles.ts
 * @param feature Tên tính năng cần kiểm tra từ FEATURES
 */
export const checkRolePermission = (feature: string) => {
    return wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { role } = req.decoded_authorization as TokenPayload;

        if (!role) {
            throw new ErrorWithStatus({
                message: 'User role not found',
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        // Kiểm tra quyền dựa trên vai trò trong AccessControl
        const permission = ac.can(role).createAny(feature);

        // Check if permission is granted - use type assertion to access granted property
        if (!(permission as any).granted) {
            throw new ErrorWithStatus({
                message: `You need to upgrade your subscription to access ${feature}`,
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        next();
    });
};

/**
 * Middleware kiểm tra đầy đủ quyền truy cập tính năng dựa trên:
 * 1. Vai trò (role)
 * 2. Trạng thái subscription 
 * 3. Giới hạn sử dụng
 * @param feature Tên tính năng cần kiểm tra từ FEATURES
 */
export const checkFeatureAccess = (feature: string) => {
    return wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { user_id, role } = req.decoded_authorization as TokenPayload;

        if (!role) {
            throw new ErrorWithStatus({
                message: 'User role not found',
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        // Kiểm tra quyền dựa trên vai trò
        const permission = ac.can(role).createAny(feature);

        if (!(permission as any).granted) {
            throw new ErrorWithStatus({
                message: `You need to upgrade your subscription to access ${feature}`,
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        // Lấy thông tin user
        let user: IUser | null = null;

        // Thử lấy từ Redis cache trước
        const redis = await redisClient;
        if (redis) {
            user = await redis.getObject<IUser>(`user:${user_id}`);
        }

        // Nếu không có trong cache, lấy từ database
        if (!user) {
            user = await databaseServices.users.findOne({ _id: new ObjectId(user_id) });

            if (user && redis) {
                await redis.setObject(`user:${user_id}`, user as unknown as Record<string, unknown>, 1800);
            }
        }

        if (!user) {
            throw new ErrorWithStatus({
                message: 'User not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Kiểm tra trạng thái subscription
        if (feature.includes('advanced') || feature === FEATURES.ANALYTICS || feature === FEATURES.PRIORITY_SUPPORT) {
            if (user.subscription.status !== 'active' || user.tier !== 'premium') {
                throw new ErrorWithStatus({
                    message: 'Your subscription has expired or is not active. Please renew to access premium features.',
                    status: HTTP_STATUS_CODES.FORBIDDEN
                });
            }
        }

        // Kiểm tra nếu feature có trong danh sách được phép
        if (!user.permissions.allowedFeatures.includes(feature)) {
            throw new ErrorWithStatus({
                message: `Access to ${feature} feature requires premium subscription`,
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        // Kiểm tra giới hạn sử dụng của AI
        if (feature === FEATURES.BASIC_AI || feature === FEATURES.ADVANCED_AI) {
            // Kiểm tra giới hạn ngày
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const aiRequestsToday = await accessLogService.getFeatureAccessCount(
                user_id,
                feature,
                today
            );

            if (aiRequestsToday >= user.permissions.aiRequests.maxPerDay) {
                throw new ErrorWithStatus({
                    message: `You have reached your daily limit for AI requests (${user.permissions.aiRequests.maxPerDay} per day)`,
                    status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
                });
            }

            // Kiểm tra giới hạn tháng
            const firstDayOfMonth = new Date();
            firstDayOfMonth.setDate(1);
            firstDayOfMonth.setHours(0, 0, 0, 0);

            const aiRequestsThisMonth = await accessLogService.getFeatureAccessCount(
                user_id,
                feature,
                firstDayOfMonth
            );

            if (aiRequestsThisMonth >= user.permissions.aiRequests.maxPerMonth) {
                throw new ErrorWithStatus({
                    message: `You have reached your monthly limit for AI requests (${user.permissions.aiRequests.maxPerMonth} per month)`,
                    status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
                });
            }
        }

        // Ghi log truy cập tính năng cao cấp
        if (feature.includes('advanced') || feature === FEATURES.ANALYTICS || feature === FEATURES.PRIORITY_SUPPORT) {
            if (user._id) {  // Thêm kiểm tra để tránh lỗi TypeScript
                await accessLogService.logFeatureAccess(
                    user._id,
                    feature,
                    req.ip,
                    req.headers['user-agent'] as string,
                    { status: 'success' }
                );
            }
        }

        // Lưu thông tin user vào request để sử dụng sau
        req.user = user;
        next();
    });
};

/**
 * Middleware kiểm tra giới hạn tạo resume
 */
export const checkResumeLimit = wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { user_id } = req.decoded_authorization as TokenPayload;

    // Lấy thông tin user
    const user = await getUserById(user_id)

    if (user.usage.createdResumes >= user.permissions.maxResumes) {
        throw new ErrorWithStatus({
            message: `You have reached your resume limit (${user.permissions.maxResumes}). Please upgrade your plan for more.`,
            status: HTTP_STATUS_CODES.FORBIDDEN
        });
    }

    req.user = user;
    next();
});

/**
 * Middleware kiểm tra quyền xuất file theo định dạng
 * @param format Định dạng file cần kiểm tra (pdf, docx, png, json)
 */
export const checkExportAccess = (format: string) => {
    return wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        // Lấy thông tin user
        let user: IUser | null = null;

        // Thử lấy từ Redis cache trước
        const redis = await redisClient;
        if (redis) {
            user = await redis.getObject<IUser>(`user:${user_id}`);
        }

        // Nếu không có trong cache, lấy từ database
        if (!user) {
            user = await databaseServices.users.findOne({ _id: new ObjectId(user_id) });

            if (user && redis) {
                await redis.setObject(`user:${user_id}`, user as unknown as Record<string, unknown>, 1800); // Cache 1 giờ
            }
        }

        if (!user) {
            throw new ErrorWithStatus({
                message: 'User not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Kiểm tra định dạng xuất có được phép không
        if (!user.permissions.allowedExportFormats.includes(format.toLowerCase() as "pdf" | "docx" | "png" | "json")) {
            throw new ErrorWithStatus({
                message: `Export to ${format} format requires premium subscription`,
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        req.user = user;
        next();
    });
};

/**
 * Middleware ghi nhận việc sử dụng tính năng
 * @param counter Loại counter cần tăng
 */
export const trackFeatureUsage = (counter: 'createdResumes' | 'aiRequestsCount' | 'exportsCount.pdf' | 'exportsCount.docx' | 'exportsCount.png') => {
    return wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
        // Lưu giữ response ban đầu để có thể theo dõi khi response hoàn thành
        const originalSend = res.send;

        res.send = function (body) {
            // Chỉ tăng counter nếu response thành công (2xx)
            if (res.statusCode >= 200 && res.statusCode < 300 && req.decoded_authorization) {
                const { user_id } = req.decoded_authorization as TokenPayload;

                // Tăng counter trong background mà không chờ hoàn thành
                usersService.incrementUsageCounter(user_id, counter)
                    .catch(err => console.error(`Error incrementing usage counter: ${err.message}`));
            }

            return originalSend.call(this, body);
        };

        next();
    });
};

/**
 * Middleware kiểm tra giới hạn section
 * @param sectionType Loại section cần kiểm tra
 */
export const checkSectionAccess = (sectionType: SectionType) => {
    return asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Validate section type
        if (!sectionType) {
            throw new ErrorWithStatus({
                message: 'Section type is required',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        if (!req.user?._id) {
            throw new ErrorWithStatus({
                message: 'User not found',
                status: HTTP_STATUS_CODES.UNAUTHORIZED
            });
        }

        const user = await databaseServices.users.findOne({ _id: new ObjectId(req.user._id.toString()) });
        if (!user) {
            throw new ErrorWithStatus({
                message: 'User not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Kiểm tra section có nằm trong danh sách được phép không
        if (!user.permissions?.allowedSections?.includes(sectionType)) {
            throw new ErrorWithStatus({
                message: `Section type "${sectionType}" is not available in your current plan.`,
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        // Kiểm tra thêm giới hạn custom section
        if (sectionType === 'custom') {
            // Kiểm tra xem user có quyền tạo custom section không
            if (!user.permissions?.maxCustomSections || user.permissions.maxCustomSections <= 0) {
                throw new ErrorWithStatus({
                    message: 'Custom sections are not available in your current plan.',
                    status: HTTP_STATUS_CODES.FORBIDDEN
                });
            }

            // Nếu resume đã có trong request
            if (req.resume) {
                const resume = req.resume as unknown as { sections: Array<{ type: string }> };
                const customSections = resume.sections?.filter(s => s.type === 'custom') || [];

                if (customSections.length >= user.permissions.maxCustomSections) {
                    throw new ErrorWithStatus({
                        message: `Custom section limit reached (${user.permissions.maxCustomSections}). Please upgrade your account for more custom sections.`,
                        status: HTTP_STATUS_CODES.FORBIDDEN
                    });
                }
            }
        }

        next();
    });
};

/**
 * Middleware yêu cầu người dùng phải có gói premium
 */
export const requirePremium = wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { user_id } = req.decoded_authorization as TokenPayload;

    const user = await databaseServices.users.findOne({ _id: new ObjectId(user_id) });

    if (!user) {
        throw new ErrorWithStatus({
            message: 'User not found',
            status: HTTP_STATUS_CODES.NOT_FOUND
        });
    }

    if (user.tier !== 'premium' || user.subscription.status !== 'active') {
        throw new ErrorWithStatus({
            message: 'This feature requires an active premium subscription',
            status: HTTP_STATUS_CODES.FORBIDDEN
        });
    }

    next();
});

/**
 * Middleware kiểm tra quyền truy cập template premium
 * Kiểm tra xem người dùng có được phép sử dụng template premium hay không
 */
export const checkPremiumTemplateAccess = wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { user_id } = req.decoded_authorization as TokenPayload;
    const templateId = req.params.templateId || req.body.templateId;

    // Nếu không có templateId, cho phép đi tiếp
    if (!templateId) {
        return next();
    }

    // Kiểm tra template có phải premium không
    const template = await databaseServices.templates.findOne({ _id: new ObjectId(templateId) });

    // Nếu không tìm thấy template
    if (!template) {
        throw new ErrorWithStatus({
            message: 'Template not found',
            status: HTTP_STATUS_CODES.NOT_FOUND
        });
    }

    // Nếu template là free, cho phép truy cập
    if (template.tier === 'free') {
        return next();
    }

    const user = await getUserById(user_id);

    // Cho phép truy cập nếu user là premium hoặc admin
    if (user.tier === 'premium' || user.tier === 'admin') {
        // Ghi log sử dụng template premium
        if (template.tier === 'premium') {
            await accessLogService.logFeatureAccess(
                new ObjectId(user_id.toString()),
                FEATURES.PREMIUM_TEMPLATES,
                req.ip,
                req.headers['user-agent'] as string,
                {
                    status: 'success',
                    resourceId: templateId,
                    resourceType: 'template'
                }
            ).catch(err => console.error('Error logging template access:', err));
        }
        return next();
    }

    throw new ErrorWithStatus({
        message: 'This premium template requires an active premium subscription',
        status: HTTP_STATUS_CODES.FORBIDDEN
    });
});

/**
 * Middleware kiểm tra quyền sở hữu resume
 * Đảm bảo người dùng chỉ có thể truy cập và chỉnh sửa resume của họ
 */
export const checkResumeOwnership = wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
    const { user_id } = req.decoded_authorization as TokenPayload;
    const { resumeId } = req.params;

    // Bỏ qua kiểm tra cho public routes và routes không cần resumeId
    if (req.path.includes('/shared/') || !req.path.includes('/:resumeId')) {
        return next();
    }

    if (!resumeId) {
        throw new ErrorWithStatus({
            message: 'Resume ID is required',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Initialize Redis client
    const redis = await redisClient;
    const cacheKey = `resume:${resumeId}`;

    // Kiểm tra resume trong Redis trước
    let resume = await redis.getObject<IResume>(cacheKey);

    // Nếu không tìm thấy trong Redis, kiểm tra từ database
    if (!resume) {
        resume = await databaseServices.resumes.findOne({
            _id: new ObjectId(resumeId),
            userId: new ObjectId(user_id)
        });

        // Nếu tìm thấy trong database, cache vào Redis (15 phút)
        if (resume) {
            await redis.setObject(cacheKey, resume as unknown as Record<string, unknown>, 900);
        }
    } else {
        // Nếu tìm thấy trong Redis, kiểm tra xem resume có thuộc về user không
        if (resume.userId?.toString() !== user_id) {
            throw new ErrorWithStatus({
                message: 'Resume not found or you do not have permission to access it',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }
    }

    if (!resume) {
        throw new ErrorWithStatus({
            message: 'Resume not found or you do not have permission to access it',
            status: HTTP_STATUS_CODES.NOT_FOUND
        });
    }

    next();
}); 