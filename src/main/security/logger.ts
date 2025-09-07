import { SecurityEnhancement } from './security-enhancement.js';

/**
 * Logger utility for secure logging without exposing sensitive data
 */
export class Logger {
  private static instance: Logger;
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  private constructor() {
    this.logLevel = (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Sanitize sensitive data from log objects
   */
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    // If it's a primitive type, return as is
    if (typeof data !== 'object') {
      return data;
    }

    // If it's an array, sanitize each element
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    // If it's an object, sanitize its properties
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Check for sensitive field names
      const lowerKey = key.toLowerCase();
      const sensitiveFields = [
        'password', 'pass', 'passwd', 'pwd', 'secret', 'token', 'key', 
        'auth', 'credential', 'creditcard', 'ssn', 'socialsecurity'
      ];
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && this.isSensitiveValue(value)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeData(value);
      }
    }
    
    return sanitized;
  }

  /**
   * Check if a string value appears to be sensitive
   */
  private isSensitiveValue(value: string): boolean {
    if (value.length < 4) {
      return false;
    }

    // Check for common password patterns
    const passwordPatterns = [
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, // Complex password pattern
      /^[a-fA-F0-9]{32}$/, // MD5 hash
      /^[a-fA-F0-9]{40}$/, // SHA1 hash
      /^[a-fA-F0-9]{64}$/, // SHA256 hash
      /^[A-Za-z0-9+/]{40,}={0,2}$/ // Base64 encoded data (long strings)
    ];

    return passwordPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: any): void {
    if (this.shouldLog('debug')) {
      const sanitizedData = data ? this.sanitizeData(data) : undefined;
      console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}`, sanitizedData);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, data?: any): void {
    if (this.shouldLog('info')) {
      const sanitizedData = data ? this.sanitizeData(data) : undefined;
      console.info(`[INFO] ${new Date().toISOString()}: ${message}`, sanitizedData);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: any): void {
    if (this.shouldLog('warn')) {
      const sanitizedData = data ? this.sanitizeData(data) : undefined;
      console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, sanitizedData);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, data?: any): void {
    if (this.shouldLog('error')) {
      const sanitizedData = data ? this.sanitizeData(data) : undefined;
      console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, sanitizedData);
    }
  }

  /**
   * Log a security event (uses existing SecurityEnhancement.logSecurityEvent)
   */
  security(event: string, details: any = {}): void {
    // For security events, we still want to use the existing method
    // but we'll sanitize the details first
    const sanitizedDetails = this.sanitizeData(details);
    SecurityEnhancement.logSecurityEvent(event, sanitizedDetails);
  }

  /**
   * Check if a message should be logged based on the current log level
   */
  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }
}