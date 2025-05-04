import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import officegen from 'officegen';
// import PDFDocument from 'pdfkit';
import { ObjectId } from 'mongodb';
import databaseServices from './database.service';
import { IUser } from '~/models/schemas/user.schema';

class ExportService {
    async exportToPdf(resumeId: string, userId: string, options: any = {}) {
        try {
            const resume = await databaseServices.resumes.findOne({
                _id: new ObjectId(resumeId),
                userId: new ObjectId(userId)
            });
            if (!resume) throw new Error('Resume not found');

            const template = await databaseServices.templates.findOne({
                _id: new ObjectId(resume.templateId.toString())
            });
            if (!template) throw new Error('Template not found');

            const user = await databaseServices.users.findOne({
                _id: new ObjectId(userId)
            });
            const needWatermark = user?.tier !== 'premium';

            const html = await this._renderHtml(resume, template);

            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: true,
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            if (needWatermark) {
                await page.evaluate(() => {
                    const watermark = document.createElement('div');
                    watermark.innerHTML = 'Created with Resumate';
                    watermark.style.position = 'fixed';
                    watermark.style.bottom = '10px';
                    watermark.style.right = '10px';
                    watermark.style.opacity = '0.5';
                    watermark.style.fontSize = '10px';
                    watermark.style.color = '#888';
                    document.body.appendChild(watermark);
                });
            }

            const pdfOptions = {
                format: 'A4',
                printBackground: true,
                margin: { top: '0.5cm', right: '0.5cm', bottom: '0.5cm', left: '0.5cm' },
                ...options,
            };

            const pdfBuffer = await page.pdf(pdfOptions);
            await browser.close();

            const filename = `${resume.title.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
            const tempPath = path.join(__dirname, '../temp', filename);
            fs.writeFileSync(tempPath, pdfBuffer);

            const fileUrl = await uploadFile(tempPath, `exports/${userId}/${filename}`, 'application/pdf');
            fs.unlinkSync(tempPath);

            // Update resume analytics
            const exportHistory = resume.analytics?.exportHistory || [];
            exportHistory.push({ format: 'pdf', timestamp: new Date() });

            await databaseServices.resumes.updateOne(
                { _id: new ObjectId(resumeId) },
                { $set: { 'analytics.exportHistory': exportHistory } }
            );

            // Update user usage
            await databaseServices.users.updateOne(
                { _id: new ObjectId(userId) },
                { $inc: { 'usage.exportsCount.pdf': 1 } }
            );

            return { fileUrl, filename };
        } catch (error) {
            console.error('PDF export error:', error);
            throw error;
        }
    }

    async exportToDocx(resumeId: string, userId: string) {
        try {
            const resume = await databaseServices.resumes.findOne({
                _id: new ObjectId(resumeId),
                userId: new ObjectId(userId)
            });
            if (!resume) throw new Error('Resume not found');

            const docx = officegen('docx');
            const filename = `${resume.title.replace(/\s+/g, '_')}_${Date.now()}.docx`;
            const tempPath = path.join(__dirname, '../temp', filename);

            await this._createDocxContent(docx, resume); // Bạn cần tự định nghĩa hàm này nếu chưa có

            return new Promise<{ fileUrl: string; filename: string }>((resolve, reject) => {
                const outputStream = fs.createWriteStream(tempPath);

                outputStream.on('error', (err) => {
                    console.error('Error writing DOCX file:', err);
                    reject(err);
                });

                outputStream.on('close', async () => {
                    try {
                        const fileUrl = await uploadFile(
                            tempPath,
                            `exports/${userId}/${filename}`,
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        );
                        fs.unlinkSync(tempPath);

                        // Update resume analytics
                        const exportHistory = resume.analytics?.exportHistory || [];
                        exportHistory.push({ format: 'docx', timestamp: new Date() });

                        await databaseServices.resumes.updateOne(
                            { _id: new ObjectId(resumeId) },
                            { $set: { 'analytics.exportHistory': exportHistory } }
                        );

                        // Update user usage
                        await databaseServices.users.updateOne(
                            { _id: new ObjectId(userId) },
                            { $inc: { 'usage.exportsCount.docx': 1 } }
                        );

                        resolve({ fileUrl, filename });
                    } catch (error) {
                        reject(error);
                    }
                });

                docx.generate(outputStream);
            });
        } catch (error) {
            console.error('DOCX export error:', error);
            throw error;
        }
    }

    async exportToPng(resumeId: string, userId: string) {
        try {
            const resume = await databaseServices.resumes.findOne({
                _id: new ObjectId(resumeId),
                userId: new ObjectId(userId)
            });
            if (!resume) throw new Error('Resume not found');

            const template = await databaseServices.templates.findOne({
                _id: new ObjectId(resume.templateId.toString())
            });
            if (!template) throw new Error('Template not found');

            const html = await this._renderHtml(resume, template);

            const browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: true,
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            const pngBuffer = await page.screenshot({
                type: 'png',
                fullPage: true,
                omitBackground: false,
            });

            await browser.close();

            const filename = `${resume.title.replace(/\s+/g, '_')}_${Date.now()}.png`;
            const tempPath = path.join(__dirname, '../temp', filename);
            fs.writeFileSync(tempPath, pngBuffer);

            const fileUrl = await uploadFile(tempPath, `exports/${userId}/${filename}`, 'image/png');
            fs.unlinkSync(tempPath);

            // Update resume analytics
            const exportHistory = resume.analytics?.exportHistory || [];
            exportHistory.push({ format: 'png', timestamp: new Date() });

            await databaseServices.resumes.updateOne(
                { _id: new ObjectId(resumeId) },
                { $set: { 'analytics.exportHistory': exportHistory } }
            );

            // Update user usage
            await databaseServices.users.updateOne(
                { _id: new ObjectId(userId) },
                { $inc: { 'usage.exportsCount.png': 1 } }
            );

            return { fileUrl, filename };
        } catch (error) {
            console.error('PNG export error:', error);
            throw error;
        }
    }

    async exportToJson(resumeId: string, userId: string) {
        try {
            const resume = await databaseServices.resumes.findOne({
                _id: new ObjectId(resumeId),
                userId: new ObjectId(userId)
            });
            if (!resume) throw new Error('Resume not found');

            const jsonData = JSON.stringify(resume.toObject(), null, 2);
            const filename = `${resume.title.replace(/\s+/g, '_')}_${Date.now()}.json`;
            const tempPath = path.join(__dirname, '../temp', filename);
            fs.writeFileSync(tempPath, jsonData);

            const fileUrl = await uploadFile(tempPath, `exports/${userId}/${filename}`, 'application/json');
            fs.unlinkSync(tempPath);

            // Update resume analytics
            const exportHistory = resume.analytics?.exportHistory || [];
            exportHistory.push({ format: 'json', timestamp: new Date() });

            await databaseServices.resumes.updateOne(
                { _id: new ObjectId(resumeId) },
                { $set: { 'analytics.exportHistory': exportHistory } }
            );

            return { fileUrl, filename };
        } catch (error) {
            console.error('JSON export error:', error);
            throw error;
        }
    }

    private async _renderHtml(resume: any, template: any): Promise<string> {
        const head = `
      <head>
        <meta charset="UTF-8">
        <title>${resume.title}</title>
        <style>
          ${template.styling.css || ''}
          @page { size: A4; margin: 0; }
          body { margin: 0; padding: 0; }
        </style>
      </head>
    `;

        const body = `<body>${this._renderResumeContent(resume, template)}</body>`;
        return `<!DOCTYPE html><html>${head}${body}</html>`;
    }

    private _renderResumeContent(resume: any, template: any): string {
        let html = '<div class="resume-container">';
        const sortedSections = [...resume.sections].sort((a, b) => a.order - b.order);

        for (const section of sortedSections) {
            if (!section.enabled) continue;

            html += `<div class="resume-section" data-type="${section.type}">`;
            html += `<h2 class="section-title">${section.title}</h2>`;

            switch (section.type) {
                case 'personal':
                    html += this._renderPersonalSection(section);
                    break;
                case 'summary':
                    html += this._renderSummarySection(section);
                    break;
                case 'experience':
                    html += this._renderExperienceSection(section);
                    break;
                case 'education':
                    html += this._renderEducationSection(section);
                    break;
                case 'skills':
                    html += this._renderSkillsSection(section);
                    break;
                case 'projects':
                    html += this._renderProjectsSection(section);
                    break;
                default:
                    html += this._renderCustomSection(section);
            }

            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    private _renderPersonalSection(section: any): string {
        return `
      <div class="personal-info">
        <h1>${section.content.fullName || ''}</h1>
        <p>${section.content.title || ''}</p>
        <div class="contact-info">
          <p>${section.content.email || ''}</p>
          <p>${section.content.phone || ''}</p>
          <p>${section.content.location || ''}</p>
        </div>
      </div>
    `;
    }

    private _renderSummarySection(section: any): string {
        return `<div class="summary">${section.content.summary || ''}</div>`;
    }

    private _renderExperienceSection(section: any): string {
        let html = '<div class="experience-items">';
        if (section.content.items?.length) {
            for (const item of section.content.items) {
                html += `
          <div class="experience-item">
            <div class="job-header">
              <h3>${item.title || ''}</h3>
              <p>${item.company || ''}</p>
              <p>${item.location || ''}</p>
              <p>${item.startDate || ''} - ${item.endDate || 'Present'}</p>
            </div>
            <div class="job-description">${item.description || ''}</div>
          </div>
        `;
            }
        }
        html += '</div>';
        return html;
    }

    private _renderEducationSection(section: any): string {
        let html = '<div class="education-items">';
        if (section.content.items?.length) {
            for (const item of section.content.items) {
                html += `
          <div class="education-item">
            <h3>${item.degree || ''}</h3>
            <p>${item.institution || ''}</p>
            <p>${item.location || ''}</p>
            <p>${item.startDate || ''} - ${item.endDate || 'Present'}</p>
            <div>${item.description || ''}</div>
          </div>
        `;
            }
        }
        html += '</div>';
        return html;
    }

    private _renderSkillsSection(section: any): string {
        let html = '<ul class="skills-list">';
        if (section.content.skills?.length) {
            for (const skill of section.content.skills) {
                html += `<li>${skill}</li>`;
            }
        }
        html += '</ul>';
        return html;
    }

    private _renderProjectsSection(section: any): string {
        let html = '<div class="project-items">';
        if (section.content.items?.length) {
            for (const project of section.content.items) {
                html += `
          <div class="project-item">
            <h3>${project.name || ''}</h3>
            <p>${project.description || ''}</p>
            <p><strong>Tech:</strong> ${project.technologies?.join(', ') || ''}</p>
            <p><a href="${project.link || '#'}" target="_blank">${project.link || ''}</a></p>
          </div>
        `;
            }
        }
        html += '</div>';
        return html;
    }

    private _renderCustomSection(section: any): string {
        return `
      <div class="custom-section">
        <p>${section.content.text || ''}</p>
      </div>
    `;
    }
}

export const exportService = new ExportService();
