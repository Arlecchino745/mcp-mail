import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { MailConfig, MailInfo } from './types.js';
import { SecurityEnhancement, EmailRateLimiters, Logger, HtmlSanitizer, ContentSecurity } from '../security/index.js';

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
      
      const logger = Logger.getInstance();
      logger.error('SMTP verification failed', {
        host: this.config.smtp.host,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Send mail
   */
  async sendMail(mailInfo: MailInfo): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Rate limiting check
      const userEmail = this.config.defaults.fromEmail;
      const rateLimitResult = EmailRateLimiters.sendMail.isAllowed(userEmail);
      
      if (!rateLimitResult.allowed) {
        SecurityEnhancement.logSecurityEvent('Rate limit exceeded for sendMail', {
          userEmail,
          resetIn: rateLimitResult.resetIn
        });
        return {
          success: false,
          error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 1000)} seconds.`
        };
      }

      // Validate email addresses to prevent injection
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      // Validate 'to' addresses
      const toAddresses = Array.isArray(mailInfo.to) ? mailInfo.to : [mailInfo.to];
      for (const addr of toAddresses) {
        if (!emailRegex.test(addr)) {
          SecurityEnhancement.logSecurityEvent('Invalid email address in TO field', { address: addr });
          return { success: false, error: `Invalid email address: ${addr}` };
        }
      }

      // Validate 'cc' addresses if present
      if (mailInfo.cc) {
        const ccAddresses = Array.isArray(mailInfo.cc) ? mailInfo.cc : [mailInfo.cc];
        for (const addr of ccAddresses) {
          if (!emailRegex.test(addr)) {
            SecurityEnhancement.logSecurityEvent('Invalid email address in CC field', { address: addr });
            return { success: false, error: `Invalid email address in CC: ${addr}` };
          }
        }
      }

      // Validate 'bcc' addresses if present
      if (mailInfo.bcc) {
        const bccAddresses = Array.isArray(mailInfo.bcc) ? mailInfo.bcc : [mailInfo.bcc];
        for (const addr of bccAddresses) {
          if (!emailRegex.test(addr)) {
            SecurityEnhancement.logSecurityEvent('Invalid email address in BCC field', { address: addr });
            return { success: false, error: `Invalid email address in BCC: ${addr}` };
          }
        }
      }

      // Sanitize email content for security
      const sanitizedText = mailInfo.text ? HtmlSanitizer.sanitizeEmailContent(mailInfo.text) : undefined;
      const sanitizedHtml = mailInfo.html ? HtmlSanitizer.sanitizeEmailContent(mailInfo.html) : undefined;

      // Validate and sanitize subject
      let sanitizedSubject = mailInfo.subject;
      if (sanitizedSubject.length > 998) { // RFC 5322 limit
        sanitizedSubject = sanitizedSubject.substring(0, 995) + '...';
        SecurityEnhancement.logSecurityEvent('Email subject truncated', { 
          originalLength: mailInfo.subject.length 
        });
      }

      // Remove control characters from subject
      sanitizedSubject = sanitizedSubject.replace(/[\x00-\x1F\x7F]/g, '');

      const mailOptions = {
        from: {
          name: this.config.defaults.fromName,
          address: this.config.defaults.fromEmail,
        },
        to: mailInfo.to,
        cc: mailInfo.cc,
        bcc: mailInfo.bcc,
        subject: sanitizedSubject,
        text: sanitizedText,
        html: sanitizedHtml,
        attachments: mailInfo.attachments,
      };

      SecurityEnhancement.logSecurityEvent('Sending email', { 
        to: Array.isArray(mailInfo.to) ? mailInfo.to.length : 1, 
        subject: sanitizedSubject,
        hasAttachments: !!(mailInfo.attachments && mailInfo.attachments.length > 0),
        textLength: sanitizedText?.length || 0,
        htmlLength: sanitizedHtml?.length || 0
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
      
      const logger = Logger.getInstance();
      logger.error('Send mail error', {
        error: error instanceof Error ? error.message : String(error)
      });
      
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
