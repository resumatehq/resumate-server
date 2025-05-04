import { Request, Response } from 'express';
import aiService from '~/services/ai.service';
import { OK } from '~/core/succes.response';
import { TokenPayload } from '~/models/requests/user.request';

class AIController {
    /**
     * Controller xử lý tạo summary CV tự động
     */
    generateSummary = async (req: Request, res: Response) => {
        try {
            // Lấy thông tin user từ token
            const { user_id } = req.decoded_authorization as TokenPayload;
            const { experience, skills } = req.body;

            // Gọi service để tạo summary
            const summary = await aiService.generateSummary(user_id, experience, skills);

            new OK({
                message: 'Summary generated successfully',
                data: { summary }
            }).send(res);
        } catch (error) {
            res.status(500).json({
                message: 'Failed to generate summary',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    /**
     * Controller xử lý tinh chỉnh nội dung CV
     */
    refineContent = async (req: Request, res: Response) => {
        try {
            const { user_id } = req.decoded_authorization as TokenPayload;
            const { content, targetLevel } = req.body;

            // Gọi service để tinh chỉnh nội dung
            const refinedContent = await aiService.refineContent(user_id, content, targetLevel);

            new OK({
                message: 'Content refined successfully',
                data: { refinedContent }
            }).send(res);
        } catch (error) {
            res.status(500).json({
                message: 'Failed to refine content',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    /**
     * Controller xử lý điều chỉnh CV theo job description
     */
    tailorForJobDescription = async (req: Request, res: Response) => {
        try {
            const { user_id } = req.decoded_authorization as TokenPayload;
            const { resumeContent, jobDescription } = req.body;

            // Gọi service để điều chỉnh CV theo job description
            const result = await aiService.tailorForJobDescription(user_id, resumeContent, jobDescription);

            new OK({
                message: 'Resume tailored for job successfully',
                data: result
            }).send(res);
        } catch (error) {
            res.status(500).json({
                message: 'Failed to tailor resume for job',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    /**
     * Controller xử lý tạo keywords cho CV dựa trên ngành nghề
     */
    generateKeywords = async (req: Request, res: Response) => {
        try {
            const { user_id } = req.decoded_authorization as TokenPayload;
            const { targetPosition, industry } = req.body;

            // Gọi service để tạo keywords
            const keywords = await aiService.generateKeywords(user_id, targetPosition, industry);

            new OK({
                message: 'Keywords generated successfully',
                data: { keywords }
            }).send(res);
        } catch (error) {
            res.status(500).json({
                message: 'Failed to generate keywords',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };

    /**
     * Controller xử lý phân tích CV với ATS
     */
    analyzeWithATS = async (req: Request, res: Response) => {
        try {
            const { user_id } = req.decoded_authorization as TokenPayload;
            const { resumeId, jobDescription } = req.body;

            // Gọi service để phân tích CV với ATS
            const analysis = await aiService.analyzeWithATS(user_id, resumeId, jobDescription);

            new OK({
                message: 'Resume analysis completed successfully',
                data: { analysis }
            }).send(res);
        } catch (error) {
            res.status(500).json({
                message: 'Failed to analyze resume',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    };
}

export default new AIController(); 