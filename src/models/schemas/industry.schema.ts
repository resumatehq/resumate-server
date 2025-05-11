import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config';

export interface IIndustry {
    _id?: ObjectId;
    name: string;
    slug: string;
    description?: string;
    keywords: string[]; // Từ khóa chung về ngành
    resumeKeywords: string[]; // Từ khóa dành riêng cho CV
    jobTitles: string[]; // Các vị trí công việc phổ biến trong ngành
    skills: string[]; // Kỹ năng phổ biến cho ngành
    certificates: string[]; // Chứng chỉ liên quan đến ngành
    growthTrend?: 'growing' | 'stable' | 'declining'; // Xu hướng tăng trưởng
    salaryRange?: {
        min: number;
        max: number;
        currency: string;
        period: 'monthly' | 'yearly';
    };
    active: boolean;
    popularity: number; // Mức độ phổ biến (để sắp xếp)
    relatedIndustries: string[]; // Ngành nghề liên quan
    createdAt: Date;
    updatedAt: Date;
}

export const industryCollection = envConfig.dbIndustryCollection;

export default {
    collectionName: industryCollection
};
