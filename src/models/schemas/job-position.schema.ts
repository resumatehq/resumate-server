import { ObjectId } from 'mongodb'
import { envConfig } from "~/constants/config";

export interface IJobPosition {
    _id?: ObjectId;
    title: string;
    slug: string;
    description?: string;
    industry?: ObjectId;
    alternativeTitles: string[];
    seniority: 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | 'manager' | 'executive';
    keywords: string[];
    skills: {
        technical: string[];
        soft: string[];
    };
    responsibilities: string[];
    qualifications: string[];
    experience: {
        min: number;
        preferred?: number;
    };
    education: {
        level: 'high_school' | 'associate' | 'bachelor' | 'master' | 'phd';
        preferred?: string[];
    };
    certifications?: string[];
    salaryRange?: {
        min: number;
        max: number;
        currency: string;
        period: 'monthly' | 'yearly';
    };
    popularity: number;
    active: boolean;
    metadata: {
        source?: string;
        lastUpdatedBy?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

export const jobPositionCollection = envConfig.dbJobPositionCollection;

export default {
    collectionName: jobPositionCollection
};