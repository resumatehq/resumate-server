import multer from 'multer';
import path from 'path';
import { Request } from "express";

const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const fileTypes = /jpeg|jpg|png|gif|webp|heic|pdf|doc|docx/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error("Unsupported file type"));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 1024 * 1024 * 20 }, // 20 MB
});

export const uploadSingle = (fieldName: string) => upload.single(fieldName);
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => upload.array(fieldName, maxCount);
export const uploadFields = (fields: { name: string, maxCount?: number }[]) => upload.fields(fields);

export default upload;
