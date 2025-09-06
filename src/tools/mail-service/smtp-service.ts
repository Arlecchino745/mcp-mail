import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { MailConfig, MailInfo } from './types.js';

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
    });
  }

  /**
   * Send mail
   */
  async sendMail(mailInfo: MailInfo): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const mailOptions = {
        from: {
          name: this.config.defaults.fromName,
          address: this.config.defaults.fromEmail,
        },
        to: mailInfo.to,
        cc: mailInfo.cc,
        bcc: mailInfo.bcc,
        subject: mailInfo.subject,
        text: mailInfo.text,
        html: mailInfo.html,
        attachments: mailInfo.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
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
