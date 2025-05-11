import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'

// Defines all possible section types in a resume
export type SectionType = 'personal' | 'summary' | 'education' | 'experience' | 'skills' | 'projects' |
  'references' | 'certifications' | 'awards' | 'publications' | 'languages' | 'interests' | 'volunteer' | 'custom';

// Base interface for section content - each section type will extend this
export interface ISectionContent {
  [key: string]: any;
}

// Personal info section content structure (mandatory for all resumes)
export interface IPersonalInfoContent extends ISectionContent {
  fullName: string;
  jobTilte: string;
  email: string;
  phone: string;
  location: string;
  website?: string;
  profilePicture?: string;
  socialLinks?: {
    linkedin?: string;
    github?: string;
    twitter?: string;
    [key: string]: string | undefined;
  };
  professionalSummary?: string;
}

// Education section content structure
export interface IEducationContent extends ISectionContent {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: Date;
  endDate?: Date | null; // null means "present"
  location?: string;
  description?: string;
  achievements?: string[];
  gpa?: string;
}

// Work experience section content structure
export interface IWorkExperienceContent extends ISectionContent {
  company: string;
  position: string;
  startDate?: Date;
  endDate?: Date | null; // null means "present" 
  location?: string;
  description?: string;
  achievements?: string[];
  technologies?: string[];
}

// Skills section content structure
interface ITechnicalSkillCategory {
  category: string;
  skills: string[];
}

interface ILanguageSkill {
  language: string;
  proficiency: string;
}

export interface ISkillContent extends ISectionContent {
  technical: ITechnicalSkillCategory[];
  soft: string[];
  languages: ILanguageSkill[];
}
// Project section content structure
export interface IProjectContent extends ISectionContent {
  title: string;
  description?: string;
  role?: string;
  startDate?: Date;
  endDate?: Date | null;
  technologies?: string[];
  url?: string;
  achievements?: string[];
}

// Certification section content structure
export interface ICertificationContent extends ISectionContent {
  name: string;
  issuingOrganization: string;
  issueDate: Date;
  credentialUrl?: string;
  description?: string;
}

// Award section content structure
export interface IAwardContent extends ISectionContent {
  title: string;
  issuingOrganization: string;
  dateReceived: Date;
  description?: string;
}

// Custom section content structure (for user-defined sections)
export interface ICustomSectionContent extends ISectionContent {
  title: string;
  content: string | Record<string, any>;
}

export interface IResumeSection {
  _id?: ObjectId;
  type: SectionType;
  title: string;
  enabled: boolean;
  order: number;
  content: ISectionContent[];
  settings: {
    visibility: 'public' | 'private';
    layout: 'standard' | 'compact' | 'detailed' | 'custom';
    styling: Record<string, any>;
  };
}

export interface IResume {
  _id?: ObjectId;
  userId: ObjectId;
  title: string;
  targetPosition?: string;
  industry?: string;
  templateId: ObjectId;
  language: string;
  sections: IResumeSection[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastPublishedAt?: Date;
    currentVersion: number;
    isPublished: boolean;
    lastAutosaved?: Date;
    shareableLink?: string;
    sharingOptions: {
      password?: string;
      expiresAt?: Date;
      allowDownload: boolean;
      allowFeedback: boolean;
      allowEmbed?: boolean;
    };
    viewCount: number;
    downloadCount: number;
  };
  atsScore?: number;
  keywords: string[];
  aiSuggestions: Array<{
    sectionId: ObjectId;
    suggestions: string[];
    accepted?: boolean;
    createdAt: Date;
  }>;
  analytics: {
    lastModified?: Date;
    modificationCount: number;
    exportHistory: Array<{
      format: string;
      timestamp: Date;
    }>;
    shareViews: Array<{
      timestamp: Date;
      ipHash?: string;
      userAgent?: string;
      referrer?: string;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const resumeCollection = envConfig.dbResumeCollection

