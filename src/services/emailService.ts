import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

class EmailService {
    private transporter: nodemailer.Transporter;
    private fromEmail: string;

    constructor() {
        this.fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@ems.com';

        // Check if SMTP is configured
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
            logger.info('Initializing EmailService with SMTP:', {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER,
                secure: process.env.SMTP_SECURE
            });

            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            // Verify connection configuration
            this.transporter.verify(function (error, success) {
                if (error) {
                    logger.error('SMTP Connection Error:', error);
                } else {
                    logger.info("SMTP Server is ready to take our messages");
                }
            });
        } else {
            // Create a placeholder transporter for development/logging
            this.transporter = nodemailer.createTransport({
                jsonTransport: true
            });
            logger.warn('SMTP not configured. Emails will be logged but not sent.');
        }
    }

    /**
     * Send email notification for a new leave request
     */
    async sendLeaveRequestEmail(
        to: string,
        employeeName: string,
        subject: string,
        reason: string,
        startDate: Date,
        endDate: Date
    ): Promise<boolean> {
        try {
            logger.info('Attempting to send leave request email', { to, employeeName });

            const dateStr = startDate.toLocaleDateString() + ' to ' + endDate.toLocaleDateString();

            const html = `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #4A148C;">New Leave Request</h2>
                    <p><strong>${employeeName}</strong> has requested leave.</p>
                    <hr style="border: 1px solid #eee; margin: 20px 0;">
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Dates:</strong> ${dateStr}</p>
                    <p><strong>Reason:</strong><br>${reason}</p>
                    <hr style="border: 1px solid #eee; margin: 20px 0;">
                    <p>Please log in to the app to approve or reject this request.</p>
                </div>
            `;

            const info = await this.transporter.sendMail({
                from: '"EMS Notification" <' + this.fromEmail + '>',
                to,
                subject: 'Leave Request: ' + employeeName + ' - ' + subject,
                html,
            });

            logger.info('Leave request email sent', { messageId: (info as any).messageId, to, response: info });
            return true;
        } catch (error) {
            logger.error('Failed to send leave request email', { error: (error as any).message, stack: (error as any).stack });
            return false;
        }
    }

    /**
     * Send email notification for leave status update
     */
    async sendLeaveStatusUpdateEmail(
        to: string,
        employeeName: string,
        status: 'APPROVED' | 'REJECTED' | 'REVOKED',
        startDate: Date,
        endDate: Date,
        approverName?: string,
        responseSubject?: string,
        responseReason?: string
    ): Promise<boolean> {
        try {
            const dateStr = startDate.toLocaleDateString() + ' to ' + endDate.toLocaleDateString();
            const color = status === 'APPROVED' ? '#2E7D32' : (status === 'REJECTED' ? '#C62828' : '#EF6C00');

            let html = '<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">';
            html += '<h2 style="color: ' + color + ';">Leave Request ' + status + '</h2>';
            html += '<p>Hello <strong>' + employeeName + '</strong>,</p>';
            html += '<p>Your leave request for <strong>' + dateStr + '</strong> has been <strong>' + status + '</strong>.</p>';

            if (responseSubject) {
                html += '<p><strong>Subject:</strong> ' + responseSubject + '</p>';
            }
            if (responseReason) {
                html += '<p><strong>Message:</strong><br>' + responseReason + '</p>';
            }

            if (approverName) {
                html += '<p style="font-size: 0.9em; color: #666;">Processed by: ' + approverName + '</p>';
            }

            html += '<hr style="border: 1px solid #eee; margin: 20px 0;">';
            html += '<p>Log in to the app for more details.</p>';
            html += '</div>';

            const info = await this.transporter.sendMail({
                from: '"EMS Notification" <' + this.fromEmail + '>',
                to,
                subject: (responseSubject || ('Leave Request ' + status)) + ': ' + dateStr,
                html,
            });

            logger.info('Leave status update email sent', { messageId: (info as any).messageId, to, status });
            return true;
        } catch (error) {
            logger.error('Failed to send leave status email', { error });
            return false;
        }
    }
}

export const emailService = new EmailService();
