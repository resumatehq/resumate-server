import { Request, Response } from "express";
import { TokenPayload } from "~/models/requests/user.request";
import templateService, { TemplateQueryParams } from "~/services/template.service";
import { OK } from "~/core/succes.response";
import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";

class TemplateController {
    getAllTemplates = async (req: Request, res: Response) => {
        const {
            category,
            tier,
            active,
            sort,
            page,
            limit,
            search,
            tags,
            minPopularity
        } = req.query;

        // Build query parameters
        const queryParams: TemplateQueryParams = {
            category: category as string,
            tier: tier as string,
            active: active === 'true',
            sort: sort as string,
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined,
            search: search as string,
            tags: tags ? (tags as string).split(',') : [],
            minPopularity: minPopularity ? parseInt(minPopularity as string) : undefined
        };

        const result = await templateService.getAllTemplates(queryParams);

        new OK({
            message: "Templates retrieved successfully",
            data: result
        }).send(res);
    };

    getTemplateById = async (req: Request, res: Response) => {
        const { id } = req.params;

        const template = await templateService.getTemplateById(id);

        new OK({
            message: "Template retrieved successfully",
            data: { template }
        }).send(res);
    };

    getTemplatesByTier = async (req: Request, res: Response) => {
        const { tier } = req.params;
        const { page, limit } = req.query;

        if (!['free', 'premium', 'all'].includes(tier)) {
            throw new ErrorWithStatus({
                message: "Tier must be one of: free, premium, all",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const pagination = {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined
        };

        const result = await templateService.getTemplatesByTier(tier as 'free' | 'premium' | 'all', pagination);

        new OK({
            message: `${tier.charAt(0).toUpperCase() + tier.slice(1)} templates retrieved successfully`,
            data: result
        }).send(res);
    };

    // Search templates by keyword
    searchTemplates = async (req: Request, res: Response) => {
        const { q, page, limit } = req.query;

        if (!q) {
            throw new ErrorWithStatus({
                message: "Search query is required",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const pagination = {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined
        };

        const result = await templateService.searchTemplates(q as string, pagination);

        new OK({
            message: "Search results retrieved successfully",
            data: result
        }).send(res);
    };

    // Get templates by tags
    getTemplatesByTags = async (req: Request, res: Response) => {
        const { tags } = req.params;
        const { page, limit } = req.query;

        if (!tags) {
            throw new ErrorWithStatus({
                message: "Tags are required",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const tagList = tags.split(',');
        const pagination = {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined
        };

        const result = await templateService.getTemplatesByTags(tagList, pagination);

        new OK({
            message: "Templates by tags retrieved successfully",
            data: result
        }).send(res);
    };

    // User accessible templates based on their subscription
    getUserAccessibleTemplates = async (req: Request, res: Response) => {
        const { user_id, role, subscription } = req.decoded_authorization as TokenPayload;
        const { page, limit } = req.query;

        // Users with premium subscription can access all templates
        // Regular users can only access free templates
        const tier = subscription?.includes('premium') ? 'all' : 'free';

        const pagination = {
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined
        };

        const result = await templateService.getTemplatesByTier(tier as 'free' | 'premium' | 'all', pagination);

        new OK({
            message: "User accessible templates retrieved successfully",
            data: result
        }).send(res);
    };

    // Admin-only endpoints
    createTemplate = async (req: Request, res: Response) => {
        const { tier } = req.decoded_authorization as TokenPayload;

        // Verify admin role
        if (tier !== 'admin') {
            throw new ErrorWithStatus({
                message: "Only administrators can create templates",
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        const templateData = req.body;

        const template = await templateService.createTemplate(templateData);

        new OK({
            message: "Template created successfully",
            data: { template }
        }).send(res);
    };

    updateTemplate = async (req: Request, res: Response) => {
        const { user_id, role } = req.decoded_authorization as TokenPayload;
        const { id } = req.params;

        // Verify admin role
        if (role !== 'admin') {
            throw new ErrorWithStatus({
                message: "Only administrators can update templates",
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        const updates = req.body;

        const template = await templateService.updateTemplate(id, updates);

        new OK({
            message: "Template updated successfully",
            data: { template }
        }).send(res);
    };

    deleteTemplate = async (req: Request, res: Response) => {
        const { user_id, role } = req.decoded_authorization as TokenPayload;
        const { id } = req.params;

        // Verify admin role
        if (role !== 'admin') {
            throw new ErrorWithStatus({
                message: "Only administrators can delete templates",
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        await templateService.deleteTemplate(id);

        new OK({
            message: "Template deleted successfully",
            data: null
        }).send(res);
    };

    // Used when a user selects a template for their resume
    incrementTemplatePopularity = async (req: Request, res: Response) => {
        const { id } = req.params;

        await templateService.incrementTemplatePopularity(id);

        new OK({
            message: "Template popularity incremented",
            data: null
        }).send(res);
    };

    /**
     * Lấy danh sách mẫu template cơ bản (free)
     */
    getBasicTemplates = async (req: Request, res: Response) => {
        try {
            const { page, limit } = req.query;

            const pagination = {
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined
            };

            const result = await templateService.getTemplatesByTier('free', pagination);

            new OK({
                message: 'Basic templates retrieved successfully',
                data: result
            }).send(res);
        } catch (error) {
            throw new ErrorWithStatus({
                message: 'Failed to get basic templates',
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
            });
        }
    }

    /**
     * Lấy danh sách mẫu template cao cấp (premium)
     */
    getPremiumTemplates = async (req: Request, res: Response) => {
        try {
            const { page, limit } = req.query;

            const pagination = {
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined
            };

            const result = await templateService.getTemplatesByTier('premium', pagination);

            new OK({
                message: 'Premium templates retrieved successfully',
                data: result
            }).send(res);
        } catch (error) {
            throw new ErrorWithStatus({
                message: 'Failed to get premium templates',
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
            });
        }
    }
}

export default new TemplateController(); 