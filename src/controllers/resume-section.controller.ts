import { Request, Response } from "express";
import { TokenPayload } from "~/models/requests/user.request";
import { OK } from "~/core/succes.response";
import resumeSectionService from "~/services/resume-section.service";
import draftService from "~/services/draft.service";
import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import { IResumeSection, SectionType } from "~/models/schemas/resume.schema";
import resumeService from "~/services/resume.service";

class ResumeSectionController {
    // Get all sections for a resume
    getAllSections = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        const sections = await resumeSectionService.getAllSections(resumeId, user_id);

        new OK({
            message: "Sections retrieved successfully",
            data: { sections }
        }).send(res);
    };

    // Get a specific section by type
    getSection = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, sectionType } = req.params;

        const section = await resumeSectionService.getSection(
            resumeId,
            user_id,
            sectionType as SectionType
        );

        if (!section) {
            throw new ErrorWithStatus({
                message: "Section not found",
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        new OK({
            message: "Section retrieved successfully",
            data: { section }
        }).send(res);
    };

    // Update an existing section
    updateSection = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, sectionId } = req.params;
        const updateData = req.body;

        const resume = await resumeSectionService.updateSection(
            resumeId,
            user_id,
            sectionId,
            updateData
        );

        new OK({
            message: "Section updated successfully",
            data: { resume }
        }).send(res);
    };

    // Delete a section
    deleteSection = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, sectionId } = req.params;

        const resume = await resumeSectionService.deleteSection(resumeId, user_id, sectionId);

        new OK({
            message: "Section deleted successfully",
            data: { resume }
        }).send(res);
    };

    // Reorder sections
    reorderSections = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { sectionOrders } = req.body;

        if (!Array.isArray(sectionOrders)) {
            throw new ErrorWithStatus({
                message: "sectionOrders must be an array",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const resume = await resumeSectionService.reorderSections(
            resumeId,
            user_id,
            sectionOrders
        );

        new OK({
            message: "Sections reordered successfully",
            data: { resume }
        }).send(res);
    };

    // Toggle section visibility
    toggleSectionVisibility = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, sectionId } = req.params;
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            throw new ErrorWithStatus({
                message: "enabled must be a boolean value",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const resume = await resumeSectionService.toggleSectionVisibility(
            resumeId,
            user_id,
            sectionId,
            enabled
        );

        new OK({
            message: `Section ${enabled ? 'enabled' : 'disabled'} successfully`,
            data: { resume }
        }).send(res);
    };

    // Save section and continue to the next step
    saveAndContinueSection = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, sectionId } = req.params;
        const sectionData = req.body;

        // First update the section
        const updatedResume = await resumeSectionService.updateSection(
            resumeId,
            user_id,
            sectionId,
            sectionData
        );

        // Then clean up any draft data for this section
        await draftService.clearSectionDraft(resumeId, user_id, sectionId);

        new OK({
            message: "Section saved successfully",
            data: {
                resume: updatedResume,
                savedSectionId: sectionId
            }
        }).send(res);
    };

    // Create or update section and create resume if needed
    createOrUpdateSection = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { sectionData, resumeData } = req.body;

        let targetResumeId = resumeId;
        let resume;

        // Standardize section data format
        const standardizedSectionData = this.standardizeSectionFormat(sectionData);

        // If no resumeId provided, create a new resume
        if (!targetResumeId && resumeData) {
            // Create a new resume with the section data
            // @ts-ignore - we've updated the service to accept sections
            resume = await resumeService.createEmptyResume(user_id, {
                title: resumeData.title || "Untitled Resume",
                templateId: resumeData.templateId,
                targetPosition: resumeData.targetPosition,
                industry: resumeData.industry,
                language: resumeData.language || "en",
                sections: standardizedSectionData ? [{
                    type: standardizedSectionData.type,
                    title: standardizedSectionData.title,
                    isVisible: standardizedSectionData.enabled,
                    content: standardizedSectionData.content
                }] : undefined
            });
            targetResumeId = resume._id.toString();
        } else if (!targetResumeId) {
            throw new ErrorWithStatus({
                message: "Either resumeId or resumeData is required",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Check if the section already exists
        let existingSection = null;
        if (standardizedSectionData._id) {
            try {
                // Get all sections for this resume
                const allSections = await resumeSectionService.getAllSections(targetResumeId, user_id);
                existingSection = allSections.find(section => section._id?.toString() === standardizedSectionData._id);
            } catch (error) {
                // Silently handle error if section not found
            }
        } else if (standardizedSectionData.type) {
            try {
                // Check if a section with this type already exists
                const allSections = await resumeSectionService.getAllSections(targetResumeId, user_id);
                existingSection = allSections.find(section => section.type === standardizedSectionData.type);
            } catch (error) {
                // Silently handle error if section not found
            }
        }

        // Only add or update if we already have a valid section
        let updatedResume;
        if (existingSection && existingSection._id) {
            // If section exists, update it
            updatedResume = await resumeSectionService.updateSection(
                targetResumeId,
                user_id,
                existingSection._id.toString(),
                standardizedSectionData
            );
        } else if (resume) {
            // If we just created a resume with the section, use that
            updatedResume = resume;
        } else {
            // Otherwise add as a new section
            updatedResume = await resumeSectionService.addSection(
                targetResumeId,
                user_id,
                standardizedSectionData
            );
        }

        // Clear any drafts for this section
        if (existingSection && existingSection._id) {
            await draftService.clearSectionDraft(targetResumeId, user_id, existingSection._id.toString());
        }

        // Determine the section ID for the response
        const savedSectionId = existingSection && existingSection._id
            ? existingSection._id
            : updatedResume.sections[updatedResume.sections.length - 1]._id;

        new OK({
            message: existingSection ? "Section updated successfully" : "Section added successfully",
            data: {
                resume: updatedResume,
                resumeId: targetResumeId,
                sectionId: savedSectionId
            }
        }).send(res);
    };

    // Helper method to standardize section format
    private standardizeSectionFormat(sectionData: any): IResumeSection {
        if (!sectionData) return {} as IResumeSection;

        // Handle the case where the section data is in sectionData.sectionData format from frontend
        if (sectionData.sectionData) {
            return this.standardizeSectionFormat(sectionData.sectionData);
        }

        const { type, title, enabled, isVisible, content } = sectionData;

        // Ensure we have a valid type
        if (!type) {
            throw new ErrorWithStatus({
                message: "Section type is required",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        let standardizedContent = [];
        let sectionType = type.toLowerCase();

        // Extract content from nested structure or use as is if already flat
        if (content) {
            if (Array.isArray(content)) {
                // Content is already a flat array
                standardizedContent = content;
            } else if (typeof content === 'object') {
                // Handle nested structure
                if (sectionType === 'experience' && content.experiences && Array.isArray(content.experiences)) {
                    standardizedContent = content.experiences;
                } else if (sectionType === 'education' && content.educations && Array.isArray(content.educations)) {
                    standardizedContent = content.educations;
                } else if (sectionType === 'skills' && content.skills && Array.isArray(content.skills)) {
                    standardizedContent = content.skills;
                } else if (content.items && Array.isArray(content.items)) {
                    standardizedContent = content.items;
                } else {
                    // If we have an object but no arrays inside, wrap it as a single item array
                    const hasProperties = Object.keys(content).length > 0;
                    standardizedContent = hasProperties ? [content] : [];
                }
            }
        }

        return {
            ...sectionData,
            type: sectionType as SectionType,
            title: title || this.getDefaultTitleForType(sectionType),
            enabled: enabled !== undefined ? enabled : isVisible !== undefined ? isVisible : true,
            order: sectionData.order || 999, // High default order
            content: standardizedContent,
            settings: sectionData.settings || {
                visibility: 'public',
                layout: 'standard',
                styling: {}
            }
        };
    }

    // Helper method to get default title for a section type
    private getDefaultTitleForType(type: string): string {
        const titles: Record<string, string> = {
            'personal': 'Personal Information',
            'summary': 'Professional Summary',
            'experience': 'Work Experience',
            'education': 'Education',
            'skills': 'Skills',
            'languages': 'Languages',
            'certifications': 'Certifications',
            'projects': 'Projects',
            'references': 'References',
            'interests': 'Interests',
            'publications': 'Publications',
            'awards': 'Awards and Honors',
            'volunteer': 'Volunteer Experience',
            'custom': 'Custom Section'
        };

        return titles[type] || type.charAt(0).toUpperCase() + type.slice(1);
    }

    // Save section as draft
    saveSectionDraft = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { sectionData, sectionType, resumeData } = req.body;

        let targetResumeId = resumeId;

        // If no resumeId provided but we have resume data, create a draft without a resume
        if (!targetResumeId && !resumeData) {
            throw new ErrorWithStatus({
                message: "Either resumeId or resumeData is required",
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Save the draft
        const draft = await draftService.saveSectionDraft(
            targetResumeId || "temp", // Use "temp" if no resumeId yet
            user_id,
            sectionType,
            sectionData,
            resumeData
        );

        new OK({
            message: "Draft saved successfully",
            data: {
                draft,
                resumeId: targetResumeId || "temp"
            }
        }).send(res);
    };

    // Get draft for a specific section
    getSectionDraft = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, sectionType } = req.params;

        // Get the draft for the resume
        const draft = await draftService.getDraft(resumeId, user_id);

        if (!draft || !draft.draftData) {
            new OK({
                message: "No draft found for this section",
                data: { sectionDraft: null }
            }).send(res);
            return;
        }

        // Extract the section draft from the resume draft
        const sectionDraft = draft.draftData[`section_${sectionType}`] || null;

        new OK({
            message: sectionDraft ? "Section draft retrieved successfully" : "No draft found for this section",
            data: {
                sectionDraft,
                lastModified: draft.lastModified,
                currentlyEditingSection: draft.currentlyEditingSection
            }
        }).send(res);
    };
}

export default new ResumeSectionController(); 