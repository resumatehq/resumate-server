import mongoose from 'mongoose'
import { envConfig } from '~/constants/config'

const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },
    category: {
      type: String,
      enum: ['professional', 'creative', 'simple', 'modern', 'academic', 'executive'],
      required: true
    },
    previewImage: {
      type: String,
      required: true
    },
    thumbnailImage: String,
    description: String,
    tags: [String],
    structure: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    defaultSections: [
      {
        type: String,
        enum: [
          'personal',
          'summary',
          'experience',
          'education',
          'skills',
          'projects',
          'certifications',
          'awards',
          'publications',
          'languages',
          'interests',
          'references'
        ]
      }
    ],
    styling: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    accountTier: {
      type: String,
      enum: ['free', 'premium', 'all'],
      required: true,
      default: 'premium'
    },
    popularity: {
      type: Number,
      default: 0
    },
    active: {
      type: Boolean,
      default: true
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

templateSchema.index({ accountTier: 1 })
templateSchema.index({ category: 1 })
templateSchema.index({ popularity: -1 })
templateSchema.index({ active: 1 })

const Template = mongoose.model(envConfig.dbTemplateCollection, templateSchema)
export default Template
