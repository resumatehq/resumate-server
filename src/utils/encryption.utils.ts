import crypto from 'crypto';
import { envConfig } from '~/constants/config';

const ENCRYPTION_KEY = envConfig.encryptionKey; // 32 bytes
// const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;  // AES block size

if (ENCRYPTION_KEY.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters long");
}

export function encrypt(text: string | null | undefined): string {
    if (!text) {
        throw new Error("Invalid input: text is null or undefined");
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string | null | undefined): string {
    if (!encryptedText) {
        throw new Error("Invalid input: encryptedText is null or undefined");
    }

    const textParts = encryptedText.split(':');
    if (textParts.length < 2) {
        throw new Error("Invalid encryptedText format: must contain IV and encrypted data");
    }

    const iv = Buffer.from(textParts.shift()!, 'hex');
    if (iv.length !== IV_LENGTH) {
        throw new Error("Invalid IV length: must be 16 bytes");
    }

    const encrypted = textParts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
