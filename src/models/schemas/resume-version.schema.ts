import mongoose from 'mongoose'
import { envConfig } from '~/constants/config'

const resumeVersionSchema = new mongoose.Schema({
  resumeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: envConfig.dbResumeCollection,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: envConfig.dbUserCollection,
    required: true
  },
  versionNumber: {
    type: Number,
    required: true
  },
  content: {
    title: String,
    targetPosition: String,
    industry: String,
    templateId: mongoose.Schema.Types.ObjectId,
    sections: [],
    metadata: {}
  },
  comment: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// resumeVersionSchema.index({ resumeId: 1, versionNumber: -1 })
// resumeVersionSchema.index({ userId: 1 })

const ResumeVersion = mongoose.model(envConfig.dbResumeVersionCollection, resumeVersionSchema)
export default ResumeVersion
