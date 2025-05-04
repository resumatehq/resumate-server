// services/cacheService.ts

import redis from "~/config/redis";
import { ITemplate } from "~/models/schemas/template.schema";

interface CacheServiceOptions {
    defaultTTL?: number;
}

type FetchFunction<T> = () => Promise<T>;

interface UserPermissions {
    maxResumes: number;
    maxCustomSections: number;
    allowedTemplates: string[];
    allowedSections: string[];
    allowedFeatures: string[];
    allowedExportFormats: string[];
}

interface AutosaveData {
    content: Record<string, unknown>;
    lastSaved: Date;
}

class CacheService {
    private defaultTTL: number;

    constructor(options: CacheServiceOptions = {}) {
        this.defaultTTL = options.defaultTTL || 900;
    }

    // Tạo cache key
    private createKey(prefix: string, id: string): string {
        return `${prefix}:${id}`;
    }

    // Lấy dữ liệu từ cache
    async get<T>(prefix: string, id: string): Promise<T | null> {
        const key = this.createKey(prefix, id);
        const client = await redis;
        const result = await client.getObject<T>(key);
        return result as T | null;
    }

    // Lưu dữ liệu vào cache
    async set<T>(prefix: string, id: string, data: T, ttl?: number): Promise<boolean> {
        const key = this.createKey(prefix, id);
        const client = await redis;
        return client.setObject(key, data as Record<string, unknown>, ttl || this.defaultTTL);
    }

    // Xóa dữ liệu từ cache
    async delete(prefix: string, id: string): Promise<number> {
        const key = this.createKey(prefix, id);
        const client = await redis;
        return client.del(key);
    }

    // Xóa nhiều dữ liệu từ cache
    async deletePattern(pattern: string): Promise<number> {
        const client = await redis;
        const keys = await client.keys(pattern);
        if (keys.length === 0) return 0;

        let deleted = 0;
        for (const key of keys) {
            deleted += await client.del(key);
        }
        return deleted;
    }

    // Cache wrapper cho các hàm
    async wrap<T>(prefix: string, id: string, fetchFn: FetchFunction<T>, ttl?: number): Promise<T> {
        const cachedData = await this.get<T>(prefix, id);
        if (cachedData) return cachedData;

        const data = await fetchFn();
        if (data) await this.set(prefix, id, data, ttl);

        return data;
    }

    // Cache các template phổ biến
    async cachePopularTemplates(templates: ITemplate[], ttl: number = 3600): Promise<boolean> {
        return this.set('templates', 'popular', templates, ttl);
    }

    // Lấy các template phổ biến từ cache
    async getPopularTemplates(): Promise<ITemplate[] | null> {
        return this.get<ITemplate[]>('templates', 'popular');
    }

    // Cache thông tin người dùng
    async cacheUserPermissions(userId: string, permissions: UserPermissions, ttl: number = 900): Promise<boolean> {
        return this.set('permissions', userId, permissions, ttl);
    }

    // Lấy thông tin người dùng từ cache
    async getUserPermissions(userId: string): Promise<UserPermissions | null> {
        return this.get<UserPermissions>('permissions', userId);
    }

    // Cache autosave data
    async saveAutosaveData(resumeId: string, userId: string, data: AutosaveData, ttl: number = 3600): Promise<boolean> {
        const key = `autosave:${userId}:${resumeId}`;
        const client = await redis;
        return client.setObject(key, data as unknown as Record<string, unknown>, ttl);
    }

    // Lấy autosave data
    async getAutosaveData(resumeId: string, userId: string): Promise<AutosaveData | null> {
        const key = `autosave:${userId}:${resumeId}`;
        const client = await redis;
        const result = await client.getObject<AutosaveData>(key);
        return result as AutosaveData | null;
    }

    // Xóa autosave data
    async deleteAutosaveData(resumeId: string, userId: string): Promise<number> {
        const key = `autosave:${userId}:${resumeId}`;
        const client = await redis;
        return client.del(key);
    }
}

const cacheService = new CacheService();
export default cacheService