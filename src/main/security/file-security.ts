import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { PathValidator } from './path-validator.js';
import { SecurityEnhancement } from './security-enhancement.js';
import { HtmlSanitizer } from './html-sanitizer.js';

/**
 * File security utilities for safe file operations
 */
export class FileSecurity {
  // Allowed file extensions for attachments (safe, non-executable files only)
  private static readonly ALLOWED_EXTENSIONS = [
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.csv', '.json', '.xml', '.css',
    '.md', '.rtf', '.odt', '.ods', '.odp',
    '.html', '.htm' // Now allowed with sanitization
  ];

  // Dangerous file extensions that should be blocked
  private static readonly DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vbe',
    '.js', '.jse', '.jar', '.msi', '.dll', '.scf', '.lnk', '.inf',
    '.reg', '.ps1', '.psm1', '.psd1', '.ps1xml', '.psc1', '.psc2',
    '.msh', '.msh1', '.msh2', '.mshxml', '.msh1xml', '.msh2xml',
    '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl', '.sh',
    '.hta', '.application', '.gadget', '.msp',
    '.mst', '.cpl', '.ins', '.isp', '.ws', '.wsf', '.wsh'
  ];

  // Maximum file size (50MB by default, configurable via MAX_ATTACHMENT_SIZE environment variable)
  private static readonly MAX_FILE_SIZE = process.env.MAX_ATTACHMENT_SIZE ?
    parseInt(process.env.MAX_ATTACHMENT_SIZE) : 50 * 1024 * 1024;

  // Maximum filename length
  private static readonly MAX_FILENAME_LENGTH = 255;

  // Invalid characters for filenames (Windows + Unix)
  private static readonly INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

  // Reserved Windows filenames
  private static readonly RESERVED_NAMES = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  /**
   * Validate and sanitize filename
   */
  static sanitizeFilename(filename: string): { isValid: boolean; sanitized: string; errors: string[] } {
    const errors: string[] = [];
    let sanitized = filename;

    // Check if filename is provided
    if (!filename || typeof filename !== 'string') {
      errors.push('Filename is required and must be a string');
      return { isValid: false, sanitized: 'unknown_file', errors };
    }

    // Check filename length
    if (filename.length > this.MAX_FILENAME_LENGTH) {
      errors.push(`Filename is too long (max ${this.MAX_FILENAME_LENGTH} characters)`);
      sanitized = filename.substring(0, this.MAX_FILENAME_LENGTH);
    }

    // Remove invalid characters
    sanitized = sanitized.replace(this.INVALID_FILENAME_CHARS, '_');

    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

    // Check for reserved names (Windows)
    const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
    if (this.RESERVED_NAMES.includes(nameWithoutExt)) {
      errors.push(`Filename "${nameWithoutExt}" is reserved`);
      sanitized = `file_${sanitized}`;
    }

    // Ensure filename is not empty after sanitization
    if (!sanitized || sanitized.trim() === '') {
      sanitized = `file_${Date.now()}`;
      errors.push('Filename became empty after sanitization, using generated name');
    }

    // Check file extension
    const extension = path.extname(sanitized).toLowerCase();
    if (this.DANGEROUS_EXTENSIONS.includes(extension)) {
      errors.push(`File extension "${extension}" is not allowed for security reasons`);
      return { isValid: false, sanitized, errors };
    }

    return {
      isValid: errors.length === 0,
      sanitized,
      errors
    };
  }

  /**
   * Validate file path and prevent path traversal attacks
   */
  static validatePath(filePath: string, baseDir: string): { isValid: boolean; safePath: string; errors: string[] } {
    const errors: string[] = [];

    try {
      // Resolve the full path
      const resolvedPath = path.resolve(filePath);
      const resolvedBaseDir = path.resolve(baseDir);

      // Check if the resolved path is within the base directory
      if (!resolvedPath.startsWith(resolvedBaseDir + path.sep) && resolvedPath !== resolvedBaseDir) {
        errors.push('Path traversal detected - file path is outside allowed directory');
        return { isValid: false, safePath: '', errors };
      }

      // Additional checks for common path traversal patterns
      const normalizedPath = path.normalize(filePath);
      if (normalizedPath.includes('..') || normalizedPath.includes('./') || normalizedPath.includes('.\\')) {
        errors.push('Suspicious path patterns detected');
        return { isValid: false, safePath: '', errors };
      }

      return {
        isValid: true,
        safePath: resolvedPath,
        errors
      };
    } catch (error) {
      errors.push(`Invalid path: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, safePath: '', errors };
    }
  }

  /**
   * Create a safe download directory
   */
  static createSafeDownloadDir(baseDir?: string): { success: boolean; path: string; error?: string } {
    try {
      const targetBaseDir = baseDir || 'downloads';
      
      // Use PathValidator to ensure secure directory creation
      const dirResult = PathValidator.ensureSecureDirectory(targetBaseDir);
      if (!dirResult.success) {
        return { success: false, path: '', error: dirResult.error };
      }

      const fullPath = path.resolve(process.cwd(), targetBaseDir);
      return { success: true, path: fullPath };

    } catch (error) {
      return { 
        success: false, 
        path: '', 
        error: `Failed to create download directory: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Validate file size
   */
  static validateFileSize(size: number): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate that MAX_FILE_SIZE is a valid number
    const maxFileSize = isNaN(this.MAX_FILE_SIZE) || this.MAX_FILE_SIZE <= 0 ? 50 * 1024 * 1024 : this.MAX_FILE_SIZE;

    if (size > maxFileSize) {
      errors.push(`File size ${Math.round(size / 1024 / 1024)}MB exceeds maximum allowed size of ${Math.round(maxFileSize / 1024 / 1024)}MB`);
    }

    if (size <= 0) {
      errors.push('File size must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a unique filename to prevent overwrites
   */
  static generateUniqueFilename(originalFilename: string, targetDir: string): string {
    const sanitizeResult = this.sanitizeFilename(originalFilename);
    const filename = sanitizeResult.sanitized;
    
    // Use PathValidator to generate unique secure filename
    const baseDirName = path.basename(targetDir);
    const uniqueResult = PathValidator.generateUniqueSecureFilename(filename, baseDirName);
    
    if (uniqueResult.success) {
      return path.basename(uniqueResult.fullPath);
    }
    
    // Fallback to original logic if PathValidator fails
    const ext = path.extname(filename);
    const nameWithoutExt = path.basename(filename, ext);
    let counter = 1;
    let uniqueFilename = filename;

    while (fs.existsSync(path.join(targetDir, uniqueFilename))) {
      uniqueFilename = `${nameWithoutExt}_${counter}${ext}`;
      counter++;
    }

    return uniqueFilename;
  }

  /**
   * Validate attachment before processing
   */
  static validateAttachment(attachment: { filename: string; content: Buffer; contentType: string }): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate filename
    const filenameValidation = this.sanitizeFilename(attachment.filename);
    if (!filenameValidation.isValid) {
      errors.push(...filenameValidation.errors);
    }

    // Validate file size
    const sizeValidation = this.validateFileSize(attachment.content.length);
    if (!sizeValidation.isValid) {
      errors.push(...sizeValidation.errors);
    }

    // Validate content type
    if (!attachment.contentType || typeof attachment.contentType !== 'string') {
      warnings.push('Content type is missing or invalid');
    }

    // Check for suspicious content types
    const suspiciousTypes = [
      'application/x-msdownload',
      'application/x-executable',
      'application/octet-stream'
    ];

    if (suspiciousTypes.includes(attachment.contentType.toLowerCase())) {
      warnings.push(`Content type "${attachment.contentType}" may be suspicious`);
    }

    // Check for suspicious content patterns
    const contentCheck = SecurityEnhancement.detectSuspiciousContent(attachment.content);
    if (contentCheck.isSuspicious) {
      errors.push(`Suspicious content detected: ${contentCheck.reasons.join(', ')}`);
    }

    // Special validation for HTML files
    if (this.isHtmlContent(attachment.contentType, attachment.filename)) {
      warnings.push('HTML content detected - will be sanitized before processing');
      
      // Additional HTML-specific validation
      const htmlValidation = this.sanitizeHtmlAttachment(attachment);
      if (!htmlValidation.success) {
        errors.push(...htmlValidation.errors);
      }
      warnings.push(...htmlValidation.warnings);
    }

    // Log security validation
    SecurityEnhancement.logSecurityEvent('Attachment validation completed', {
      filename: attachment.filename,
      size: attachment.content.length,
      contentType: attachment.contentType,
      isValid: errors.length === 0,
      warnings: warnings.length,
      errors: errors.length
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Securely save attachment to disk
   */
  static async saveAttachment(
    attachment: { filename: string; content: Buffer; contentType: string },
    targetDir?: string
  ): Promise<{ success: boolean; filePath?: string; error?: string; warnings?: string[] }> {
    try {
      // Validate attachment first
      const validation = this.validateAttachment(attachment);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') };
      }

      // Create safe download directory
      const dirResult = this.createSafeDownloadDir(targetDir);
      if (!dirResult.success) {
        return { success: false, error: dirResult.error };
      }

      // Use PathValidator to create secure path
      const pathResult = PathValidator.generateUniqueSecureFilename(attachment.filename, path.basename(dirResult.path));
      if (!pathResult.success) {
        return { success: false, error: pathResult.errors.join(', ') };
      }

      const safePath = pathResult.fullPath;

      // Final security check - ensure path is within allowed directory
      const allowedDir = path.resolve(dirResult.path);
      const resolvedPath = path.resolve(safePath);
      if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
        SecurityEnhancement.logSecurityEvent('Path traversal attempt blocked', {
          filename: attachment.filename,
          attemptedPath: safePath,
          allowedDir
        });
        return { success: false, error: 'Path validation failed - potential security violation' };
      }

      // Handle HTML content sanitization before saving
      let contentToSave = attachment.content;
      const allWarnings = [...validation.warnings];

      if (this.isHtmlContent(attachment.contentType, attachment.filename)) {
        const htmlSanitization = this.sanitizeHtmlAttachment(attachment);
        if (htmlSanitization.success && htmlSanitization.sanitizedContent) {
          contentToSave = Buffer.from(htmlSanitization.sanitizedContent, 'utf-8');
          allWarnings.push('HTML content was sanitized before saving');
          allWarnings.push(...htmlSanitization.warnings);
          
          SecurityEnhancement.logSecurityEvent('HTML content sanitized', {
            filename: attachment.filename,
            originalSize: attachment.content.length,
            sanitizedSize: contentToSave.length,
            warnings: htmlSanitization.warnings.length
          });
        } else {
          return { success: false, error: `HTML sanitization failed: ${htmlSanitization.errors.join(', ')}` };
        }
      }

      // Write file with secure permissions
      await fs.promises.writeFile(safePath, contentToSave, { mode: 0o644 });

      SecurityEnhancement.logSecurityEvent('Attachment saved securely', {
        filename: attachment.filename,
        savedPath: safePath,
        size: contentToSave.length,
        contentType: attachment.contentType,
        wasSanitized: this.isHtmlContent(attachment.contentType, attachment.filename)
      });

      return {
        success: true,
        filePath: safePath,
        warnings: allWarnings.length > 0 ? allWarnings : undefined
      };
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('Attachment save failed', {
        filename: attachment.filename,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: `Failed to save attachment: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Calculate file hash for integrity checking
   */
  static calculateFileHash(content: Buffer, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(content).digest('hex');
  }

  /**
   * Check if file type is allowed for display/preview
   */
  static isPreviewSafe(contentType: string): boolean {
    const safePreviewTypes = [
      'text/plain',
      'text/css',
      'text/javascript',
      'text/csv',
      'application/json',
      'application/xml',
      'text/xml',
      'application/pdf'
    ];

    // HTML is now handled separately with sanitization
    return safePreviewTypes.includes(contentType.toLowerCase());
  }

  /**
   * Check if HTML content can be safely displayed with sanitization
   */
  static isHtmlContent(contentType: string, filename?: string): boolean {
    const htmlTypes = ['text/html', 'application/xhtml+xml'];
    const htmlExtensions = ['.html', '.htm', '.xhtml'];
    
    const isHtmlType = htmlTypes.includes(contentType.toLowerCase());
    const hasHtmlExtension = filename ? htmlExtensions.includes(path.extname(filename).toLowerCase()) : false;
    
    return isHtmlType || hasHtmlExtension;
  }

  /**
   * Sanitize HTML attachment content
   */
  static sanitizeHtmlAttachment(attachment: { filename: string; content: Buffer; contentType: string }): {
    success: boolean;
    sanitizedContent?: string;
    errors: string[];
    warnings: string[];
  } {
    try {
      // Check if it's HTML content
      if (!this.isHtmlContent(attachment.contentType, attachment.filename)) {
        return {
          success: false,
          errors: ['File is not HTML content'],
          warnings: []
        };
      }

      // Convert buffer to string
      const htmlContent = attachment.content.toString('utf-8');

      // Validate and sanitize HTML
      const validation = HtmlSanitizer.validateHtmlAttachment(htmlContent);
      
      if (!validation.isValid) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings
        };
      }

      return {
        success: true,
        sanitizedContent: validation.sanitizedContent,
        errors: [],
        warnings: validation.warnings
      };
    } catch (error) {
      return {
        success: false,
        errors: [`HTML sanitization failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Get secure file information
   */
  static getFileInfo(attachment: { filename: string; content: Buffer; contentType: string }): {
    filename: string;
    size: number;
    sizeFormatted: string;
    contentType: string;
    hash: string;
    isPreviewSafe: boolean;
    isHtmlContent: boolean;
    canBeSanitized: boolean;
    extension: string;
  } {
    const sizeInKB = Math.round(attachment.content.length / 1024);
    const sizeInMB = Math.round(attachment.content.length / 1024 / 1024 * 100) / 100;
    const sizeFormatted = sizeInMB >= 1 ? `${sizeInMB} MB` : `${sizeInKB} KB`;
    const isHtml = this.isHtmlContent(attachment.contentType, attachment.filename);

    return {
      filename: attachment.filename,
      size: attachment.content.length,
      sizeFormatted,
      contentType: attachment.contentType,
      hash: this.calculateFileHash(attachment.content),
      isPreviewSafe: this.isPreviewSafe(attachment.contentType),
      isHtmlContent: isHtml,
      canBeSanitized: isHtml,
      extension: path.extname(attachment.filename).toLowerCase()
    };
  }
  
  /**
   * Validate content type for attachments
   */
  static isValidAttachmentContentType(contentType: string): boolean {
    // List of allowed content types for attachments
    const allowedTypes = [
      'text/plain',
      'text/html',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    
    // Allow if content type is in allowed list
    if (allowedTypes.includes(contentType)) {
      return true;
    }
    
    // Allow if it's a subtype of allowed types (e.g., image/* for image types)
    const [type, subtype] = contentType.split('/');
    if (type === 'image' && ['jpeg', 'png', 'gif'].includes(subtype)) {
      return true;
    }
    
    return false;
  }
}
