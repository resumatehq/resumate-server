import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'
import { FEATURES } from '~/config/roles'

export interface IFeatureConfig {
  _id: ObjectId;
  planType: 'free' | 'premium_monthly' | 'premium_yearly';
  features: {
    resumes: {
      limit: number;
    };
    templates: {
      access: 'limited' | 'all';
      allowedCategories: string[];
    };
    sections: {
      standard: string[];
      premium: string[];
      custom?: {
        allowed: boolean;
        limit: number;
      };
    };
    ai: {
      allowed: boolean;
      dailyLimit: number;
      monthlyLimit: number;
      features: string[]; // Từ FEATURES.BASIC_AI hoặc FEATURES.ADVANCED_AI
    };
    export: {
      formats: ('pdf' | 'docx' | 'png' | 'json')[];
      watermark: boolean;
      highQuality: boolean;
    };
    sharing: {
      allowed: boolean;
      customDomain: boolean;
      password: boolean;
      analytics: boolean;
    };
    support: {
      type: 'basic' | 'priority';
      responseTime: number; // Giờ
    };
    accessLog: {
      enabled: boolean;
      retentionDays: number;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

export const featureConfigCollection = envConfig.dbFeatureConfigCollection