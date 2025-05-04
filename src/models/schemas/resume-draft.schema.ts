import { ObjectId } from 'mongodb'
import { envConfig } from '~/constants/config'
import { IResumeSection } from './resume.schema'

export interface IResumeDraft {
    _id?: ObjectId;
    resumeId: ObjectId;
    userId: ObjectId;
    lastModified: Date;
    title?: string;
    targetPosition?: string;
    industry?: string;
    sections: Partial<IResumeSection>[];
    unsavedChanges: boolean;
    draftData: Record<string, any>;
    currentlyEditingSection?: string;
    expiresAt: Date;
    createdAt: Date;
}

export const createDraftFromResume = (resumeId: ObjectId, userId: ObjectId, partialData?: Partial<IResumeDraft>): IResumeDraft => {
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + 24);

    return {
        resumeId,
        userId,
        lastModified: new Date(),
        sections: [],
        unsavedChanges: false,
        draftData: {},
        expiresAt: expiryTime,
        createdAt: new Date(),
        ...partialData
    };
};

export const resumeDraftCollection = envConfig.dbResumeDraftCollection 