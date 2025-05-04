import { ObjectId } from 'mongodb';
import { IResumeDraft, createDraftFromResume, resumeDraftCollection } from '../models/schemas/resume-draft.schema';
import { IResume, IResumeSection } from '../models/schemas/resume.schema';
import databaseServices from '~/services/database.service';

class DraftService {
    /**
     * Create or update a draft for a resume
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     * @param draftData The draft data
     */
    async createOrUpdateDraft(
        resumeId: string | ObjectId,
        userId: string | ObjectId,
        draftData: Partial<IResumeDraft>
    ): Promise<IResumeDraft> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        // Check if draft exists
        const existingDraft = await databaseServices.resume_draft
            .findOne({ resumeId: resumeObjId, userId: userObjId });

        if (existingDraft) {
            const updatedDraft = {
                ...existingDraft,
                ...draftData,
                lastModified: new Date(),
                unsavedChanges: true
            };

            await databaseServices.resume_draft
                .updateOne(
                    { _id: existingDraft._id },
                    { $set: updatedDraft }
                );

            return updatedDraft as IResumeDraft;
        } else {
            // Create new draft
            const newDraft = createDraftFromResume(resumeObjId, userObjId, {
                ...draftData,
                unsavedChanges: true
            });

            const result = await databaseServices.resume_draft
                .insertOne(newDraft);

            return {
                ...newDraft,
                _id: result.insertedId
            };
        }
    }

    /**
     * Get a draft for a resume
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     */
    async getDraft(
        resumeId: string | ObjectId,
        userId: string | ObjectId
    ): Promise<IResumeDraft | null> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        const draft = await databaseServices.resume_draft
            .findOne({ resumeId: resumeObjId, userId: userObjId });

        return draft as IResumeDraft | null;
    }

    /**
     * Save draft changes to the actual resume
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     */
    async saveDraftToResume(
        resumeId: string | ObjectId,
        userId: string | ObjectId
    ): Promise<IResume | null> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        const draft = await this.getDraft(resumeObjId, userObjId);
        if (!draft || !draft.unsavedChanges) return null;

        // Get the current resume
        const resume = await databaseServices.resumes
            .findOne({ _id: resumeObjId, userId: userObjId });

        if (!resume) return null;

        // Update resume with draft data
        const updateData: Partial<IResume> = {
            updatedAt: new Date()
        };

        // Only update fields that exist in the draft
        if (draft.title) updateData.title = draft.title;
        if (draft.targetPosition) updateData.targetPosition = draft.targetPosition;
        if (draft.industry) updateData.industry = draft.industry;
        if (draft.sections && draft.sections.length > 0) {
            updateData.sections = draft.sections as IResumeSection[];
        }

        // Create update operations for the metadata
        const updateOps: Record<string, any> = {
            ...updateData,
            'metadata.updatedAt': new Date(),
            'metadata.lastAutosaved': draft.lastModified
        };

        // Update the resume
        await databaseServices.resumes
            .updateOne(
                { _id: resumeObjId },
                { $set: updateOps }
            );

        // Clear the draft's unsavedChanges flag
        await databaseServices.resume_draft
            .updateOne(
                { _id: draft._id },
                { $set: { unsavedChanges: false } }
            );

        // Return the updated resume
        return await databaseServices.resumes
            .findOne({ _id: resumeObjId }) as IResume;
    }

    /**
     * Delete a draft
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     */
    async deleteDraft(
        resumeId: string | ObjectId,
        userId: string | ObjectId
    ): Promise<boolean> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        const result = await databaseServices.resume_draft
            .deleteOne({ resumeId: resumeObjId, userId: userObjId });

        return result.deletedCount > 0;
    }

    /**
     * Auto-save the current state of a resume section
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     * @param sectionType The type of section being edited
     * @param sectionData The section data
     */
    async autoSaveSectionEdit(
        resumeId: string | ObjectId,
        userId: string | ObjectId,
        sectionType: string,
        sectionData: any
    ): Promise<void> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        // Initialize or get the draft
        const draft = await this.initializeDraftIfNeeded(resumeObjId, userObjId);

        // Update the draft data with the section being edited
        const draftData = draft.draftData || {};
        draftData[`section_${sectionType}`] = sectionData;

        await this.createOrUpdateDraft(resumeObjId, userObjId, {
            draftData,
            currentlyEditingSection: sectionType,
            lastModified: new Date()
        });
    }

    /**
     * Clear draft data for a specific section
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     * @param sectionId The ID of the section to clear from draft
     */
    async clearSectionDraft(
        resumeId: string | ObjectId,
        userId: string | ObjectId,
        sectionId: string | ObjectId
    ): Promise<void> {
        try {
            console.log('Clearing section draft with params:', {
                resumeId,
                userId,
                sectionId
            });

            const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
            const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;
            const sectionObjId = typeof sectionId === 'string' ? new ObjectId(sectionId) : sectionId;

            const draft = await this.getDraft(resumeObjId, userObjId);
            if (!draft) return;

            const resume = await databaseServices.resumes.findOne({
                _id: resumeObjId,
                userId: userObjId
            });

            console.log('Found resume:', resume ? 'yes' : 'no');

            if (!resume) {
                console.log('Resume not found with ID:', resumeId);
                return;
            }

            const section = resume.sections.find(
                s => s._id?.toString() === sectionObjId.toString()
            );

            if (!section) return;

            // Remove the section data from draft
            const draftData = draft.draftData || {};

            // Clean all possible references to this section
            delete draftData[`section_${section.type}`];
            delete draftData[`section_${sectionObjId.toString()}`];

            // If the currently editing section is this one, clear it
            const updatedDraft: Partial<IResumeDraft> = {
                draftData,
                lastModified: new Date()
            };

            if (draft.currentlyEditingSection === section.type) {
                updatedDraft.currentlyEditingSection = undefined;
            }

            await this.createOrUpdateDraft(resumeObjId, userObjId, updatedDraft);
        } catch (error) {
            console.error('Error in clearSectionDraft:', error);
            throw error;
        }
    }

    /**
     * Save a section draft, with optional resume data for new resumes
     * @param resumeId The ID of the resume or "temp" if creating a new one
     * @param userId The ID of the user
     * @param sectionType The type of section being edited
     * @param sectionData The section data
     * @param resumeData Optional resume data if creating a new resume
     */
    async saveSectionDraft(
        resumeId: string | ObjectId,
        userId: string | ObjectId,
        sectionType: string,
        sectionData: any,
        resumeData?: any
    ): Promise<IResumeDraft> {
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        let resumeObjId: ObjectId | string = resumeId;
        // Handle the case where we're creating a draft for a not-yet-created resume
        if (resumeId === 'temp') {
            // Generate a temporary ID or use a special marker
            resumeObjId = 'temp_' + userObjId.toString();
        } else if (typeof resumeId === 'string' && resumeId !== 'temp') {
            resumeObjId = new ObjectId(resumeId);
        }

        // Get draft or initialize if needed
        let existingDraft;
        if (resumeId !== 'temp') {
            existingDraft = await this.initializeDraftIfNeeded(resumeObjId, userObjId);
        } else {
            // For temp cases, still check if draft exists
            existingDraft = await databaseServices.resume_draft
                .findOne({
                    $or: [
                        { resumeId: resumeObjId, userId: userObjId },
                        { resumeId: resumeId.toString(), userId: userObjId } // For 'temp_' cases
                    ]
                });
        }

        // Update the draft data with the section being edited
        const draftData = existingDraft?.draftData || {};
        draftData[`section_${sectionType}`] = sectionData;

        // Add resume data if provided
        if (resumeData) {
            draftData.resumeMetadata = resumeData;
        }

        // If draft exists, update it, otherwise create it
        if (existingDraft) {
            // Update existing draft
            const updatedDraft = {
                ...existingDraft,
                draftData,
                currentlyEditingSection: sectionType,
                lastModified: new Date(),
                unsavedChanges: true
            };

            await databaseServices.resume_draft
                .updateOne(
                    { _id: existingDraft._id },
                    { $set: updatedDraft }
                );

            return updatedDraft as IResumeDraft;
        } else {
            // Create new draft
            const newDraft = createDraftFromResume(
                resumeObjId as any,
                userObjId,
                {
                    draftData,
                    currentlyEditingSection: sectionType,
                    lastModified: new Date(),
                    unsavedChanges: true
                }
            );

            const result = await databaseServices.resume_draft
                .insertOne(newDraft);

            return {
                ...newDraft,
                _id: result.insertedId
            };
        }
    }

    /**
     * Initialize a draft for a resume if it doesn't exist
     * This is useful for non-socket scenarios like API testing
     * @param resumeId The ID of the resume
     * @param userId The ID of the user
     */
    async initializeDraftIfNeeded(
        resumeId: string | ObjectId,
        userId: string | ObjectId
    ): Promise<IResumeDraft> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        // Check if draft exists
        const existingDraft = await databaseServices.resume_draft
            .findOne({ resumeId: resumeObjId, userId: userObjId });

        if (existingDraft) {
            return existingDraft as IResumeDraft;
        }

        const newDraft = createDraftFromResume(resumeObjId, userObjId, {
            lastModified: new Date(),
            unsavedChanges: false
        });

        const result = await databaseServices.resume_draft
            .insertOne(newDraft);

        return {
            ...newDraft,
            _id: result.insertedId
        };
    }
}

export const draftService = new DraftService();
export default draftService; 