import mongoose from 'mongoose'
import crypto from 'crypto'
import { envConfig } from '~/constants/config'

const sectionSchema = new mongoose.Schema(
  {
    type: {
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
        'references',
        'custom'
      ],
      required: true
    },
    title: {
      type: String,
      default: function () {
        const titles = {
          personal: 'Personal Information',
          summary: 'Professional Summary',
          experience: 'Work Experience',
          education: 'Education',
          skills: 'Skills',
          projects: 'Projects',
          certifications: 'Certifications',
          awards: 'Awards & Honors',
          publications: 'Publications',
          languages: 'Languages',
          interests: 'Interests',
          references: 'References'
        }
        return titles[this.type] || 'Custom Section'
      }
    },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    settings: {
      visibility: { type: String, enum: ['public', 'private'], default: 'public' },
      layout: { type: String, enum: ['standard', 'compact', 'detailed', 'custom'], default: 'standard' },
      styling: { type: mongoose.Schema.Types.Mixed, default: {} }
    }
  },
  { _id: true }
)

const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: envConfig.dbUserCollection,
      required: true
    },
    title: {
      type: String,
      required: true,
      default: 'Untitled Resume'
    },
    targetPosition: String,
    industry: String,
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      required: true
    },
    language: {
      type: String,
      default: 'en'
    },
    sections: [sectionSchema],
    metadata: {
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      lastPublishedAt: Date,
      currentVersion: { type: Number, default: 1 },
      isPublished: { type: Boolean, default: false },
      shareableLink: String,
      sharingOptions: {
        password: String,
        expiresAt: Date,
        allowDownload: { type: Boolean, default: false },
        allowFeedback: { type: Boolean, default: false }
      },
      viewCount: { type: Number, default: 0 },
      downloadCount: { type: Number, default: 0 }
    },
    atsScore: { type: Number, min: 0, max: 100 },
    keywords: [String],
    aiSuggestions: [
      {
        sectionId: mongoose.Schema.Types.ObjectId,
        suggestions: [String],
        accepted: Boolean,
        createdAt: { type: Date, default: Date.now }
      }
    ],
    analytics: {
      lastModified: Date,
      modificationCount: { type: Number, default: 0 },
      exportHistory: [
        {
          format: String,
          timestamp: Date
        }
      ],
      shareViews: [
        {
          timestamp: Date,
          ipHash: String
        }
      ]
    }
  },
  { timestamps: true }
)

resumeSchema.methods.generateShareableLink = function () {
  const uniqueString = crypto.randomBytes(16).toString('hex')
  this.metadata.shareableLink = uniqueString
  return uniqueString
}

resumeSchema.methods.setPassword = function (password) {
  if (!password) {
    this.metadata.sharingOptions.password = null
    return
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  this.metadata.sharingOptions.password = `${salt}:${hash}`
}

resumeSchema.methods.verifyPassword = function (password) {
  if (!this.metadata.sharingOptions.password) return true

  const [salt, storedHash] = this.metadata.sharingOptions.password.split(':')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')

  return storedHash === hash
}

resumeSchema.methods.incrementVersion = function () {
  this.metadata.currentVersion += 1
  this.metadata.updatedAt = new Date()
  return this.metadata.currentVersion
}

resumeSchema.methods.publish = function () {
  this.metadata.isPublished = true
  this.metadata.lastPublishedAt = new Date()
}

resumeSchema.statics.findByShareableLink = function (link) {
  return this.findOne({ 'metadata.shareableLink': link })
}

resumeSchema.statics.getRecentlyModified = function (userId, limit = 5) {
  return this.find({ userId }).sort({ 'metadata.updatedAt': -1 }).limit(limit)
}

// resumeSchema.index({ userId: 1 })
// resumeSchema.index({ 'metadata.shareableLink': 1 })
// resumeSchema.index({ 'metadata.updatedAt': -1 })
// resumeSchema.index({ templateId: 1 })
// resumeSchema.index({ keywords: 1 })

const Resume = mongoose.model(envConfig.dbResumeCollection, resumeSchema)
export default Resume
