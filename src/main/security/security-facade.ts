import { SecurityEnhancement } from './security-enhancement.js';
import { FileSecurity } from './file-security.js';
import { PathValidator } from './path-validator.js';
import { ConfigValidator } from './config-validator.js';
import { HtmlSanitizer } from './html-sanitizer.js';
import { EmailRateLimiters } from './rate-limiter.js';
import { CredentialManager } from './credential-manager.js';
import { Logger } from './logger.js';
import { PasswordValidator } from './password-validator.js';
import { ContentSecurity } from './content-security.js';

/**
 * Security facade providing centralized access to all security utilities
 * This class provides a clean interface for common security operations
 */
export class Security {
  private static logger = Logger.getInstance();

  /**
   * TLS and Connection Security
   */
  static readonly tls = {
    getSecureOptions: () => SecurityEnhancement.getSecureTLSOptions(),
    validateCertificateChain: (socket: any) => SecurityEnhancement.validateCertificateChain(socket),
    generateSecureToken: (length?: number) => SecurityEnhancement.generateSecureToken(length)
  };

  /**
   * Content Security and Sanitization
   */
  static readonly content = {
    sanitizeHtml: (content: string, options?: any) => HtmlSanitizer.sanitizeHtml(content, options),
    sanitizeText: (content: string) => HtmlSanitizer.sanitizeEmailContent(content),
    extractText: (htmlContent: string) => HtmlSanitizer.extractTextContent(htmlContent),
    createPreview: (htmlContent: string, maxLength?: number) => HtmlSanitizer.createSafePreview(htmlContent, maxLength),
    validateSize: (content: string | Buffer, type: any) => ContentSecurity.validateContentSize(content, type),
    detectSuspicious: (content: string | Buffer) => ContentSecurity.detectSuspiciousContent(content),
    getRiskAssessment: (riskScore: number) => ContentSecurity.getRiskAssessment(riskScore),
    isSafeContentType: (contentType: string) => ContentSecurity.isSafeContentType(contentType)
  };

  /**
   * File and Path Security
   */
  static readonly file = {
    validateAttachment: (attachment: any) => FileSecurity.validateAttachment(attachment),
    sanitizeFilename: (filename: string) => FileSecurity.sanitizeFilename(filename),
    getFileInfo: (attachment: any) => FileSecurity.getFileInfo(attachment),
    saveAttachment: (attachment: any) => FileSecurity.saveAttachment(attachment),
    validatePath: (path: string, baseDir?: string) => PathValidator.validateAndNormalizePath(path, baseDir)
  };

  /**
   * Authentication and Credentials
   */
  static readonly auth = {
    validatePassword: (password: string, config?: any) => PasswordValidator.validateStrength(password, config),
    getPasswordSuggestions: (password: string) => PasswordValidator.getSuggestions(password),
    getStrengthDescription: (score: number) => PasswordValidator.getStrengthDescription(score),
    getCredentialManager: () => CredentialManager.getInstance()
  };

  /**
   * Rate Limiting
   */
  static readonly rateLimit = {
    sendMail: EmailRateLimiters.sendMail,
    receiveMail: EmailRateLimiters.receiveMail,
    auth: EmailRateLimiters.auth,
    attachment: EmailRateLimiters.attachment,
    folder: EmailRateLimiters.folder
  };

  /**
   * Configuration Validation
   */
  static readonly config = {
    validateMail: (config: any) => ConfigValidator.validateMailConfig(config),
    validateEnvironment: () => ConfigValidator.validateEnvironmentVariables(),
    getSecurityRecommendations: () => ConfigValidator.getSecurityRecommendations(),
    logValidationResults: (results: any) => ConfigValidator.logValidationResults(results)
  };

  /**
   * Secure Logging
   */
  static readonly log = {
    debug: (message: string, data?: any) => this.logger.debug(message, data),
    info: (message: string, data?: any) => this.logger.info(message, data),
    warn: (message: string, data?: any) => this.logger.warn(message, data),
    error: (message: string, data?: any) => this.logger.error(message, data),
    security: (event: string, details?: any) => this.logger.security(event, details)
  };

