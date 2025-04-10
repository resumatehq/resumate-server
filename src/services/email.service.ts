import nodemailer from 'nodemailer';
import { envConfig } from '~/constants/config';

class EmailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: envConfig.smtpHost,
            port: envConfig.smtpPort,
            secure: envConfig.smtpSecure,
            auth: {
                user: envConfig.smtpUser,
                pass: envConfig.smtpPassword
            }
        });
    }

    async sendVerificationEmail(to: string, username: string, verificationToken: string) {
        const verificationLink = `${envConfig.clientUrl}/verify-email?token=${verificationToken}`;

        const mailOptions = {
            from: `"${envConfig.appName}" <${envConfig.smtpUser}>`,
            to,
            subject: 'Verify your email address',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Hello ${username},</p>
          <p>Thank you for registering! Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${verificationLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p>${verificationLink}</p>
          <p>This link is valid for ${envConfig.emailVerifyTokenExpiresIn} after registration.</p>
          <p>If you did not create an account, please ignore this email.</p>
          <p>Best regards,<br>${envConfig.appName} Team</p>
        </div>
      `
        };

        return this.transporter.sendMail(mailOptions);
    }
}

const emailService = new EmailService();
export default emailService; 