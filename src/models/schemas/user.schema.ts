import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'
import { EMAIL_REGEXP, NAME_REGEXP } from '~/helpers/regex'
import { SectionType } from './template.schema'

export type UserTier = 'free' | 'premium' | 'admin';
export type UserPlan = 'free' | 'premium_monthly' | 'premium_yearly';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'expired' | 'trial';
export type userVerificationStatus = 'unverified' | 'verified'
export interface IUserPermissions {
  maxResumes: number;
  maxCustomSections: number;
  allowedSections: SectionType[];
  allowedFeatures: string[];
  allowedExportFormats: ('pdf' | 'docx' | 'png' | 'json')[];
  allowedTemplates?: ObjectId[];
  aiRequests: {
    maxPerDay: number;
    maxPerMonth: number;
    usedToday?: number;
    usedThisMonth?: number;
    lastResetDay?: Date;
    lastResetMonth?: Date;
  };
}

export interface IUserSubscription {
  plan: UserPlan;
  status: SubscriptionStatus;
  startDate?: Date;
  endDate?: Date;
  expiryDate?: Date;
  trialEndsAt?: Date;
  cancelledAt?: Date;
  paymentMethod?: string;
  paymentId?: string;
  paymentProvider?: 'stripe' | 'paypal' | null;
  autoRenew: boolean;
}

export interface IUserUsage {
  createdResumes: number
  aiRequestsCount: number
  exportsCount: {
    pdf: number
    docx: number
    png: number
  }
  lastResumeCreatedAt?: Date
}

export interface IUser {
  _id?: ObjectId
  username: string
  email: string
  password?: string
  googleId?: string
  date_of_birth: Date
  avatar_url?: string
  tier: UserTier;
  subscription: IUserSubscription;
  permissions: IUserPermissions;
  bio?: string;
  industry?: string;
  experience?: string;
  location?: string;
  phone?: string;
  social_links?: {
    linkedin?: string;
    github?: string;
    twitter?: string;
    website?: string;
  };
  analytics: {
    resumesCreated: number;
    lastActive: Date;
  };
  usage: IUserUsage,
  verify: userVerificationStatus
  created_at: Date
  updated_at: Date
  last_login_time: Date
  // premiumAccessLog: Array<{
  //   feature: string
  //   timestamp: Date
  //   ip: string
  //   userAgent: string
  // }>
}

export const defaultUserStructure: Partial<IUser> = {
  tier: 'free',
  subscription: {
    plan: 'free',
    status: 'active',
    paymentProvider: null,
    autoRenew: true,
    // startDate: undefined,
    // endDate: undefined,
    // expiryDate: undefined,
    // trialEndsAt: undefined,
    // cancelledAt: undefined,
    // paymentMethod: undefined,
    // paymentId: undefined
  },
  permissions: {
    maxResumes: 3,
    maxCustomSections: 0,
    allowedSections: ['education', 'experience', 'skills', 'summary'],
    allowedFeatures: ['basic_editor', 'basic_ai'],
    allowedExportFormats: ['pdf'],
    aiRequests: {
      maxPerDay: 10,
      maxPerMonth: 100,
      usedToday: 0,
      usedThisMonth: 0,
      lastResetDay: new Date(),
      lastResetMonth: new Date()
    }
  },
  usage: {
    createdResumes: 0,
    aiRequestsCount: 0,
    exportsCount: {
      pdf: 0,
      docx: 0,
      png: 0
    },
    lastResumeCreatedAt: undefined
  },
  analytics: {
    resumesCreated: 0,
    lastActive: new Date()
  },
  bio: undefined,
  industry: undefined,
  experience: undefined,
  location: undefined,
  phone: undefined,
  social_links: {
    linkedin: undefined,
    github: undefined,
    twitter: undefined,
    website: undefined
  },
  googleId: undefined,
  avatar_url: undefined,
  verify: 'unverified',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_time: new Date()
}

export const userCollection = envConfig.dbUserCollection
