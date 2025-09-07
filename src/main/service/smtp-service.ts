import nodemailer from 'nodemailer';
import { promisify } from 'util';
import { MailConfig, MailInfo } from './types.js';
import { SecurityEnhancement, EmailRateLimiters, Logger, HtmlSanitizer } from '../security/index.js';

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
    const transportOptions = {
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.auth.user,
        pass: this.config.smtp.auth.pass,
      },
      tls: {
        ...SecurityEnhancement.getSecureTLSOptions(),
        // Allow fallback for servers with self-signed certificates in development
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      },
      // Connection timeout settings - optimized for faster response
      connectionTimeout: 20000, // 20 seconds
      greetingTimeout: 15000,   // 15 seconds to wait for greeting
      socketTimeout: 30000,     // 30 seconds for socket timeout
      // Pool settings for better connection management
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Retry settings - reduced for faster response
      retryDelay: 1000,
      maxRetries: 2,
      // Debug logging in development
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    } as any; // Type assertion to handle nodemailer's complex types

    this.transporter = nodemailer.createTransport(transportOptions);

    // Verify connection configuration - make it optional for faster startup
    if (process.env.SKIP_SMTP_VERIFICATION !== 'true') {
      this.verifyConnection();
    } else {
      console.log('SMTP verification skipped for faster startup');
    }
  }

  /**
   * Verify SMTP connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      console.log(`Attempting to verify SMTP connection to ${this.config.smtp.host}:${this.config.smtp.port}`);
      
      // Add timeout wrapper for verification - reduced timeout
      const verificationPromise = this.transporter.verify();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection verification timeout')), 15000);
      });

      await Promise.race([verificationPromise, timeoutPromise]);
      
      SecurityEnhancement.logSecurityEvent('SMTP connection verified', { 
        host: this.config.smtp.host, 
        port: this.config.smtp.port,
        secure: this.config.smtp.secure
      });
      
      console.log(`✓ SMTP connection verified successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      SecurityEnhancement.logSecurityEvent('SMTP connection verification failed', {
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        error: errorMessage
      });
      
      const logger = Logger.getInstance();
      logger.error('SMTP verification failed', {
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        error: errorMessage
      });

      console.error(`✗ SMTP connection verification failed: ${errorMessage}`);
      
      // Provide specific guidance based on the error
      if (errorMessage.includes('Greeting never received')) {
        console.error(`
Troubleshooting "Greeting never received" error:
1. Check if the SMTP host and port are correct
2. Verify network connectivity to ${this.config.smtp.host}:${this.config.smtp.port}
3. Check if your firewall allows outbound connections to this port
4. Try using a different port (587 for STARTTLS, 465 for SSL, 25 for plain)
5. Verify the 'secure' setting matches your server configuration
6. Some email providers require app-specific passwords instead of regular passwords

Current configuration:
- Host: ${this.config.smtp.host}
- Port: ${this.config.smtp.port}
- Secure: ${this.config.smtp.secure}
- User: ${this.config.smtp.auth.user}
        `);
      } else if (errorMessage.includes('ECONNREFUSED')) {
        console.error(`Connection refused - check if the SMTP server is running and the port is correct`);
      } else if (errorMessage.includes('ENOTFOUND')) {
        console.error(`Host not found - check if the SMTP hostname is correct`);
      } else if (errorMessage.includes('timeout')) {
        console.error(`Connection timeout - the server may be slow or unreachable`);
      }
    }
  }

  /**
   * Send mail with retry logic - optimized for faster response
   */
  async sendMail(mailInfo: MailInfo): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const maxRetries = 2; // Reduced from 3
    const retryDelay = 1000; // Reduced from 2000ms
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendMailAttempt(mailInfo, attempt);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Don't retry for authentication or validation errors
        if (errorMessage.includes('Invalid login') || 
            errorMessage.includes('Authentication failed') ||
            errorMessage.includes('Invalid email address') ||
            errorMessage.includes('Rate limit exceeded')) {
          return { success: false, error: errorMessage };
        }
        
        // Retry for connection issues
        if (attempt < maxRetries && (
            errorMessage.includes('Greeting never received') ||
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ECONNRESET') ||
            errorMessage.includes('timeout')
        )) {
          console.log(`Email send attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
          SecurityEnhancement.logSecurityEvent('Email send retry', {
            attempt,
            error: errorMessage,
            retryIn: retryDelay
          });
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Recreate transporter for connection issues
          this.createTransporter();
          continue;
        }
        
        // Final attempt or non-retryable error
        SecurityEnhancement.logSecurityEvent('Email send failed after retries', {
          attempts: attempt,
          error: errorMessage
        });
        
        return { success: false, error: errorMessage };
      }
    }
    
    return { success: false, error: 'Maximum retry attempts exceeded' };
  }

  /**
   * Single email send attempt
   */
  private async sendMailAttempt(mailInfo: MailInfo, attempt: number): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // Rate limiting check
    const userEmail = this.config.defaults.fromEmail;
    const rateLimitResult = EmailRateLimiters.sendMail.isAllowed(userEmail);
    
    if (!rateLimitResult.allowed) {
      SecurityEnhancement.logSecurityEvent('Rate limit exceeded for sendMail', {
        userEmail,
        resetIn: rateLimitResult.resetIn
      });
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(rateLimitResult.resetIn / 1000)} seconds.`);
    }

    // Validate email addresses to prevent injection
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    // Validate 'to' addresses
    const toAddresses = Array.isArray(mailInfo.to) ? mailInfo.to : [mailInfo.to];
    for (const addr of toAddresses) {
      if (!emailRegex.test(addr)) {
        SecurityEnhancement.logSecurityEvent('Invalid email address in TO field', { address: addr });
        throw new Error(`Invalid email address: ${addr}`);
      }
    }

    // Validate 'cc' addresses if present
    if (mailInfo.cc) {
      const ccAddresses = Array.isArray(mailInfo.cc) ? mailInfo.cc : [mailInfo.cc];
      for (const addr of ccAddresses) {
        if (!emailRegex.test(addr)) {
          SecurityEnhancement.logSecurityEvent('Invalid email address in CC field', { address: addr });
          throw new Error(`Invalid email address in CC: ${addr}`);
        }
      }
    }

    // Validate 'bcc' addresses if present
    if (mailInfo.bcc) {
      const bccAddresses = Array.isArray(mailInfo.bcc) ? mailInfo.bcc : [mailInfo.bcc];
      for (const addr of bccAddresses) {
        if (!emailRegex.test(addr)) {
          SecurityEnhancement.logSecurityEvent('Invalid email address in BCC field', { address: addr });
          throw new Error(`Invalid email address in BCC: ${addr}`);
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
      htmlLength: sanitizedHtml?.length || 0,
      attempt
    });

    if (attempt > 1) {
      console.log(`Attempting email send (attempt ${attempt})...`);
    }

    // Add timeout wrapper for sending - reduced timeout
    const sendPromise = this.transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Email send timeout')), 30000);
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    
    SecurityEnhancement.logSecurityEvent('Email sent successfully', { 
      messageId: info.messageId,
      attempt
    });
    
    console.log(`✓ Email sent successfully (attempt ${attempt}), message ID: ${info.messageId}`);
    
    return { success: true, messageId: info.messageId };
  }

  /**
   * Diagnostic function to test SMTP connection with detailed feedback
   */
  async testConnection(): Promise<{ success: boolean; details: string[] }> {
    const details: string[] = [];
    
    details.push(`Testing SMTP connection to ${this.config.smtp.host}:${this.config.smtp.port}`);
    details.push(`Secure mode: ${this.config.smtp.secure ? 'SSL/TLS' : 'STARTTLS/Plain'}`);
    details.push(`Authentication user: ${this.config.smtp.auth.user}`);
    
    try {
      // Test basic network connectivity
      details.push('Checking network connectivity...');
      
      // Create a test transporter with more relaxed settings for diagnosis
      const testTransporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: {
          user: this.config.smtp.auth.user,
          pass: this.config.smtp.auth.pass,
        },
        tls: {
          // More relaxed TLS settings for testing
          rejectUnauthorized: false,
          minVersion: 'TLSv1',
          ciphers: 'ALL'
        },
        connectionTimeout: 30000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        debug: true,
        logger: true
      } as any);

      details.push('Attempting connection with relaxed security settings...');
      await testTransporter.verify();
      details.push('✓ Connection successful with relaxed settings');
      
      // Now test with secure settings
      details.push('Testing with secure settings...');
      await this.transporter.verify();
      details.push('✓ Connection successful with secure settings');
      
      await promisify(testTransporter.close.bind(testTransporter))();
      
      return { success: true, details };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      details.push(`✗ Connection failed: ${errorMessage}`);
      
      // Provide specific troubleshooting advice
      if (errorMessage.includes('Greeting never received')) {
        details.push('');
        details.push('Troubleshooting "Greeting never received":');
        details.push('- The server may be slow to respond');
        details.push('- Check if the port is correct (587 for STARTTLS, 465 for SSL)');
        details.push('- Verify the hostname is accessible');
        details.push('- Check firewall/proxy settings');
        details.push('- Try connecting from a different network');
      } else if (errorMessage.includes('ECONNREFUSED')) {
        details.push('');
        details.push('Connection refused - possible causes:');
        details.push('- Wrong port number');
        details.push('- SMTP service not running on the server');
        details.push('- Firewall blocking the connection');
      } else if (errorMessage.includes('ENOTFOUND')) {
        details.push('');
        details.push('Host not found - possible causes:');
        details.push('- Incorrect hostname');
        details.push('- DNS resolution issues');
        details.push('- Network connectivity problems');
      } else if (errorMessage.includes('Authentication failed')) {
        details.push('');
        details.push('Authentication failed - possible causes:');
        details.push('- Incorrect username/password');
        details.push('- Need to use app-specific password');
        details.push('- Account may require 2FA setup');
      }
      
      return { success: false, details };
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
