// src/services/aiService.ts
import { OpenAI } from 'openai';
import redisClient from '../config/redis';
import User from '~/models/schemas/user.schema';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import Resume from '~/models/schemas/resume.schema';
import { TokenPayload } from '~/models/requests/user.request';

interface SectionContentVariables {
    currentContent: string;
    targetPosition: string;
    industry: string;
}

interface ATSFeedbackVariables {
    resumeContent: string;
    jobDescription?: string;
}

interface ATSFeedbackResponse {
    score: number;
    feedback: Record<string, any>;
}

interface GeneratedKeywords {
    keywords: string[];
}

class AIService {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY || ''
        });
    }

    /**
     * Tạo summary CV tự động
     */
    async generateSummary(userId: string, experience: string, skills: string): Promise<string> {
        try {
            await this.checkUserAILimits(userId);

            // Xây dựng prompt cho OpenAI
            const prompt = `Create a professional resume summary for someone with experience in ${experience} and skills in ${skills}.`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert resume writer specialized in creating concise, impactful professional summaries."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            });

            const summary = response.choices[0]?.message?.content?.trim() || "Failed to generate summary";

            await this.updateUsageCounters(userId);
            return summary;
        } catch (error) {
            return this.handleError('AI summary generation error:', error);
        }
    }

    /**
     * Tinh chỉnh nội dung CV
     */
    async refineContent(userId: string, content: string, targetLevel: string): Promise<string> {
        try {
            await this.checkUserAILimits(userId);

            // Xây dựng prompt cho OpenAI
            const prompt = `Refine the following resume content to make it more appropriate for a ${targetLevel} level position:\n\n${content}`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert resume writer specialized in refining content to match specific career levels."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.6,
                max_tokens: 500
            });

            const refinedContent = response.choices[0]?.message?.content?.trim() || "Failed to refine content";

            await this.updateUsageCounters(userId);
            return refinedContent;
        } catch (error) {
            return this.handleError('AI content refinement error:', error);
        }
    }

    /**
     * Điều chỉnh CV theo job description
     */
    async tailorForJobDescription(userId: string, resumeContent: string, jobDescription: string): Promise<any> {
        try {
            await this.checkUserAILimits(userId);

            // Xây dựng prompt cho OpenAI
            const prompt = `Tailor the following resume content to better match this job description:\n\nRESUME:\n${resumeContent}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nProvide tailored content, a match score (0-100) and specific recommendations for improvement.`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert in resume optimization for job applications."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.4,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            const responseContent = response.choices[0]?.message?.content;
            if (!responseContent) {
                throw new Error('Failed to get response from AI');
            }

            const result = JSON.parse(responseContent);

            await this.updateUsageCounters(userId);
            return result;
        } catch (error) {
            return this.handleError('AI resume tailoring error:', error);
        }
    }

    /**
     * Tạo keywords cho CV dựa trên ngành nghề
     */
    async generateKeywords(userId: string, targetPosition: string, industry: string): Promise<string[]> {
        try {
            await this.checkUserAILimits(userId);

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert in resume optimization and ATS systems."
                    },
                    {
                        role: "user",
                        content: `Generate a list of 15-20 relevant keywords and skills for a ${targetPosition} position in the ${industry} industry. Format as a JSON array of strings.`
                    }
                ],
                temperature: 0.5,
                max_tokens: 500,
                response_format: { type: "json_object" }
            });

            const content = response.choices[0]?.message?.content || "{}";
            const parsedResponse = JSON.parse(content) as GeneratedKeywords;

            await this.updateUsageCounters(userId);
            return parsedResponse.keywords || [];
        } catch (error) {
            return this.handleError('Keywords generation error:', error);
        }
    }

    /**
     * Phân tích CV với ATS
     */
    async analyzeWithATS(userId: string, resumeId: string, jobDescription?: string): Promise<ATSFeedbackResponse> {
        try {
            await this.checkUserAILimits(userId);

            // Lấy thông tin resume
            const resume = await Resume.findById(resumeId);
            if (!resume) {
                throw new ErrorWithStatus({
                    message: 'Resume not found',
                    status: HTTP_STATUS_CODES.NOT_FOUND
                });
            }

            const resumeContent = this.prepareResumeContent(resume);

            // Xây dựng prompt cho OpenAI
            let prompt = `Analyze this resume for ATS optimization:\n\n${JSON.stringify(resumeContent)}`;
            if (jobDescription) {
                prompt += `\n\nFor this job description:\n${jobDescription}`;
            }
            prompt += "\n\nProvide a score from 0-100 and specific feedback for improvement in JSON format.";

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert in ATS (Applicant Tracking Systems) and resume optimization."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500,
                response_format: { type: "json_object" }
            });

            const content = response.choices[0]?.message?.content || "{}";
            const feedback = this.parseATSFeedback(content);

            await this.updateUsageCounters(userId);
            return feedback;
        } catch (error) {
            return this.handleError('ATS analysis error:', error);
        }
    }

    // Các phương thức hỗ trợ
    private async checkUserAILimits(userId: string): Promise<void> {
        const user = await User.findById(userId);
        if (!user) {
            throw new ErrorWithStatus({
                message: 'User not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        if (!this.hasAIAccess(user)) {
            throw new ErrorWithStatus({
                message: 'AI features are not available with your current plan',
                status: HTTP_STATUS_CODES.FORBIDDEN
            });
        }

        const dailyCount = await this.getDailyAICount(userId);
        const dailyLimit = this.getDailyLimit(user.tier);

        if (dailyCount >= dailyLimit) {
            throw new ErrorWithStatus({
                message: `Daily AI request limit (${dailyLimit}) reached`,
                status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
            });
        }
    }

    private async updateUsageCounters(userId: string): Promise<void> {
        await Promise.all([
            User.findByIdAndUpdate(userId, { $inc: { 'usage.aiRequestsCount': 1 } }),
            this.incrementRedisCounter(userId)
        ]);
    }

    private prepareResumeContent(resume: any) {
        // Chuyển đổi nội dung resume thành format phù hợp cho phân tích
        return {
            title: resume.title,
            targetPosition: resume.targetPosition,
            industry: resume.industry,
            sections: resume.sections.map((section: any) => ({
                type: section.type,
                title: section.title,
                content: section.content
            }))
        };
    }

    private parseATSFeedback(content: string): ATSFeedbackResponse {
        try {
            const feedback = JSON.parse(content) as ATSFeedbackResponse;
            return {
                score: feedback.score || 0,
                feedback: feedback.feedback || {}
            };
        } catch (error) {
            throw new ErrorWithStatus({
                message: 'Invalid ATS feedback response format',
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
            });
        }
    }

    private async incrementRedisCounter(userId: string): Promise<void> {
        const today = new Date().toISOString().split('T')[0];
        const aiCountKey = `ai:count:${userId}:${today}`;

        const redis = await redisClient;
        if (redis) {
            await redis.incr(aiCountKey);
            await redis.expire(
                aiCountKey,
                this.secondsUntilMidnight()
            );
        }
    }

    private secondsUntilMidnight(): number {
        const now = new Date();
        const midnight = new Date();
        midnight.setHours(24, 0, 0, 0);
        return Math.floor((midnight.getTime() - now.getTime()) / 1000);
    }

    private hasAIAccess(user: any): boolean {
        // Kiểm tra nếu user có quyền truy cập tính năng AI
        return user.tier === 'premium' ||
            user.permissions.allowedFeatures.includes('basic_ai');
    }

    private async getDailyAICount(userId: string): Promise<number> {
        const today = new Date().toISOString().split('T')[0];
        const aiCountKey = `ai:count:${userId}:${today}`;

        const redis = await redisClient;
        if (redis) {
            const aiCount = await redis.get(aiCountKey);
            return parseInt(aiCount || '0', 10);
        }
        return 0;
    }

    private getDailyLimit(tier: string): number {
        return tier === 'premium' ? 100 : 10;
    }

    private handleError(context: string, error: unknown): never {
        console.error(context, error);
        if (error instanceof ErrorWithStatus) {
            throw error;
        }
        throw new ErrorWithStatus({
            message: error instanceof Error ? error.message : 'Unknown AI service error',
            status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
        });
    }
}

export default new AIService();