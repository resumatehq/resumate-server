import nodemailer from 'nodemailer';
import { envConfig } from '~/constants/config';
import { logger } from '~/loggers/my-logger.log';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

class EmailService {
  private transporter!: nodemailer.Transporter;
  private isTransporterVerified: boolean = false;
  private emailTemplateCache: Record<string, string> = {};

  constructor() {
    this.initializeTransporter();
  }

  private async initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        host: envConfig.smtpHost,
        port: envConfig.smtpPort,
        secure: envConfig.smtpSecure,
        auth: {
          user: envConfig.smtpUser,
          pass: envConfig.smtpPassword // Should be an app password for Gmail
        },
        tls: {
          rejectUnauthorized: false
        },
        pool: true, // Use pooled connections
        maxConnections: 5, // Maximum number of simultaneous connections
        maxMessages: 100 // Maximum number of messages per connection
      });

      const verifyResult = await this.transporter.verify();
      this.isTransporterVerified = true;
      logger.info('SMTP server connection established successfully');
    } catch (error) {
      this.isTransporterVerified = false;
      logger.error('SMTP connection error:', error instanceof Error ? error.message : String(error));

      // Attempt to recreate transporter after delay if in production
      if (envConfig.nodeEnv === 'production') {
        setTimeout(() => this.initializeTransporter(), 60000); // Try again after 1 minute
      }
    }
  }

  private async getEmailTemplate(templateName: string, fallbackTemplate?: string): Promise<string> {
    try {
      if (this.emailTemplateCache[templateName]) {
        return this.emailTemplateCache[templateName];
      }

      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
      const readFile = promisify(fs.readFile);

      try {
        const template = await readFile(templatePath, 'utf8');
        this.emailTemplateCache[templateName] = template;
        return template;
      } catch (err) {
        if (fallbackTemplate) {
          return fallbackTemplate;
        }
        throw new Error(`Email template '${templateName}' not found`);
      }
    } catch (error) {
      logger.error(`Failed to load email template: ${templateName}`, '', '', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return a very basic fallback template if no template is found
      return fallbackTemplate || `
        <div>
          <h2>{{title}}</h2>
          <p>{{content}}</p>
          <a href="{{actionUrl}}">{{actionText}}</a>
        </div>
      `;
    }
  }

  private async renderTemplate(template: string, data: Record<string, string>): Promise<string> {
    let rendered = template;

    // Simple template rendering - replace all {{variables}}
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, value);
    }

    return rendered;
  }

  async sendVerificationEmail(to: string, username: string, verificationToken: string): Promise<boolean> {
    if (!this.isTransporterVerified) {
      logger.error('Cannot send email: SMTP transporter not verified');
      await this.initializeTransporter();
      throw new Error('Email service temporarily unavailable. Please try again later.');
    }

    const verificationLink = `${envConfig.clientUrl}/verify-email?token=${verificationToken}`;

    // Fallback inline template in case we can't load the file template
    const fallbackTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        <p>Hello {{username}},</p>
        <p>Thank you for registering! Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="{{verificationLink}}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p>{{verificationLink}}</p>
        <p>This link is valid for {{expiryTime}} after registration.</p>
        <p>If you did not create an account, please ignore this email.</p>
        <p>Best regards,<br>{{appName}} Team</p>
      </div>
    `;

    try {
      // Try to get the template, with fallback
      const template = await this.getEmailTemplate('verification-email', fallbackTemplate);

      // Render the template with data
      const htmlContent = await this.renderTemplate(template, {
        username,
        verificationLink,
        expiryTime: envConfig.emailVerifyTokenExpiresIn.toString(),
        appName: envConfig.appName,
        currentYear: new Date().getFullYear().toString()
      });

      const mailOptions = {
        from: `"${envConfig.appName}" <${envConfig.smtpUser}>`,
        to,
        subject: 'Verify your email address',
        html: htmlContent
      };

      // Send with retry logic
      let retries = 2;
      let success = false;
      let lastError;

      while (retries >= 0 && !success) {
        try {
          const info = await this.transporter.sendMail(mailOptions);
          logger.info(`Verification email sent to ${to}`, '', '', {
            messageId: info.messageId,
            recipient: to
          });
          success = true;
          return true;
        } catch (error) {
          lastError = error;
          retries--;
          if (retries >= 0) {
            logger.warn(`Failed to send email, retrying (${retries} attempts left)`, '', '', {
              error: error instanceof Error ? error.message : 'Unknown error',
              recipient: to
            });
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!success) {
        logger.error(`Failed to send verification email to ${to} after all retries`, '', '', {
          error: lastError instanceof Error ? lastError.message : 'Unknown error',
          recipient: to
        });
        throw lastError;
      }

      return success;
    } catch (error) {
      logger.error(`Failed to send verification email to ${to}`, '', '', {
        error: error instanceof Error ? error.message : 'Unknown error',
        recipient: to
      });
      throw error;
    }
  }
}

const emailService = new EmailService();
export default emailService; 