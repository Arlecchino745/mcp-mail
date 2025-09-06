import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { MailConfig, MailInfo } from './types.js';
import { SecurityEnhancement } from '../security-enhancement.js';

/**
 * SMTP service for sending emails
 */
export class SmtpService {
  private transporter!: nodemailer.Transporter;
  private config: MailConfig;

  constructor(config: MailConfig) {
    this.config = config;
    this.createTransporter();
  }

  /**
   * Create SMTP transporter
   */
  private createTransporter(): void {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.auth.user,
        pass: this.config.smtp.auth.pass,
      },
      tls: SecurityEnhancement.getSecureTLSOptions(),
    });

    // Verify connection configuration
    this.verifyConnection();
  }

  /**
   * Verify SMTP connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      SecurityEnhancement.logSecurityEvent('SMTP connection verified', { 
        host: this.config.smtp.host, 
        port: this.config.smtp.port,
        secure: this.config.smtp.secure
      });
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('SMTP connection verification failed', { 
        host: this.config.smtp.host, 
        error: error instanceof Error ? error.message : String(error) 
      });
      console.error('SMTP verification failed:', error);
    }
  }

  /**
   * Send mail
   */
  async sendMail(mailInfo: MailInfo): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Sanitize email content for security
      const sanitizedText = mailInfo.text ? SecurityEnhancement.sanitizeEmailContent(mailInfo.text) : undefined;
      const sanitizedHtml = mailInfo.html ? SecurityEnhancement.sanitizeEmailContent(mailInfo.html) : undefined;

      const mailOptions = {
        from: {
          name: this.config.defaults.fromName,
          address: this.config.defaults.fromEmail,
        },
        to: mailInfo.to,
        cc: mailInfo.cc,
        bcc: mailInfo.bcc,
        subject: mailInfo.subject,
        text: sanitizedText,
        html: sanitizedHtml,
        attachments: mailInfo.attachments,
      };

      SecurityEnhancement.logSecurityEvent('Sending email', { 
        to: mailInfo.to, 
        subject: mailInfo.subject,
        hasAttachments: !!(mailInfo.attachments && mailInfo.attachments.length > 0)
      });

      const info = await this.transporter.sendMail(mailOptions);
      
      SecurityEnhancement.logSecurityEvent('Email sent successfully', { 
        messageId: info.messageId 
      });
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('Email send failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      console.error('Send mail error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Close SMTP connection
   */
  async close(): Promise<void> {
    if (this.transporter) {
      await promisify(this.transporter.close.bind(this.transporter))();
    }
  }
}
