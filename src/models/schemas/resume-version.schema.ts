import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'
import { IResumeSection } from './resume.schema'

export interface IResumeVersion {
  _id?: ObjectId;
  resumeId: ObjectId;
  userId: ObjectId;
  versionNumber: number;
  versionName?: string;
  content: {
    title?: string;
    targetPosition?: string;
    industry?: string;
    templateId?: ObjectId;
    sections: IResumeSection[];
    metadata?: Record<string, any>;
  };
  changes: {
    type: 'add' | 'update' | 'delete' | 'reorder';
    sectionType?: string;
    sectionId?: string;
    description: string;
  }[];
  comment?: string;
  autoSaved: boolean;
  createdAt: Date;
  metrics?: {
    wordCount: number;
    characterCount: number;
    sectionCount: number;
    estimatedReadTime: number;
  };
  aiGenerated?: boolean;
  atsScore?: number;
  status: 'draft' | 'published' | 'archived';
}

export const VERSION_LIMITS = {
  FREE: 3,
  PREMIUM: 20
};

export const resumeVersionCollection = envConfig.dbResumeVersionCollection

export default {
  collectionName: resumeVersionCollection
};

