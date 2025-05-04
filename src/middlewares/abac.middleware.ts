import { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { TokenPayload } from '~/models/requests/user.request';
import { ac, ATTRIBUTE_CONDITIONS } from '~/config/roles';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import databaseServices from '~/services/database.service';
import { wrapRequestHandler } from '~/utils/wrapHandler';
import { IUser } from '~/models/schemas/user.schema';

// Define interfaces for resources with necessary properties
interface ITemplate {
    _id: ObjectId;
    user_id: ObjectId;
    tier: 'free' | 'premium';
    // Add other template properties as needed
}

interface IResume {
    _id: ObjectId;
    user_id: ObjectId;
    // Add other resume properties as needed
}

// Define a generic resource type that includes common properties
interface IResource {
    _id: ObjectId;
    user_id: ObjectId;
}

/**
 * Middleware cho phép kiểm tra quyền truy cập dựa trên thuộc tính (ABAC)
 * @param resource Loại tài nguyên cần kiểm tra (template, resume, etc.)
 * @param action Hành động cần thực hiện (read, update, delete, etc.)
 * @param attributeConditions Các điều kiện thuộc tính cần kiểm tra
 */
export const checkAttributeBasedAccess = (
    resource: string,
    action: 'create' | 'read' | 'update' | 'delete',
    attributeConditions: string[] = []
) => {
    return wrapRequestHandler(async (req: Request, res: Response, next: NextFunction) => {
        const { user_id, role } = req.decoded_authorization as TokenPayload;
        const resourceId = req.params.id; // ID của tài nguyên từ params

        // Lấy thông tin người dùng
        const user = await databaseServices.users.findOne({ _id: new ObjectId(user_id) }) as IUser;

        if (!user) {
            throw new ErrorWithStatus({
                message: 'User not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Kiểm tra điều kiện sở hữu nếu có yêu cầu
        if (attributeConditions.includes(ATTRIBUTE_CONDITIONS.OWN_RESOURCE) && resourceId) {
            // Tìm tài nguyên trong database
            let resourceCollection;

            switch (resource) {
                case 'template':
                    resourceCollection = databaseServices.templates;
                    break;
                case 'resume':
                    resourceCollection = databaseServices.resumes;
                    break;
                default:
                    throw new ErrorWithStatus({
                        message: `Unsupported resource type: ${resource}`,
                        status: HTTP_STATUS_CODES.BAD_REQUEST
                    });
            }

            if (!resourceCollection) {
                throw new ErrorWithStatus({
                    message: `Invalid resource type: ${resource}`,
                    status: HTTP_STATUS_CODES.BAD_REQUEST
                });
            }

            const resourceObject = await resourceCollection.findOne({ _id: new ObjectId(resourceId) }) as any;

            if (!resourceObject) {
                throw new ErrorWithStatus({
                    message: `${resource} not found`,
                    status: HTTP_STATUS_CODES.NOT_FOUND
                });
            }

            // Kiểm tra nếu người dùng là chủ sở hữu
            const isOwner = resourceObject.user_id &&
                resourceObject.user_id.toString() === user_id.toString();

            // Kiểm tra quyền dựa trên vai trò và quyền sở hữu
            if (isOwner) {
                // Nếu là chủ sở hữu, kiểm tra quyền "Own"
                const permission = ac.can(role)[`${action}Own`](resource);
                if (!(permission as any).granted) {
                    throw new ErrorWithStatus({
                        message: `You don't have permission to ${action} this ${resource}`,
                        status: HTTP_STATUS_CODES.FORBIDDEN
                    });
                }
            } else {
                // Nếu không phải chủ sở hữu, kiểm tra quyền "Any"
                const permission = ac.can(role)[`${action}Any`](resource);
                if (!(permission as any).granted) {
                    throw new ErrorWithStatus({
                        message: `You don't have permission to ${action} this ${resource}`,
                        status: HTTP_STATUS_CODES.FORBIDDEN
                    });
                }
            }
        }

        // Kiểm tra điều kiện template
        if (
            (attributeConditions.includes(ATTRIBUTE_CONDITIONS.PREMIUM_TEMPLATE) ||
                attributeConditions.includes(ATTRIBUTE_CONDITIONS.FREE_TEMPLATE)) &&
            resource === 'template' &&
            resourceId
        ) {
            const template = await databaseServices.templates.findOne({ _id: new ObjectId(resourceId) }) as any;

            if (!template) {
                throw new ErrorWithStatus({
                    message: 'Template not found',
                    status: HTTP_STATUS_CODES.NOT_FOUND
                });
            }

            // Kiểm tra nếu template là premium và người dùng không phải premium
            if (
                template.tier === 'premium' &&
                attributeConditions.includes(ATTRIBUTE_CONDITIONS.PREMIUM_TEMPLATE) &&
                user.tier !== 'premium'
            ) {
                throw new ErrorWithStatus({
                    message: 'This template requires a premium subscription',
                    status: HTTP_STATUS_CODES.FORBIDDEN
                });
            }
        }

        // Kiểm tra điều kiện subscription
        if (attributeConditions.includes(ATTRIBUTE_CONDITIONS.ACTIVE_SUBSCRIPTION) && user.tier === 'premium') {
            if (user.subscription.status !== 'active') {
                throw new ErrorWithStatus({
                    message: 'This feature requires an active premium subscription',
                    status: HTTP_STATUS_CODES.FORBIDDEN
                });
            }
        }

        // Lưu thông tin user vào request để sử dụng sau
        req.user = user;
        next();
    });
};

/**
 * Middleware kiểm tra quyền truy cập template dựa trên thuộc tính
 * @param action Hành động cần thực hiện
 */
export const checkTemplateAccess = (action: 'read' | 'update' | 'delete') => {
    return checkAttributeBasedAccess(
        'template',
        action,
        [
            ATTRIBUTE_CONDITIONS.OWN_RESOURCE,
            ATTRIBUTE_CONDITIONS.PREMIUM_TEMPLATE,
            action !== 'read' ? ATTRIBUTE_CONDITIONS.ACTIVE_SUBSCRIPTION : ''
        ].filter(Boolean)
    );
};

/**
 * Middleware kiểm tra quyền truy cập resume dựa trên thuộc tính
 * @param action Hành động cần thực hiện
 */
export const checkResumeAccess = (action: 'read' | 'update' | 'delete') => {
    return checkAttributeBasedAccess('resume', action, [ATTRIBUTE_CONDITIONS.OWN_RESOURCE]);
}; 