  /**
   * Comprehensive security validation for email operations
   */
  static validateEmailOperation(operation: {
    userEmail: string;
    operationType: 'send' | 'receive' | 'attachment' | 'folder';
    content?: {
      subject?: string;
      text?: string;
      html?: string;
    };
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>;
  }): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sanitizedContent?: any;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedContent: any = {};

    // Rate limiting check
    const rateLimiterMap = {
      send: this.rateLimit.sendMail,
      receive: this.rateLimit.receiveMail,
      attachment: this.rateLimit.attachment,
      folder: this.rateLimit.folder
    };
    const rateLimiter = rateLimiterMap[operation.operationType];
    const rateLimitResult = rateLimiter.isAllowed(operation.userEmail);
    
    if (!rateLimitResult.allowed) {
      errors.push(`Rate limit exceeded for ${operation.operationType}. Try again in ${Math.ceil(rateLimitResult.resetIn / 1000)} seconds.`);
      this.log.security('Rate limit exceeded', {
        userEmail: operation.userEmail,
        operationType: operation.operationType,
        resetIn: rateLimitResult.resetIn
      });
      return { isValid: false, errors, warnings };
    }

    // Content validation and sanitization
    if (operation.content) {
      if (operation.content.subject) {
        const sizeCheck = this.content.validateSize(operation.content.subject, 'email_subject');
        if (!sizeCheck.isValid) {
          errors.push(sizeCheck.error!);
        }
        sanitizedContent.subject = this.content.sanitizeText(operation.content.subject);
      }

      if (operation.content.text) {
        const sizeCheck = this.content.validateSize(operation.content.text, 'email_text');
        if (!sizeCheck.isValid) {
          errors.push(sizeCheck.error!);
        }
        sanitizedContent.text = this.content.sanitizeText(operation.content.text);
      }

      if (operation.content.html) {
        const sizeCheck = this.content.validateSize(operation.content.html, 'email_html');
        if (!sizeCheck.isValid) {
          errors.push(sizeCheck.error!);
        }
        const htmlResult = this.content.sanitizeHtml(operation.content.html);
        sanitizedContent.html = htmlResult.sanitized;
        warnings.push(...htmlResult.warnings);
      }
    }

    // Attachment validation
    if (operation.attachments) {
      sanitizedContent.attachments = [];
      
      for (const attachment of operation.attachments) {
        // Validate file
        const fileValidation = this.file.validateAttachment(attachment);
        if (!fileValidation.isValid) {
          errors.push(...fileValidation.errors);
          continue;
        }
        warnings.push(...fileValidation.warnings);

        // Sanitize filename
        const filenameResult = this.file.sanitizeFilename(attachment.filename);
        if (!filenameResult.isValid) {
          errors.push(...filenameResult.errors);
          continue;
        }

        // Content security check
        const contentSecurityResult = this.content.detectSuspicious(attachment.content);
        if (contentSecurityResult.isSuspicious) {
          const riskAssessment = this.content.getRiskAssessment(contentSecurityResult.riskScore);
          
          if (riskAssessment.level === 'critical' || riskAssessment.level === 'high') {
            errors.push(`Attachment "${attachment.filename}" contains suspicious content: ${contentSecurityResult.detections.map(d => d.description).join(', ')}`);
            this.log.security('Suspicious attachment blocked', {
              filename: attachment.filename,
              detections: contentSecurityResult.detections,
              riskScore: contentSecurityResult.riskScore
            });
            continue;
          } else {
            warnings.push(`Attachment "${attachment.filename}" has security warnings: ${contentSecurityResult.detections.map(d => d.description).join(', ')}`);
          }
        }

        sanitizedContent.attachments.push({
          ...attachment,
          filename: filenameResult.sanitized
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedContent
    };
  }

  /**
   * Quick security check for any content
   */
  static quickSecurityCheck(content: string | Buffer): {
    isSafe: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    issues: string[];
  } {
    const securityResult = this.content.detectSuspicious(content);
    const riskAssessment = this.content.getRiskAssessment(securityResult.riskScore);
    
    return {
      isSafe: !securityResult.isSuspicious || riskAssessment.level === 'low',
      riskLevel: riskAssessment.level,
      issues: securityResult.detections.map(d => d.description)
    };
  }
}
