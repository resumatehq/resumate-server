import mongoose from 'mongoose'
import { envConfig } from '~/constants/config'

const featureConfigSchema = new mongoose.Schema(
  {
    planType: {
      type: String,
      enum: ['free', 'premium_monthly', 'premium_yearly'],
      required: true,
      unique: true
    },
    features: {
      resumes: {
        limit: { type: Number, required: true }
      },
      templates: {
        access: {
          type: String,
          enum: ['limited', 'all'],
          default: 'limited'
        }
      },
      sections: {
        standard: {
          type: [String],
          default: ['personal', 'summary', 'experience', 'education', 'skills']
        },
        premium: {
          type: [String],
          default: []
        },
        custom: {
          allowed: { type: Boolean, default: false },
          limit: { type: Number, default: 0 }
        }
      },
      ai: {
        allowed: { type: Boolean, default: false },
        dailyLimit: { type: Number, default: 0 },
        features: { type: [String], default: [] }
      },
      export: {
        formats: { type: [String], default: ['pdf'] },
        watermark: { type: Boolean, default: true },
        highQuality: { type: Boolean, default: false },
        dailyLimit: { type: Number, default: 5 }
      },
      sharing: {
        allowed: { type: Boolean, default: true },
        customDomain: { type: Boolean, default: false },
        password: { type: Boolean, default: false },
        analytics: { type: Boolean, default: false }
      },
      version: {
        history: { type: Boolean, default: false },
        limit: { type: Number, default: 0 }
      },
      api: {
        access: { type: Boolean, default: false },
        rateLimit: { type: Number, default: 0 }
      }
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
)

const FeatureConfig = mongoose.model(envConfig.dbFeatureConfigCollection, featureConfigSchema)
export default FeatureConfig
