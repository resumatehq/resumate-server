import { Request, Response } from "express";
import { TokenPayload } from "~/models/requests/user.request";
import { OK } from "~/core/succes.response";
import resumeSectionService from "~/services/resume-section.service";
import draftService from "~/services/draft.service";
import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import { SectionType } from "~/models/schemas/resume.schema";
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

        // If no resumeId provided, create a new resume
        if (!targetResumeId && resumeData) {
            // Create a new empty resume
            resume = await resumeService.createEmptyResume(user_id, {
                title: resumeData.title || "Untitled Resume",
                templateId: resumeData.templateId,
                targetPosition: resumeData.targetPosition,
                industry: resumeData.industry,
                language: resumeData.language || "en"
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
        if (sectionData._id) {
            try {
                // Get all sections for this resume
                const allSections = await resumeSectionService.getAllSections(targetResumeId, user_id);
                existingSection = allSections.find(section => section._id?.toString() === sectionData._id);
            } catch (error) {
            }
        }

        let updatedResume;
        // If section exists, update it
        if (existingSection && existingSection._id) {
            updatedResume = await resumeSectionService.updateSection(
                targetResumeId,
                user_id,
                existingSection._id.toString(),
                sectionData
            );
        } else {
            updatedResume = await resumeSectionService.addSection(
                targetResumeId,
                user_id,
                sectionData
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