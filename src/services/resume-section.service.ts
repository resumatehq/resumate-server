import { ObjectId } from 'mongodb';
import databaseServices from './database.service';
import { IResume, IResumeSection, SectionType } from '~/models/schemas/resume.schema';
import { draftService } from '~/services/draft.service';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import { ErrorWithStatus } from '~/utils/error.utils';
import redisClient from '~/config/redis';
import resumeService from './resume.service';

class ResumeSectionService {
    /**
     * Get all sections from a resume
     * @param resumeId - Resume ID
     * @param userId - User ID
     */
    async getAllSections(resumeId: string, userId: string): Promise<IResumeSection[]> {
        // Fetch fresh data from database and update cache
        const resume = await this.getFreshResumeData(resumeId, userId);
        return resume.sections || [];
    }

    /**
     * Get a specific section from a resume
     * @param resumeId - Resume ID
     * @param userId - User ID
     * @param sectionType - Type of section to retrieve
     */
    async getSection(resumeId: string, userId: string, sectionType: SectionType): Promise<IResumeSection | null> {
        // Fetch fresh data from database and update cache
        const resume = await this.getFreshResumeData(resumeId, userId);
        return resume.sections?.find(section => section.type === sectionType) || null;
    }

    /**
     * Get fresh resume data from database and update cache
     * @private
     */
    private async getFreshResumeData(resumeId: string, userId: string): Promise<IResume> {
        // Use resumeService to get fresh data with forceRefresh=true
        return await resumeService.getResumeById(resumeId, userId, true);
    }

    /**
     * Add a new section to a resume
     * @param resumeId - Resume ID
     * @param userId - User ID
     * @param section - Section data to add
     */
    async addSection(resumeId: string, userId: string, section: Omit<IResumeSection, '_id'>): Promise<IResume> {
        const resume = await this.getResumeOrFail(resumeId, userId);

        // Generate a new ID for the section
        const newSection: IResumeSection = {
            ...section,
            _id: new ObjectId()
        };

        // Get the highest order and add 1
        const maxOrder = resume.sections.reduce((max, section) =>
            section.order > max ? section.order : max, 0);

        newSection.order = maxOrder + 1;

        // Add the section to the resume
        await databaseServices.resumes.updateOne(
            { _id: new ObjectId(resumeId) },
            {
                $push: { sections: newSection },
                $set: { updatedAt: new Date() }
            }
        );

        // Auto-save this change
        await draftService.autoSaveSectionEdit(resumeId, userId, newSection.type, newSection);

        // Get fresh data from database with force refresh
        const updatedResume = await resumeService.getResumeById(resumeId, userId, true);

        // Explicitly update Redis cache
        await this.updateResumeCache(resumeId, userId, updatedResume);

        return updatedResume;
    }

