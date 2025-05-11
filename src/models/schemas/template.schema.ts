import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'
import { SectionType } from './resume.schema';

export type TemplateCategory = 'professional' | 'creative' | 'simple' | 'modern' | 'academic' | 'executive';
// Section configuration for templates
export interface ITemplateSection {
  type: SectionType;
  title: string;
  description?: string;
  required?: boolean;
  defaultEnabled: boolean;
  defaultOrder: number;
  layout: 'standard' | 'compact' | 'detailed' | 'custom';
  allowedFields: string[];
  styling?: Record<string, any>;
}

export interface ITemplate {
  _id?: ObjectId;
  name: string;
  category: TemplateCategory;
  previewImage: string;
  thumbnailImage?: string;
  description?: string;
  tags: string[];

  // Sections configuration
  sections: ITemplateSection[];

  // General styling for the template
  styling: {
    fonts: {
      primary: string;
      secondary?: string;
    };
    colors: {
      primary: string;
      secondary?: string;
      accent?: string;
      background?: string;
      text: string;
    };
    spacing: Record<string, any>;
    layout: Record<string, any>;
  };

  // Access control
  tier: 'free' | 'premium';
  popularity: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const templateCollection = envConfig.dbTemplateCollection;
