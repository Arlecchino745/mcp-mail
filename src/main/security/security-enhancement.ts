import { TLSSocket } from 'tls';
import * as crypto from 'crypto';

/**
 * Security enhancement utilities for mail services
 */
export class SecurityEnhancement {
  
  /**
   * Get secure TLS options for mail connections
   */
  static getSecureTLSOptions(): object {
    return {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ciphers: 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS',
      secureProtocol: 'TLS_method',
      honorCipherOrder: true,
      // Additional security options
      checkServerIdentity: (hostname: string, cert: any) => {
        return SecurityEnhancement.verifyHostname(hostname, cert);
      }
    };
  }

  /**
   * Verify hostname against certificate
   */
  private static verifyHostname(hostname: string, cert: any): Error | undefined {
    if (!cert || !cert.subject) {
      return new Error('Certificate is invalid or missing subject');
    }

    const { CN } = cert.subject;
    const altNames = cert.subjectaltname ? cert.subjectaltname.split(', ') : [];
    
    // Check common name
    if (CN === hostname) {
      return undefined;
    }

    // Check subject alternative names
    for (const altName of altNames) {
      if (altName.startsWith('DNS:')) {
        const dnsName = altName.substring(4);
        if (dnsName === hostname || SecurityEnhancement.matchWildcard(hostname, dnsName)) {
          return undefined;
        }
      }
    }

    return new Error(`Hostname ${hostname} does not match certificate`);
  }

  /**
   * Match hostname against wildcard pattern
   */
  private static matchWildcard(hostname: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
      return hostname === pattern;
    }

    const escapedPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]*');
    
    const regex = new RegExp(`^${escapedPattern}$`, 'i');
    return regex.test(hostname);
  }

  /**
   * Validate certificate chain
   */
  static validateCertificateChain(socket: TLSSocket): boolean {
    if (!socket.authorized) {
      console.error('TLS certificate validation failed:', socket.authorizationError);
      return false;
    }

    const cert = socket.getPeerCertificate();
    if (!cert || Object.keys(cert).length === 0) {
      console.error('No peer certificate found');
      return false;
    }

    // Check certificate expiration
    const now = new Date();
    const validFrom = new Date(cert.valid_from);
    const validTo = new Date(cert.valid_to);

    if (now < validFrom || now > validTo) {
      console.error('Certificate is not valid for current date');
      return false;
    }

    // Check certificate algorithm strength
    const certAny = cert as any;
    if (certAny.signatureAlgorithm && SecurityEnhancement.isWeakSignatureAlgorithm(certAny.signatureAlgorithm)) {
      console.error('Certificate uses weak signature algorithm:', certAny.signatureAlgorithm);
      return false;
    }

    return true;
  }

  /**
   * Check if signature algorithm is considered weak
   */
  private static isWeakSignatureAlgorithm(algorithm: string): boolean {
    const weakAlgorithms = [
      'md5WithRSAEncryption',
      'sha1WithRSAEncryption',
      'md2WithRSAEncryption',
      'md4WithRSAEncryption'
    ];
    
    return weakAlgorithms.some(weak => algorithm.toLowerCase().includes(weak.toLowerCase()));
  }

  /**
   * Generate secure random string for session management
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Secure password validation (for local validation only)
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Rate limiting for connection attempts
   */
  static createRateLimiter(maxAttempts: number = 5, windowMs: number = 300000): {
    isAllowed: (identifier: string) => boolean;
    reset: (identifier: string) => void;
  } {
    const attempts = new Map<string, { count: number; resetTime: number }>();

    return {
      isAllowed: (identifier: string): boolean => {
        const now = Date.now();
        const record = attempts.get(identifier);

        if (!record || now > record.resetTime) {
          attempts.set(identifier, { count: 1, resetTime: now + windowMs });
          return true;
        }

        if (record.count >= maxAttempts) {
          return false;
        }

        record.count++;
        return true;
      },
      
      reset: (identifier: string): void => {
        attempts.delete(identifier);
      }
    };
  }

  /**
   * Sanitize email content to prevent injection attacks
   */
  static sanitizeEmailContent(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // Remove potentially dangerous patterns
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/data:text\/html/gi, 'data:text/plain')
      .replace(/data:application\/javascript/gi, 'data:text/plain')
      .replace(/data:text\/javascript/gi, 'data:text/plain');
  }

  /**
   * Validate and sanitize file paths
   */
  static validateFilePath(filePath: string, allowedExtensions?: string[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!filePath || typeof filePath !== 'string') {
      errors.push('File path is required and must be a string');
      return { isValid: false, errors };
    }

    // Check for path traversal attempts
    if (filePath.includes('..') || filePath.includes('./') || filePath.includes('.\\')) {
      errors.push('Path traversal detected in file path');
    }

    // Check for absolute paths (security risk)
    if (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)) {
      errors.push('Absolute paths are not allowed');
    }

    // Check file extension if allowed extensions are specified
    if (allowedExtensions && allowedExtensions.length > 0) {
      const extension = filePath.toLowerCase().split('.').pop();
      if (!extension || !allowedExtensions.includes(`.${extension}`)) {
        errors.push(`File extension is not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if content contains suspicious patterns
   */
  static detectSuspiciousContent(content: string | Buffer): { isSuspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const textContent = typeof content === 'string' ? content : content.toString('utf-8', 0, Math.min(content.length, 1024));

    // Check for executable signatures
    if (content instanceof Buffer) {
      // Check for PE header (Windows executables)
      if (content.length > 2 && content[0] === 0x4D && content[1] === 0x5A) {
        reasons.push('PE executable detected');
      }
      
      // Check for ELF header (Linux executables)
      if (content.length > 4 && content[0] === 0x7F && content[1] === 0x45 && content[2] === 0x4C && content[3] === 0x46) {
        reasons.push('ELF executable detected');
      }
    }

    // Check for suspicious script patterns
    const suspiciousPatterns = [
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /system\s*\(/gi,
      /shell_exec\s*\(/gi,
      /passthru\s*\(/gi,
      /base64_decode\s*\(/gi,
      /gzinflate\s*\(/gi,
      /str_rot13\s*\(/gi,
      /<\?php/gi,
      /<%.*%>/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(textContent)) {
        reasons.push(`Suspicious pattern detected: ${pattern.source}`);
      }
    }

    return {
      isSuspicious: reasons.length > 0,
      reasons
    };
  }

  /**
   * Log security events
   */
  static logSecurityEvent(event: string, details: any = {}): void {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY] ${timestamp}: ${event}`, details);
  }
}
