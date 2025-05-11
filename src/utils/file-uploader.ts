import cloudinary from '~/config/cloudinary';
import stream from 'stream';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { envConfig } from '~/constants/config';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Initialize S3 client
const s3Client = new S3Client({
    region: envConfig.awsRegion,
    credentials: {
        accessKeyId: envConfig.awsAccessKeyId,
        secretAccessKey: envConfig.awsSecretAccessKey,
    },
});

export const uploadToCloudinary = async (
    file: Express.Multer.File,
    folder: string,
    resourceType: "image" | "video" | "raw" | "auto"
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
                delivery_type: 'upload',
                access_mode: 'public',
                transformation: [
                    { quality: 'auto:good' }
                ]
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    return reject(new Error(`Cloudinary upload failed: ${error.message}`));
                }
                if (!result?.secure_url) {
                    return reject(new Error('No secure URL returned from Cloudinary'));
                }
                // Log thông tin kết quả upload
                console.log('Cloudinary upload result:', {
                    public_id: result.public_id,
                    secure_url: result.secure_url,
                    format: result.format,
                    size: result.bytes,
                });
                resolve(result.secure_url);
            }
        );

        const bufferStream = new stream.PassThrough();
        bufferStream.end(file.buffer);
        bufferStream.pipe(uploadStream);
    });
};

export const uploadToS3 = async (
    file: Express.Multer.File,
    folder: string,
    fileType: "image" | "video" | "raw" | "auto"
): Promise<string> => {
    try {
        let buffer = file.buffer;
        let contentType = file.mimetype;

        // If it's an image and not a PDF, optimize it
        if (fileType === "image" && !file.mimetype.includes('pdf')) {
            buffer = await optimizeImage(file.buffer, file.mimetype);
        }

        // Generate a unique filename
        const fileExtension = path.extname(file.originalname);
        const fileName = `${folder}/${uuidv4()}${fileExtension}`;

        // Upload to S3
        const command = new PutObjectCommand({
            Bucket: envConfig.awsS3Bucket,
            Key: fileName,
            Body: buffer,
            ContentType: contentType,
            ACL: 'public-read'
        });

        await s3Client.send(command);

        // Return the URL to the uploaded file
        return `https://${envConfig.awsS3Bucket}.s3.${envConfig.awsRegion}.amazonaws.com/${fileName}`;
    } catch (error) {
        const err = error as Error;
        throw new Error(`AWS S3 upload failed: ${err.message}`);
    }
};

// Image optimization function
export const optimizeImage = async (buffer: Buffer, mimeType: string): Promise<Buffer> => {
    try {
        // Don't process if not an image
        if (!mimeType.startsWith('image/')) {
            return buffer;
        }

        let image = sharp(buffer);

        // Get image metadata
        const metadata = await image.metadata();

        // If image is larger than 1500px in any dimension, resize it
        if ((metadata.width && metadata.width > 1500) || (metadata.height && metadata.height > 1500)) {
            image = image.resize({
                width: 1500,
                height: 1500,
                fit: 'inside',
                withoutEnlargement: true
            });
        }

        // If it's a JPEG or PNG, optimize it
        if (mimeType === 'image/jpeg') {
            return await image.jpeg({ quality: 85 }).toBuffer();
        } else if (mimeType === 'image/png') {
            return await image.png({ compressionLevel: 9 }).toBuffer();
        }

        // For other formats, just return the processed buffer
        return await image.toBuffer();
    } catch (error) {
        console.error('Image optimization failed:', error);
        // If optimization fails, return original buffer
        return buffer;
    }
};

export async function uploadFile({
    file,
    upload_service = "cloudinary",
    folder = "default_folder",
    fileType = "raw",
}: {
    file: Express.Multer.File;
    upload_service: "cloudinary" | "s3";
    folder?: string;
    fileType?: "image" | "video" | "raw" | "auto";
}): Promise<string> {
    switch (upload_service) {
        case "cloudinary":
            return await uploadToCloudinary(file, folder, fileType);
        case "s3":
            return await uploadToS3(file, folder, fileType);
        default:
            throw new Error("Unsupported upload service");
    }
}

// Support for multiple file uploads
export async function uploadMultipleFiles({
    files,
    upload_service = "cloudinary",
    folder = "default_folder",
    fileType = "raw",
}: {
    files: Express.Multer.File[];
    upload_service: "cloudinary" | "s3";
    folder?: string;
    fileType?: "image" | "video" | "raw" | "auto";
}): Promise<string[]> {
    const uploadPromises = files.map(file =>
        uploadFile({
            file,
            upload_service,
            folder,
            fileType
        })
    );

    return Promise.all(uploadPromises);
}