    /**
     * Update a section in a resume
     * @param resumeId - Resume ID
     * @param userId - User ID
     * @param sectionId - Section ID
     * @param updateData - Data to update
     */
    async updateSection(
        resumeId: string,
        userId: string,
        sectionId: string,
        updateData: Partial<IResumeSection>
    ): Promise<IResume> {
        const resume = await this.getResumeOrFail(resumeId, userId);

        // Find the section to update
        const sectionIndex = resume.sections.findIndex(section =>
            section._id?.toString() === sectionId);

        if (sectionIndex === -1) {
            throw new ErrorWithStatus({
                message: "Section not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Update fields except _id
        const { _id, ...updateFields } = updateData;

        const updateObj: Record<string, any> = {};

        for (const [key, value] of Object.entries(updateFields)) {
            updateObj[`sections.${sectionIndex}.${key}`] = value;
        }

        updateObj.updatedAt = new Date();

        // Update the resume
        await databaseServices.resumes.updateOne(
            { _id: new ObjectId(resumeId) },
            { $set: updateObj }
        );

        // Auto-save this change
        await draftService.autoSaveSectionEdit(
            resumeId,
            userId,
            resume.sections[sectionIndex].type,
            { ...resume.sections[sectionIndex], ...updateFields }
        );

        // Get fresh data from database with force refresh
        const updatedResume = await resumeService.getResumeById(resumeId, userId, true);

        // Explicitly update Redis cache
        await this.updateResumeCache(resumeId, userId, updatedResume);

        return updatedResume;
    }

    /**
     * Delete a section from a resume
     * @param resumeId - Resume ID
     * @param userId - User ID
     * @param sectionId - Section ID
     */
    async deleteSection(resumeId: string, userId: string, sectionId: string): Promise<IResume> {
        const resume = await this.getResumeOrFail(resumeId, userId);

        // Find the section to delete
        const section = resume.sections.find(section =>
            section._id?.toString() === sectionId);

        if (!section) {
            throw new ErrorWithStatus({
                message: "Section not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Remove the section
        await databaseServices.resumes.updateOne(
            { _id: new ObjectId(resumeId) },
            {
                $pull: { sections: { _id: new ObjectId(sectionId) } },
                $set: { updatedAt: new Date() }
            }
        );

        // Auto-save this change (record the deletion)
        await draftService.autoSaveSectionEdit(
            resumeId,
            userId,
            section.type,
            { deleted: true, sectionId }
        );

        // Get fresh data from database with force refresh
        const updatedResume = await resumeService.getResumeById(resumeId, userId, true);

        // Explicitly update Redis cache
        await this.updateResumeCache(resumeId, userId, updatedResume);

        return updatedResume;
    }

    async reorderSections(
        resumeId: string,
        userId: string,
        sectionOrders: Array<{ sectionId: string; order: number }>
    ): Promise<IResume> {
        const resume = await this.getResumeOrFail(resumeId, userId);

        const bulkOperations = sectionOrders.map(({ sectionId, order }) => {
            const sectionIndex = resume.sections.findIndex(
                section => section._id?.toString() === sectionId
            );

            if (sectionIndex === -1) return null;

            return {
                updateOne: {
                    filter: {
                        _id: new ObjectId(resumeId),
                        "sections._id": new ObjectId(sectionId)
                    },
                    update: {
                        $set: {
                            [`sections.${sectionIndex}.order`]: order,
                            updatedAt: new Date()
                        }
                    }
                }
            };
        }).filter(op => op !== null);

        if (bulkOperations.length > 0) {
            await databaseServices.resumes.bulkWrite(bulkOperations as any);

            await draftService.autoSaveSectionEdit(
                resumeId,
                userId,
                "reorder",
                { sectionOrders }
            );

            // Get fresh data from database with force refresh
            const updatedResume = await resumeService.getResumeById(resumeId, userId, true);

            if (updatedResume) {
                // Explicitly update Redis cache
                await this.updateResumeCache(resumeId, userId, updatedResume);
                return updatedResume;
            }
        }

        // If no changes were made or resume not found after update
        throw new ErrorWithStatus({
            message: "Resume not found after update or no changes applied",
            status: HTTP_STATUS_CODES.NOT_FOUND
        });
    }

    /**
     * Toggle section visibility
     * @param resumeId - Resume ID
     * @param userId - User ID
     * @param sectionId - Section ID
     * @param enabled - Whether to enable or disable the section
     */
    async toggleSectionVisibility(
        resumeId: string,
        userId: string,
        sectionId: string,
        enabled: boolean
    ): Promise<IResume> {
        const resume = await this.getResumeOrFail(resumeId, userId);

        // Find the section
        const sectionIndex = resume.sections.findIndex(
            section => section._id?.toString() === sectionId
        );

        console.log(sectionIndex)

        if (sectionIndex === -1) {
            throw new ErrorWithStatus({
                message: "Section not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Update the section visibility
        await databaseServices.resumes.updateOne(
            { _id: new ObjectId(resumeId), "sections._id": new ObjectId(sectionId) },
            {
                $set: {
                    [`sections.${sectionIndex}.enabled`]: enabled,
                    updatedAt: new Date()
                }
            }
        );

        // Auto-save this change
        await draftService.autoSaveSectionEdit(
            resumeId,
            userId,
            resume.sections[sectionIndex].type,
            { ...resume.sections[sectionIndex], enabled }
        );

        // Get updated resume with force refresh and update cache
        const updatedResume = await resumeService.getResumeById(resumeId, userId, true);

        // Explicitly update Redis cache
        await this.updateResumeCache(resumeId, userId, updatedResume);

        return updatedResume;
    }

    /**
     * Helper method to get a resume and verify ownership
     * @private
     */
    private async getResumeOrFail(resumeId: string, userId: string): Promise<IResume> {
        const redis = await redisClient;
        const cacheKey = `resume:${resumeId}`;

        let resume = await redis.getObject<IResume>(cacheKey);

        if (resume) {
            if (resume.userId.toString() !== userId) {
                throw new ErrorWithStatus({
                    message: "Resume not found or you don't have permission",
                    status: HTTP_STATUS_CODES.NOT_FOUND
                });
            }
            return resume;
        }

        // If not in cache, get from database through resumeService
        return await resumeService.getResumeById(resumeId, userId);
    }

    /**
     * Helper method to clear resume cache
     * @private
     */
    private async clearResumeCache(resumeId: string, userId?: string): Promise<void> {
        const redis = await redisClient;

        // Delete the specific resume cache
        await redis.del(`resume:${resumeId}`);

        // If userId is provided, also clear user's resume list cache
        if (userId) {
            const keys = await redis.keys(`resumes:${userId}:*`);
            if (keys.length > 0) {
                await Promise.all(keys.map(key => redis.del(key)));
            }
        }
    }

    /**
     * Update resume in cache
     * @param resumeId - Resume ID
     * @param userId - User ID
     * @param resume - Updated resume object
     */
    private async updateResumeCache(resumeId: string, userId: string, resume: IResume): Promise<void> {
        const redis = await redisClient;
        const cacheKey = `resume:${resumeId}`;

        // Force update the specific resume cache with new data
        await redis.del(cacheKey); // First delete old data
        await redis.setObject(cacheKey, resume as unknown as Record<string, unknown>, 900);

        // Clear user's resume list cache
        const keys = await redis.keys(`resumes:${userId}:*`);
        if (keys.length > 0) {
            await Promise.all(keys.map(key => redis.del(key)));
        }
    }
}

export const resumeSectionService = new ResumeSectionService();
export default resumeSectionService; 