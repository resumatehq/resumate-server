import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import redisClient from "~/config/redis";
import { ITemplate } from "~/models/schemas/template.schema";
import { ObjectId } from "mongodb";
import databaseServices from "./database.service";

// Interface for pagination params
export interface PaginationParams {
    page?: number;
    limit?: number;
}

// Interface for template search and filter params
export interface TemplateQueryParams extends PaginationParams {
    category?: string;
    tier?: string;
    active?: boolean;
    sort?: string;
    search?: string;
    tags?: string[];
    minPopularity?: number;
}

// Interface for paginated response
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    }
}

class TemplateService {
    // Get templates with pagination, search and filtering
    async getAllTemplates(options: TemplateQueryParams = {}): Promise<PaginatedResponse<ITemplate>> {
        const {
            category,
            tier,
            active = true,
            sort = 'popularity',
            page = 1,
            limit = 10,
            search = '',
            tags = [],
            minPopularity = 0
        } = options;

        // Initialize Redis client
        const redis = await redisClient;

        // Create cache key based on query parameters
        const cacheKey = `templates:query:${JSON.stringify(options)}`;

        // Try to get from cache first
        const cachedTemplates = await redis.getObject<PaginatedResponse<ITemplate>>(cacheKey);
        if (cachedTemplates) {
            return cachedTemplates;
        }

        // Build query
        const query: any = { active };
        if (category) {
            query.category = category;
        }
        if (tier) {
            query.tier = tier;
        }
        if (tags.length > 0) {
            query.tags = { $in: tags };
        }
        if (minPopularity > 0) {
            query.popularity = { $gte: minPopularity };
        }

        // Add search functionality
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Count total documents for pagination
        const total = await databaseServices.templates.countDocuments(query);
        const pages = Math.ceil(total / limit);

        // Get templates from database with sorting and pagination
        const templates = await databaseServices.templates
            .find(query)
            .sort({ [sort === 'popularity' ? 'popularity' : sort]: -1 })
            .skip(skip)
            .limit(limit)
            .project({
                name: 1,
                category: 1,
                previewImage: 1,
                thumbnailImage: 1,
                description: 1,
                tags: 1,
                tier: 1,
                popularity: 1
            })
            .toArray() as unknown as ITemplate[];

        // Format response with pagination
        const result: PaginatedResponse<ITemplate> = {
            data: templates,
            pagination: {
                total,
                page,
                limit,
                pages
            }
        };

        // Cache result (expires in 1 hour)
        await redis.setObject(cacheKey, result as unknown as Record<string, unknown>, 3600);

        return result;
    }

