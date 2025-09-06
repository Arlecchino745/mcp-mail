import { SecurityEnhancement } from './security-enhancement.js';

/**
 * Configuration validator for mail server settings
 */
export class ConfigValidator {
  
  /**
   * Validate mail configuration for security issues
   */
  static validateMailConfig(config: any): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Validate SMTP configuration
    if (config.smtp) {
      const smtpValidation = this.validateSMTPConfig(config.smtp);
      warnings.push(...smtpValidation.warnings);
      errors.push(...smtpValidation.errors);
    }

    // Validate IMAP configuration  
    if (config.imap) {
      const imapValidation = this.validateIMAPConfig(config.imap);
      warnings.push(...imapValidation.warnings);
      errors.push(...imapValidation.errors);
    }

    // Validate authentication
    if (config.smtp?.auth || config.imap?.auth) {
      const authValidation = this.validateAuthConfig(config);
      warnings.push(...authValidation.warnings);
      errors.push(...authValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Validate SMTP configuration
   */
  private static validateSMTPConfig(smtp: any): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if secure connection is enabled
    if (!smtp.secure && smtp.port !== 587) {
      warnings.push('SMTP: Consider using secure connection (port 465) or STARTTLS (port 587)');
    }

    // Validate port numbers
    if (smtp.port && !this.isValidPort(smtp.port)) {
      errors.push('SMTP: Invalid port number');
    }

    // Check for common insecure ports
    if (smtp.port === 25) {
      warnings.push('SMTP: Port 25 is often blocked and less secure. Consider using 587 or 465');
    }

    // Validate host
    if (!smtp.host || typeof smtp.host !== 'string' || smtp.host.trim() === '') {
      errors.push('SMTP: Host is required and must be a valid string');
    }

    return { warnings, errors };
  }

  /**
   * Validate IMAP configuration
   */
  private static validateIMAPConfig(imap: any): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check if secure connection is enabled
    if (!imap.secure) {
      warnings.push('IMAP: Consider enabling secure connection (SSL/TLS)');
    }

    // Validate port numbers
    if (imap.port && !this.isValidPort(imap.port)) {
      errors.push('IMAP: Invalid port number');
    }

    // Check for standard secure ports
    if (imap.secure && imap.port !== 993) {
      warnings.push('IMAP: Standard secure IMAP port is 993');
    }

    if (!imap.secure && imap.port !== 143) {
      warnings.push('IMAP: Standard IMAP port is 143 (consider using 993 with SSL)');
    }

    // Validate host
    if (!imap.host || typeof imap.host !== 'string' || imap.host.trim() === '') {
      errors.push('IMAP: Host is required and must be a valid string');
    }

    return { warnings, errors };
  }

  /**
   * Validate authentication configuration
   */
  private static validateAuthConfig(config: any): { warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check SMTP auth
    if (config.smtp?.auth) {
      if (!config.smtp.auth.user || !config.smtp.auth.pass) {
        errors.push('SMTP: Username and password are required for authentication');
      }

      // Validate password strength (basic check)
      if (config.smtp.auth.pass && config.smtp.auth.pass.length < 8) {
        warnings.push('SMTP: Consider using a stronger password (at least 8 characters)');
      }
    }

    // Check IMAP auth
    if (config.imap?.auth) {
      if (!config.imap.auth.user || !config.imap.auth.pass) {
        errors.push('IMAP: Username and password are required for authentication');
      }

      // Validate password strength (basic check)
      if (config.imap.auth.pass && config.imap.auth.pass.length < 8) {
        warnings.push('IMAP: Consider using a stronger password (at least 8 characters)');
      }
    }

    return { warnings, errors };
  }

  /**
   * Check if port number is valid
   */
  private static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port > 0 && port <= 65535;
  }

  /**
   * Get security recommendations
   */
  static getSecurityRecommendations(): string[] {
    return [
      'Use TLS/SSL encryption for all mail connections',
      'Use strong, unique passwords for mail accounts',
      'Enable two-factor authentication when available',
      'Regularly update mail server software',
      'Monitor connection logs for suspicious activity',
      'Use app-specific passwords instead of main account passwords',
      'Validate all user inputs to prevent injection attacks',
      'Implement rate limiting for connection attempts',
      'Use certificate pinning for additional security',
      'Regularly review and audit mail server configurations'
    ];
  }

  /**
   * Check environment variables for security issues
   */
  static validateEnvironmentVariables(): { isValid: boolean; warnings: string[]; errors: string[] } {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Check for required environment variables
    const requiredVars = [
      'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
      'IMAP_HOST', 'IMAP_PORT', 'IMAP_USER', 'IMAP_PASS'
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Validate secure settings
    if (process.env.SMTP_SECURE === 'false') {
      warnings.push('SMTP_SECURE is disabled. Consider enabling for better security');
    }

    if (process.env.IMAP_SECURE === 'false') {
      warnings.push('IMAP_SECURE is disabled. Consider enabling for better security');
    }

    // Check for common development values in production
    const devValues = ['localhost', '127.0.0.1', 'test', 'example.com'];
    for (const devValue of devValues) {
      if (process.env.SMTP_HOST?.includes(devValue) || process.env.IMAP_HOST?.includes(devValue)) {
        warnings.push(`Possible development configuration detected in hosts`);
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors
    };
  }

  /**
   * Log configuration validation results
   */
  static logValidationResults(validation: { isValid: boolean; warnings: string[]; errors: string[] }): void {
    if (validation.errors.length > 0) {
      SecurityEnhancement.logSecurityEvent('Configuration validation failed', {
        errors: validation.errors
      });
    }

    if (validation.warnings.length > 0) {
      SecurityEnhancement.logSecurityEvent('Configuration validation warnings', {
        warnings: validation.warnings
      });
    }

    if (validation.isValid && validation.warnings.length === 0) {
      SecurityEnhancement.logSecurityEvent('Configuration validation passed', {});
    }
  }
}
