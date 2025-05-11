import { uploadFile, uploadMultipleFiles } from '~/utils/file-uploader';
import { Request, Response, NextFunction } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import { envConfig } from '~/constants/config';

export const uploadMiddleware = async (req: Request<ParamsDictionary>, res: Response, next: NextFunction) => {
    try {
        if (!req.file && !req.files) {
            return next();
        }

        const {
            upload_service = envConfig.defaultUploadService,
            folder = "Resumate/User/Avatar",
            file_type = req.file?.mimetype?.startsWith('image/') ? "image" : "raw"
        } = req.body;

        console.log('Processing file upload:', {
            hasFile: !!req.file,
            hasFiles: !!req.files,
            mimetype: req.file?.mimetype || '',
            fileType: file_type,
            uploadService: upload_service
        });

        if (req.file) {
            const fileUrl = await uploadFile({
                file: req.file,
                upload_service,
                folder,
                fileType: file_type as "image" | "video" | "raw" | "auto",
            });

            console.log('Upload successful, file URL:', fileUrl);

            req.file_url = fileUrl;

            if (file_type === "image" || req.file.mimetype.startsWith('image/')) {
                req.body.avatar_url = fileUrl;
            }

            return next();
        }

        if (req.files && Array.isArray(req.files)) {
            const fileUrls = await uploadMultipleFiles({
                files: req.files,
                upload_service,
                folder,
                fileType: file_type as "image" | "video" | "raw" | "auto",
            });

            console.log('Multiple files upload successful, URLs:', fileUrls);
            req.file_urls = fileUrls;
            return next();
        }

        next();
    } catch (error) {
        console.error('File upload error:', error);
        const err = error as Error;
        res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({ error: err.message });
    }
};