    async getTemplateById(templateId: string) {
        // Initialize Redis client
        const redis = await redisClient;

        // Try to get from cache first
        const cacheKey = `template:${templateId}`;
        const cachedTemplate = await redis.getObject<ITemplate>(cacheKey);

        if (cachedTemplate) {
            return cachedTemplate;
        }

        // Get from database
        const template = await databaseServices.templates.findOne({
            _id: new ObjectId(templateId),
            active: true
        });

        if (!template) {
            throw new ErrorWithStatus({
                message: "Template not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Cache template (expires in 12 hours)
        await redis.setObject(cacheKey, template, 43200);

        return template;
    }

    async getTemplatesByTier(tier: 'free' | 'premium' | 'all', pagination: PaginationParams = {}) {
        const { page = 1, limit = 10 } = pagination;

        // Initialize Redis client
        const redis = await redisClient;

        // Try to get from cache first
        const cacheKey = `templates:tier:${tier}:page${page}:limit${limit}`;
        const cachedTemplates = await redis.getObject<PaginatedResponse<ITemplate>>(cacheKey);

        if (cachedTemplates) {
            return cachedTemplates;
        }

        // Build query
        let query: any = { active: true };

        if (tier !== 'all') {
            query.tier = tier;
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const total = await databaseServices.templates.countDocuments(query);
        const pages = Math.ceil(total / limit);

        // Get templates from database
        const templates = await databaseServices.templates
            .find(query)
            .sort({ popularity: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        // Format response with pagination
        const result: PaginatedResponse<ITemplate> = {
            data: templates,
            pagination: {
                total,
                page,
                limit,
                pages
            }
        };

        // Cache result (expires in 1 hour)
        await redis.setObject(cacheKey, result as unknown as Record<string, unknown>, 3600);

        return result;
    }

    // Search templates by keywords
    async searchTemplates(searchTerm: string, options: PaginationParams = {}): Promise<PaginatedResponse<ITemplate>> {
        const { page = 1, limit = 10 } = options;

        // Initialize Redis client
        const redis = await redisClient;

        // Try to get from cache first
        const cacheKey = `templates:search:${searchTerm}:page${page}:limit${limit}`;
        const cachedResult = await redis.getObject<PaginatedResponse<ITemplate>>(cacheKey);

        if (cachedResult) {
            return cachedResult;
        }
        // Build search query
        const query = {
            active: true,
            $or: [
                { name: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } },
                { tags: { $in: [new RegExp(searchTerm, 'i')] } }
            ]
        };

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const total = await databaseServices.templates.countDocuments(query);
        const pages = Math.ceil(total / limit);

        // Get search results
        const templates = await databaseServices.templates
            .find(query)
            .sort({ popularity: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        // Format response with pagination
        const result: PaginatedResponse<ITemplate> = {
            data: templates,
            pagination: {
                total,
                page,
                limit,
                pages
            }
        };

        // Cache result (expires in 30 minutes - search results may change more frequently)
        await redis.setObject(cacheKey, result as unknown as Record<string, unknown>, 1800);

        return result;
    }

    // Get templates by tags
    async getTemplatesByTags(tags: string[], options: PaginationParams = {}): Promise<PaginatedResponse<ITemplate>> {
        const { page = 1, limit = 10 } = options;

        // Initialize Redis client
        const redis = await redisClient;

        // Try to get from cache first
        const cacheKey = `templates:tags:${tags.join(',')}:page${page}:limit${limit}`;
        const cachedResult = await redis.getObject<PaginatedResponse<ITemplate>>(cacheKey);

        if (cachedResult) {
            return cachedResult;
        }

        // Build tags query
        const query = {
            active: true,
            tags: { $in: tags }
        };

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const total = await databaseServices.templates.countDocuments(query);
        const pages = Math.ceil(total / limit);

        // Get templates by tags
        const templates = await databaseServices.templates
            .find(query)
            .sort({ popularity: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        // Format response with pagination
        const result: PaginatedResponse<ITemplate> = {
            data: templates,
            pagination: {
                total,
                page,
                limit,
                pages
            }
        };

        // Cache result (expires in 1 hour)
        await redis.setObject(cacheKey, result as unknown as Record<string, unknown>, 3600);

        return result;
    }

    async createTemplate(templateData: Partial<ITemplate>) {
        // Validate required fields
        if (!templateData.name || !templateData.category || !templateData.previewImage || !templateData.sections || !templateData.styling) {
            throw new ErrorWithStatus({
                message: "Name, category, previewImage, sections, and styling are required",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Check if template with same name already exists
        const existingTemplate = await databaseServices.templates.findOne({ name: templateData.name });
        if (existingTemplate) {
            throw new ErrorWithStatus({
                message: "Template with this name already exists",
                status: HTTP_STATUS_CODES.CONFLICT
            });
        }

        // Create new template
        const now = new Date();
        const newTemplate: ITemplate = {
            name: templateData.name!,
            category: templateData.category!,
            previewImage: templateData.previewImage!,
            thumbnailImage: templateData.thumbnailImage || '',
            description: templateData.description || '',
            tags: templateData.tags || [],
            sections: templateData.sections!,
            styling: templateData.styling!,
            tier: templateData.tier || 'premium',
            popularity: templateData.popularity || 0,
            active: templateData.active !== undefined ? templateData.active : true,
            createdAt: now,
            updatedAt: now
        };

        // Insert into database
        const result = await databaseServices.templates.insertOne(newTemplate);
        const savedTemplate = { ...newTemplate, _id: result.insertedId };

        // Clear all template cache
        await this.clearTemplateCache();

        return savedTemplate;
    }

    async updateTemplate(templateId: string, updates: Partial<ITemplate>) {
        // Find template
        const template = await databaseServices.templates.findOne({ _id: new ObjectId(templateId) });

        if (!template) {
            throw new ErrorWithStatus({
                message: "Template not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Update timestamp
        updates.updatedAt = new Date();

        // Update template
        await databaseServices.templates.updateOne(
            { _id: new ObjectId(templateId) },
            { $set: updates }
        );

        // Get updated template
        const updatedTemplate = await databaseServices.templates.findOne({ _id: new ObjectId(templateId) });

        // Initialize Redis client
        const redis = await redisClient;

        // Clear specific template cache
        await redis.del(`template:${templateId}`);

        // Clear all template lists cache
        await this.clearTemplateCache();

        return updatedTemplate;
    }

    async deleteTemplate(templateId: string) {
        // Find template
        const template = await databaseServices.templates.findOne({ _id: new ObjectId(templateId) });

        if (!template) {
            throw new ErrorWithStatus({
                message: "Template not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Check if the template is being used by any resume
        // This would typically require a Resume service check

        // Instead of deleting, set active to false
        await databaseServices.templates.updateOne(
            { _id: new ObjectId(templateId) },
            { $set: { active: false, updatedAt: new Date() } }
        );

        // Initialize Redis client
        const redis = await redisClient;

        // Clear template cache
        await redis.del(`template:${templateId}`);

        // Clear template lists cache
        await this.clearTemplateCache();

        return { success: true };
    }

    async incrementTemplatePopularity(templateId: string) {
        // Update popularity counter
        await databaseServices.templates.updateOne(
            { _id: new ObjectId(templateId) },
            {
                $inc: { popularity: 1 },
                $set: { updatedAt: new Date() }
            }
        );

        // Initialize Redis client
        const redis = await redisClient;

        // Clear template cache
        await redis.del(`template:${templateId}`);

        return { success: true };
    }

    // Helper method to clear all template-related caches
    private async clearTemplateCache() {
        // Initialize Redis client
        const redis = await redisClient;

        const allKeys = await redis.keys('template:*');
        const listKeys = await redis.keys('templates:*');

        // Delete all template keys
        const keys = [...allKeys, ...listKeys];
        if (keys.length > 0) {
            await Promise.all(keys.map(key => redis.del(key)));
        }
    }
}

const templateService = new TemplateService();
export default templateService; 