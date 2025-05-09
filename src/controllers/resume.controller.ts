import { Request, Response } from "express";
import { TokenPayload } from "~/models/requests/user.request";
import resumeService from "~/services/resume.service";
import { OK } from "~/core/succes.response";
import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";

class ResumeController {
    createResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { title, templateId, targetPosition, industry, language, sections } = req.body;

        // Validate required fields
        if (!title || !templateId) {
            throw new ErrorWithStatus({
                message: "Title and template are required",
                status: HTTP_STATUS_CODES.BAD_REQUEST,
            });
        }

        // Process sections to flatten the content structure if needed
        let processedSections;

        if (sections && Array.isArray(sections)) {
            processedSections = sections.map(section => {
                const { content, ...rest } = section;

                // Extract content from nested structure if needed
                let flatContent = content;

                if (content && !Array.isArray(content)) {
                    // Check for nested arrays in content
                    if (section.type === 'experience' && content.experiences) {
                        flatContent = content.experiences;
                    } else if (section.type === 'education' && content.educations) {
                        flatContent = content.educations;
                    } else if (section.type === 'skills' && content.skills) {
                        flatContent = content.skills;
                    } else if (content.items) {
                        flatContent = content.items;
                    }
                }

                return {
                    ...rest,
                    content: Array.isArray(flatContent) ? flatContent : []
                };
            });
        }

        // @ts-ignore - we'll handle the type in the service
        const resume = await resumeService.createResume(user_id, {
            title,
            templateId,
            targetPosition,
            industry,
            language,
            sections: processedSections
        });

        new OK({
            message: "Resume created successfully",
            data: { resume },
        }).send(res);
    };

    // Create an empty resume without any sections initially
    createEmptyResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { title, templateId, targetPosition, industry, language, sections } = req.body;

        // Validate required fields
        if (!title || !templateId) {
            throw new ErrorWithStatus({
                message: "Title and template ID are required",
                status: HTTP_STATUS_CODES.BAD_REQUEST,
            });
        }

        // Process sections to flatten the content structure if needed
        let processedSections;

        if (sections && Array.isArray(sections)) {
            processedSections = sections.map(section => {
                const { content, ...rest } = section;

                // Extract content from nested structure if needed
                let flatContent = content;

                if (content && !Array.isArray(content)) {
                    // Check for nested arrays in content
                    if (section.type === 'experience' && content.experiences) {
                        flatContent = content.experiences;
                    } else if (section.type === 'education' && content.educations) {
                        flatContent = content.educations;
                    } else if (section.type === 'skills' && content.skills) {
                        flatContent = content.skills;
                    } else if (content.items) {
                        flatContent = content.items;
                    }
                }

                return {
                    ...rest,
                    content: Array.isArray(flatContent) ? flatContent : []
                };
            });
        }

        // @ts-ignore - we'll handle the type in the service
        const resume = await resumeService.createEmptyResume(user_id, {
            title,
            templateId,
            targetPosition,
            industry,
            language,
            sections: processedSections
        });

        new OK({
            message: "Empty resume created successfully",
            data: { resume },
        }).send(res);
    };

    getResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        const resume = await resumeService.getResumeById(resumeId, user_id);

        new OK({
            message: "Resume retrieved successfully",
            data: { resume },
        }).send(res);
    };

    getUserResumes = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { limit, page, sort, search } = req.query;

        const resumes = await resumeService.getUserResumes(user_id, {
            limit: limit ? parseInt(limit as string, 10) : undefined,
            page: page ? parseInt(page as string, 10) : undefined,
            sort: sort as string,
            search: search as string,
        });

        new OK({
            message: "Resumes retrieved successfully",
            data: resumes,
        }).send(res);
    };

    updateResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const updates = req.body;

        // Validate that there's something to update
        if (Object.keys(updates).length === 0) {
            throw new ErrorWithStatus({
                message: "No updates provided",
                status: HTTP_STATUS_CODES.BAD_REQUEST,
            });
        }

        const resume = await resumeService.updateResume(resumeId, user_id, updates);

        new OK({
            message: "Resume updated successfully",
            data: { resume },
        }).send(res);
    };

    deleteResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        await resumeService.deleteResume(resumeId, user_id);

        new OK({
            message: "Resume deleted successfully",
            data: null,
        }).send(res);
    };

    shareResume = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { password, expiryDays, allowDownload, allowFeedback, allowEmbed } = req.body;

        const result = await resumeService.shareResume(resumeId, user_id, {
            password,
            expiryDays: expiryDays ? parseInt(expiryDays as string, 10) : undefined,
            allowDownload,
            allowFeedback,
            allowEmbed
        });

        new OK({
            message: "Resume shared successfully",
            data: result,
        }).send(res);
    };

    updateShareSettings = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { password, expiryDays, allowDownload, allowFeedback, allowEmbed } = req.body;

        const result = await resumeService.updateShareSettings(resumeId, user_id, {
            password,
            expiryDays: expiryDays ? parseInt(expiryDays as string, 10) : undefined,
            allowDownload,
            allowFeedback,
            allowEmbed
        });

        new OK({
            message: "Share settings updated successfully",
            data: result,
        }).send(res);
    };

    revokeShareAccess = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        await resumeService.revokeShareAccess(resumeId, user_id);

        new OK({
            message: "Share access revoked successfully",
            data: null,
        }).send(res);
    };

    generateQRCode = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { size } = req.query;

        const qrData = await resumeService.generateQRCode(
            resumeId,
            user_id,
            size ? parseInt(size as string, 10) : undefined
        );

        new OK({
            message: "QR code generated successfully",
            data: qrData,
        }).send(res);
    };

    getPublicResume = async (req: Request, res: Response) => {
        const { shareableLink } = req.params;
        const { password } = req.body;
        const clientIp = req.ip || req.headers['x-forwarded-for'] as string || '';
        const userAgent = req.headers['user-agent'] || '';
        const referrer = req.headers['referer'] || '';

        const resume = await resumeService.getResumeByShareableLink(
            shareableLink,
            password,
            {
                clientIp,
                userAgent,
                referrer
            }
        );

        new OK({
            message: "Resume retrieved successfully",
            data: { resume },
        }).send(res);
    };

    createVersion = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;
        const { comment } = req.body;

        const version = await resumeService.createVersion(resumeId, user_id, comment);

        new OK({
            message: "Version created successfully",
            data: { version },
        }).send(res);
    };

    getVersions = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId } = req.params;

        const versions = await resumeService.getVersions(resumeId, user_id);

        new OK({
            message: "Versions retrieved successfully",
            data: { versions },
        }).send(res);
    };

    restoreVersion = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { resumeId, versionNumber } = req.params;

        const resume = await resumeService.restoreVersion(
            resumeId,
            user_id,
            parseInt(versionNumber, 10)
        );

        new OK({
            message: "Version restored successfully",
            data: { resume },
        }).send(res);
    };
}

export default new ResumeController(); 