import { ObjectId } from 'mongodb';
import databaseServices from './database.service';
import { IResumeVersion, VERSION_LIMITS } from '~/models/schemas/resume-version.schema';
import { IResume } from '~/models/schemas/resume.schema';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';

class ResumeVersionService {
    // Tạo phiên bản mới cho CV
    async createVersion(
        resumeId: string | ObjectId,
        userId: string | ObjectId,
        comment?: string,
        autoSaved: boolean = false
    ): Promise<IResumeVersion> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        // Lấy CV hiện tại
        const resume = await databaseServices.resumes.findOne({
            _id: resumeObjId,
            userId: userObjId
        });

        if (!resume) {
            throw new ErrorWithStatus({
                message: 'Resume not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Lấy phiên bản hiện tại
        const currentVersion = resume.metadata?.currentVersion || 0;
        const newVersionNumber = currentVersion + 1;

        // Tạo phiên bản mới
        const newVersion: IResumeVersion = {
            resumeId: resumeObjId,
            userId: userObjId,
            versionNumber: newVersionNumber,
            content: {
                title: resume.title,
                targetPosition: resume.targetPosition,
                industry: resume.industry,
                templateId: resume.templateId,
                sections: resume.sections,
                metadata: resume.metadata
            },
            changes: [{
                type: 'update',
                description: autoSaved ? 'Auto-saved version' : 'Manual save'
            }],
            comment,
            autoSaved,
            createdAt: new Date(),
            status: 'draft',
            metrics: this.calculateMetrics(resume)
        };

        // Lưu phiên bản mới vào DB
        await databaseServices.database.collection('resumeVersions').insertOne(newVersion);

        // Cập nhật số phiên bản hiện tại trong CV
        await databaseServices.resumes.updateOne(
            { _id: resumeObjId },
            {
                $set: {
                    'metadata.currentVersion': newVersionNumber,
                    'metadata.updatedAt': new Date()
                }
            }
        );

        // Kiểm tra và giới hạn số lượng phiên bản lưu trữ
        await this.cleanupOldVersions(resumeId, userId);

        return newVersion;
    }

    // Lấy danh sách phiên bản của CV
    async getVersions(resumeId: string, userId: string): Promise<IResumeVersion[]> {
        const versions = await databaseServices.database.collection('resumeVersions')
            .find({
                resumeId: new ObjectId(resumeId),
                userId: new ObjectId(userId)
            })
            .sort({ versionNumber: -1 })
            .toArray();

        return versions as IResumeVersion[];
    }

    // Lấy chi tiết một phiên bản
    async getVersionById(
        resumeId: string,
        userId: string,
        versionNumber: number
    ): Promise<IResumeVersion> {
        const version = await databaseServices.database.collection('resumeVersions')
            .findOne({
                resumeId: new ObjectId(resumeId),
                userId: new ObjectId(userId),
                versionNumber
            });

        if (!version) {
            throw new ErrorWithStatus({
                message: 'Version not found',
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        return version as IResumeVersion;
    }

    // Khôi phục CV về một phiên bản cũ
    async restoreVersion(
        resumeId: string,
        userId: string,
        versionNumber: number
    ): Promise<IResume> {
        // Tạo phiên bản mới từ trạng thái hiện tại trước khi khôi phục
        await this.createVersion(resumeId, userId, 'Auto-saved before restore', true);

        // Lấy phiên bản cần khôi phục
        const version = await this.getVersionById(resumeId, userId, versionNumber);

        // Cập nhật CV với nội dung từ phiên bản cũ
        const result = await databaseServices.resumes.findOneAndUpdate(
            {
                _id: new ObjectId(resumeId),
                userId: new ObjectId(userId)
            },
            {
                $set: {
                    title: version.content.title,
                    targetPosition: version.content.targetPosition,
                    industry: version.content.industry,
                    sections: version.content.sections,
                    'metadata.restoredFromVersion': versionNumber,
                    'metadata.updatedAt': new Date()
                }
            },
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new ErrorWithStatus({
                message: 'Failed to restore version',
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
            });
        }

        return result as unknown as IResume;
    }

    // So sánh hai phiên bản
    async compareVersions(
        resumeId: string,
        userId: string,
        versionA: number,
        versionB: number
    ): Promise<any> {
        const versionAData = await this.getVersionById(resumeId, userId, versionA);
        const versionBData = await this.getVersionById(resumeId, userId, versionB);

        // Logic so sánh sự khác biệt giữa hai phiên bản
        // Có thể sử dụng các thư viện như deep-diff để phân tích sự khác biệt

        return {
            versionA: versionAData,
            versionB: versionBData,
            // differences: ... // Phân tích sự khác biệt
        };
    }

    // Tính toán các chỉ số cho phiên bản
    private calculateMetrics(resume: IResume): IResumeVersion['metrics'] {
        let wordCount = 0;
        let characterCount = 0;

        // Tính toán số từ và ký tự từ tất cả các section
        resume.sections.forEach(section => {
            if (Array.isArray(section.content)) {
                section.content.forEach(item => {
                    Object.values(item).forEach(value => {
                        if (typeof value === 'string') {
                            characterCount += value.length;
                            wordCount += value.split(/\s+/).filter(Boolean).length;
                        }
                    });
                });
            }
        });

        return {
            wordCount,
            characterCount,
            sectionCount: resume.sections.length,
            estimatedReadTime: Math.ceil(wordCount / 200) // Ước tính 200 từ/phút
        };
    }

    // Xóa các phiên bản cũ dựa trên giới hạn gói
    private async cleanupOldVersions(resumeId: string | ObjectId, userId: string | ObjectId): Promise<void> {
        const resumeObjId = typeof resumeId === 'string' ? new ObjectId(resumeId) : resumeId;
        const userObjId = typeof userId === 'string' ? new ObjectId(userId) : userId;

        // Lấy thông tin người dùng để xác định giới hạn
        const user = await databaseServices.users.findOne({ _id: userObjId });
        if (!user) return;

        const versionLimit = user.tier === 'premium' ? VERSION_LIMITS.PREMIUM : VERSION_LIMITS.FREE;

        // Lấy danh sách phiên bản, sắp xếp theo số phiên bản giảm dần
        const versions = await databaseServices.database.collection('resumeVersions')
            .find({ resumeId: resumeObjId, userId: userObjId })
            .sort({ versionNumber: -1 })
            .toArray();

        // Nếu số lượng phiên bản vượt quá giới hạn, xóa các phiên bản cũ
        if (versions.length > versionLimit) {
            const versionsToDelete = versions.slice(versionLimit);
            const versionIdsToDelete = versionsToDelete.map(v => v._id);

            await databaseServices.database.collection('resumeVersions')
                .deleteMany({ _id: { $in: versionIdsToDelete } });
        }
    }
}

export const resumeVersionService = new ResumeVersionService();
export default resumeVersionService;
