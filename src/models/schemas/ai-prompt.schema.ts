import { ObjectId } from 'mongodb'
import { envConfig } from "~/constants/config";

export interface IAIPrompt {
    _id?: ObjectId;
    type: 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'feedback' | 'general' | 'cover_letter';
    title: string;
    prompt: string;
    context: 'section' | 'resume' | 'job';
    variables: string[];
    examples: string[];
    active: boolean;
    popularity: number;
    premium: boolean;
    targetSegment?: string; // Phân khúc mục tiêu: mới tốt nghiệp, chuyên gia, quản lý...
    industry?: string; // Ngành nghề liên quan
    jobPosition?: string; // Vị trí công việc liên quan
    metadata?: {
        createdBy: string;
        approvedBy?: string;
        lastTestedDate?: Date;
        successRate?: number; // Tỷ lệ thành công (dựa trên phản hồi người dùng)
    };
    createdAt: Date;
    updatedAt: Date;
}

// Các prompt mẫu để system sử dụng
export const DEFAULT_PROMPTS = {
    SUMMARY: 'Tóm tắt kinh nghiệm và kỹ năng của tôi trong {experienceYears} năm làm việc như một {jobTitle}.',
    EXPERIENCE: 'Mô tả vai trò và thành tựu của tôi khi làm việc tại {company} với vị trí {position}.',
    SKILLS: 'Liệt kê các kỹ năng chuyên môn phù hợp cho vị trí {jobTitle} trong ngành {industry}.',
    EDUCATION: 'Mô tả quá trình học tập của tôi tại {institution} chuyên ngành {fieldOfStudy}.'
};

export const aiPromptCollection = envConfig.dbAiPromptCollection;

export default {
    collectionName: aiPromptCollection
};