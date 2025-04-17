import { Schema, model, Document, Types } from 'mongoose'
import { envConfig } from '~/constants/config'
import { EMAIL_REGEXP, NAME_REGEXP } from '~/helpers/regex'
import crypto from 'crypto'

const apiKeySchema = new Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  permissions: {
    type: [String],
    enum: ['read', 'write', 'delete', 'export', 'share', 'ai'],
    default: ['read']
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  lastUsed: { type: Date, default: null },
  ipRestrictions: [String],
  active: { type: Boolean, default: true }
})

const userSchema = new Schema({
  username: {
    type: String,
    trim: true,
    unique: true,
    match: NAME_REGEXP,
    required: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    unique: true,
    required: true,
    match: EMAIL_REGEXP,
    index: true
  },
  password: {
    type: String,
    required: function (this: any) {
      return !this.googleId
    }
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  date_of_birth: { type: Date, default: Date.now },
  avatar_url: {
    type: String,
    default: ''
  },
  accountType: {
    type: String,
    enum: ['regular', 'premium'],
    default: 'regular'
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'premium_monthly', 'premium_yearly'],
      default: 'free'
    },
    startDate: Date,
    expiryDate: Date,
    status: {
      type: String,
      enum: ['active', 'expired', 'canceled'],
      default: 'active'
    },
    paymentId: String,
    paymentProvider: {
      type: String,
      enum: ['stripe', 'paypal', null],
      default: null
    }
  },
  permissions: {
    maxResumes: { type: Number, default: 3 },
    maxCustomSections: { type: Number, default: 0 },
    allowedTemplates: [{ type: Types.ObjectId, ref: envConfig.dbTemplateCollection }],
    // allowedSections: [String],
    allowedFeatures: [String],
    allowedExportFormats: {
      type: [String],
      enum: ['pdf', 'docx', 'png', 'json'],
      default: ['pdf']
    }
  },
  usage: {
    createdResumes: { type: Number, default: 0 },
    aiRequestsCount: { type: Number, default: 0 },
    exportsCount: {
      pdf: { type: Number, default: 0 },
      docx: { type: Number, default: 0 },
      png: { type: Number, default: 0 }
    },
    lastResumeCreatedAt: Date
  },
  verify: {
    type: String,
    enum: ['unverified', 'verified'],
    default: 'unverified'
  },
  apiKeys: [apiKeySchema],
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_login_time: { type: Date, default: Date.now }
})

userSchema.methods.generateApiKey = function (name, permissions = ['read'], expiry = null) {
  const apiKey = crypto.randomBytes(32).toString('hex')
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex')
  this.apiKeys.push({ key: hashedKey, name, permissions, createdAt: Date.now(), expiresAt: expiry, active: true })
  return apiKey
}

userSchema.statics.verifyApiKey = async function (providedKey) {
  const hashedKey = crypto.createHash('sha256').update(providedKey).digest('hex')
  const user = await this.findOne({
    'apiKeys.key': hashedKey,
    'apiKeys.active': true,
    $or: [{ 'apiKeys.expiresAt': null }, { 'apiKeys.expiresAt': { $gt: new Date() } }]
  })

  if (!user) return null
  const apiKey = user.apiKeys.find((key) => key.key === hashedKey)

  await this.updateOne({ _id: user._id, 'apiKeys.key': hashedKey }, { $set: { 'apiKeys.$.lastUsed': new Date() } })

  return { userId: user._id, permissions: apiKey.permissions }
}

export interface IUser extends Document {
  _id: Types.ObjectId
  username: string
  email: string
  password?: string // Mật khẩu không bắt buộc nếu đăng nhập bằng Google
  googleId?: string // ID từ Google
  date_of_birth: Date
  avatar_url?: string
  accountType: 'regular' | 'premium'
  subscription: {
    plan: 'free' | 'premium_monthly' | 'premium_yearly'
    startDate: Date
    expiryDate: Date
    status: 'active' | 'expired' | 'canceled'
    paymentId: string
    paymentProvider: 'stripe' | 'paypal' | null
  }
  permissions: {
    maxResumes: number
    maxCustomSections: number
    allowedTemplates: Types.ObjectId[]
    allowedFeatures: string[]
    allowedExportFormats: string[]
  }
  usage: {
    createdResumes: number
    aiRequestsCount: number
    exportsCount: {
      pdf: number
      docx: number
      png: number
    }
    lastResumeCreatedAt: Date
  }
  apiKeys: {
    key: string
    name: string
    permissions: string[]
    createdAt: Date
    expiresAt: Date | null
    lastUsed: Date | null
    ipRestrictions: string[]
    active: boolean
  }[]
  verify: string
  role: string
  created_at: Date
  updated_at: Date
  last_login_time: Date
}

const User = model<IUser>(envConfig.dbUserCollection, userSchema)

export default User
