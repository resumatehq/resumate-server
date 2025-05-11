import { Request, Response } from "express";
import { OK } from "~/core/succes.response";
import { TokenPayload } from "~/models/requests/user.request";
import draftService from "~/services/draft.service";

class DraftController {
    createOrUpdateDraft = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const draftData = req.body;

        const draft = await draftService.createOrUpdateDraft(resumeId, user_id, draftData);

        new OK({
            message: "Draft saved successfully",
            data: { draft }
        }).send(res);
    };

    getDraft = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        const draft = await draftService.getDraft(resumeId, user_id);

        new OK({
            message: "Draft retrieved successfully",
            data: { draft }
        }).send(res);
    };

    saveDraftToResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        const resume = await draftService.saveDraftToResume(resumeId, user_id);

        new OK({
            message: "Draft saved to resume successfully",
            data: { resume }
        }).send(res);
    };

    autoSaveSectionEdit = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { sectionType, sectionData } = req.body;

        await draftService.autoSaveSectionEdit(resumeId, user_id, sectionType, sectionData);

        new OK({
            message: "Section autosaved successfully",
            data: null
        }).send(res);
    };

    // Auto-save form data as user types
    autoSaveFormData = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { formId, formData } = req.body;

        if (!formId || !formData) {
            new OK({
                message: "Missing form ID or data",
                data: null
            }).send(res);
            return;
        }

        // We're using a different approach for forms to avoid too many DB operations
        // Instead of saving complete section data, we just save the form state
        const draftData: Record<string, any> = {};
        draftData[`form_${formId}`] = formData;

        await draftService.createOrUpdateDraft(resumeId, user_id, {
            draftData,
            lastModified: new Date(),
            currentlyEditingSection: formId,
        });

        new OK({
            message: "Form data autosaved successfully",
            data: null
        }).send(res);
    };
}

export default new DraftController();
