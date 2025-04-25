import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'
import { EMAIL_REGEXP, NAME_REGEXP } from '~/helpers/regex'

export interface IUser {
  _id?: ObjectId
  username: string
  email: string
  password?: string
  googleId?: string
  date_of_birth: Date
  avatar_url?: string
  tier: 'free' | 'premium'
  subscription: {
    plan: 'free' | 'premium_monthly' | 'premium_yearly'
    startDate?: Date
    expiryDate?: Date
    status: 'active' | 'expired' | 'canceled'
    paymentId?: string
    paymentProvider: 'stripe' | 'paypal' | null
    autoRenew: boolean
  }
  permissions: {
    maxResumes: number
    maxCustomSections: number
    allowedTemplates: ObjectId[]
    allowedSections: string[]
    allowedFeatures: string[]
    allowedExportFormats: string[]
    aiRequests: {
      maxPerDay: number
      maxPerMonth: number
    }
  }
  usage: {
    createdResumes: number
    aiRequestsCount: number
    exportsCount: {
      pdf: number
      docx: number
      png: number
    }
    lastResumeCreatedAt?: Date
    premiumAccessLog: Array<{
      feature: string
      timestamp: Date
      ip: string
      userAgent: string
    }>
  }
  verify: 'unverified' | 'verified'
  role: 'admin' | 'user'
  created_at: Date
  updated_at: Date
  last_login_time: Date
}

// Default user structure for creating new users
export const defaultUserStructure: Partial<IUser> = {
  avatar_url: '',
  tier: 'free',
  subscription: {
    plan: 'free',
    status: 'active',
    paymentProvider: null,
    autoRenew: true
  },
  permissions: {
    maxResumes: 3,
    maxCustomSections: 0,
    allowedTemplates: [],
    allowedSections: ['education', 'experience', 'skills', 'summary'],
    allowedFeatures: ['basic_editor', 'basic_ai'],
    allowedExportFormats: ['pdf'],
    aiRequests: {
      maxPerDay: 10,
      maxPerMonth: 100
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
    premiumAccessLog: []
  },
  verify: 'unverified',
  role: 'user',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_time: new Date()
}

export const userCollection = envConfig.dbUserCollection

export default {
  collectionName: userCollection,
  validations: {
    username: {
      required: true,
      match: NAME_REGEXP
    },
    email: {
      required: true,
      match: EMAIL_REGEXP
    }
  }
}
