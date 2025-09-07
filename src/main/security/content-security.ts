/**
 * Content security utilities for detecting and handling suspicious content
 */
export class ContentSecurity {
  
  /**
   * Executable file signatures for detection
   */
  private static readonly EXECUTABLE_SIGNATURES = [
    { name: 'PE (Windows)', pattern: [0x4D, 0x5A] }, // MZ header
    { name: 'ELF (Linux)', pattern: [0x7F, 0x45, 0x4C, 0x46] }, // ELF header
    { name: 'Mach-O (macOS)', pattern: [0xFE, 0xED, 0xFA, 0xCE] }, // Mach-O 32-bit
    { name: 'Mach-O (macOS)', pattern: [0xFE, 0xED, 0xFA, 0xCF] }, // Mach-O 64-bit
    { name: 'Java Class', pattern: [0xCA, 0xFE, 0xBA, 0xBE] }, // Java class file
  ];

  /**
   * Suspicious script patterns that may indicate malicious content
   */
  private static readonly SUSPICIOUS_PATTERNS: Array<{
    name: string;
    pattern: RegExp;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }> = [
    { name: 'JavaScript eval', pattern: /eval\s*\(/gi, severity: 'high' },
    { name: 'System exec', pattern: /exec\s*\(/gi, severity: 'high' },
    { name: 'System call', pattern: /system\s*\(/gi, severity: 'high' },
    { name: 'Shell execution', pattern: /shell_exec\s*\(/gi, severity: 'high' },
    { name: 'Pass through', pattern: /passthru\s*\(/gi, severity: 'high' },
    { name: 'Base64 decode', pattern: /base64_decode\s*\(/gi, severity: 'medium' },
    { name: 'Gzip inflate', pattern: /gzinflate\s*\(/gi, severity: 'medium' },
    { name: 'ROT13', pattern: /str_rot13\s*\(/gi, severity: 'medium' },
    { name: 'PHP code', pattern: /<\?php/gi, severity: 'high' },
    { name: 'ASP code', pattern: /<%.*%>/gi, severity: 'high' },
    { name: 'SQL injection attempt', pattern: /union\s+select|drop\s+table|insert\s+into/gi, severity: 'high' },
    { name: 'XSS attempt', pattern: /<script|javascript:|vbscript:/gi, severity: 'high' },
    { name: 'Command injection', pattern: /;\s*(rm|del|format|mkfs)\s+/gi, severity: 'critical' }
  ];

  /**
   * Content size limits for different types
   */
  private static readonly SIZE_LIMITS = {
    email_subject: 998, // RFC 5322 limit
    email_text: 10 * 1024 * 1024, // 10MB
    email_html: 5 * 1024 * 1024, // 5MB
    attachment: 50 * 1024 * 1024, // 50MB
    inline_content: 1 * 1024 * 1024 // 1MB
  };

  /**
   * Validate content size limits
   */
  static validateContentSize(
    content: string | Buffer, 
    type: keyof typeof ContentSecurity.SIZE_LIMITS
  ): { isValid: boolean; size: number; limit: number; error?: string } {
    const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.length;
    const limit = this.SIZE_LIMITS[type];

    return {
      isValid: size <= limit,
      size,
      limit,
      error: size > limit ? `Content size (${size} bytes) exceeds limit (${limit} bytes) for ${type}` : undefined
    };
  }

  /**
   * Detect suspicious content patterns
   */
  static detectSuspiciousContent(content: string | Buffer): {
    isSuspicious: boolean;
    detections: Array<{
      type: 'executable' | 'pattern';
      name: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }>;
    riskScore: number;
  } {
    const detections: Array<{
      type: 'executable' | 'pattern';
      name: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }> = [];

    let riskScore = 0;

    // Check for executable signatures if content is a Buffer
    if (content instanceof Buffer) {
      for (const sig of this.EXECUTABLE_SIGNATURES) {
        if (this.hasSignature(content, sig.pattern)) {
          detections.push({
            type: 'executable',
            name: sig.name,
            severity: 'critical',
            description: `${sig.name} executable detected`
          });
          riskScore += 10;
        }
      }
    }

    // Convert to text for pattern analysis
    const textContent = typeof content === 'string' 
      ? content 
      : content.toString('utf-8', 0, Math.min(content.length, 10240)); // Limit to 10KB for analysis

    // Check for suspicious patterns
    for (const suspiciousPattern of this.SUSPICIOUS_PATTERNS) {
      if (suspiciousPattern.pattern.test(textContent)) {
        const severityScore = this.getSeverityScore(suspiciousPattern.severity);
        detections.push({
          type: 'pattern',
          name: suspiciousPattern.name,
          severity: suspiciousPattern.severity,
          description: `Suspicious ${suspiciousPattern.name.toLowerCase()} pattern detected`
        });
        riskScore += severityScore;
      }
    }

    return {
      isSuspicious: detections.length > 0,
      detections,
      riskScore: Math.min(riskScore, 100) // Cap at 100
    };
  }

  /**
   * Check if buffer starts with a specific signature
   */
  private static hasSignature(buffer: Buffer, signature: number[]): boolean {
    if (buffer.length < signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get numeric score for severity level
   */
  private static getSeverityScore(severity: string): number {
    switch (severity) {
      case 'critical': return 10;
      case 'high': return 7;
      case 'medium': return 4;
      case 'low': return 1;
      default: return 1;
    }
  }

  /**
   * Sanitize text content for safe display
   */
  static sanitizeTextContent(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // Remove control characters except for common whitespace
    return content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  /**
   * Check if content type is safe for processing
   */
  static isSafeContentType(contentType: string): boolean {
    const safeTypes = [
      'text/plain',
      'text/html',
      'text/css',
      'text/csv',
      'text/xml',
      'application/json',
      'application/xml',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];

    return safeTypes.some(type => contentType.toLowerCase().startsWith(type.toLowerCase()));
  }

  /**
   * Get risk assessment for content
   */
  static getRiskAssessment(riskScore: number): {
    level: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    recommendation: string;
  } {
    if (riskScore >= 10) {
      return {
        level: 'critical',
        description: 'Critical security risk detected',
        recommendation: 'Block content immediately and investigate'
      };
    } else if (riskScore >= 7) {
      return {
        level: 'high',
        description: 'High security risk detected',
        recommendation: 'Block content and review manually'
      };
    } else if (riskScore >= 4) {
      return {
        level: 'medium',
        description: 'Medium security risk detected',
        recommendation: 'Review content before processing'
      };
    } else if (riskScore >= 1) {
      return {
        level: 'low',
        description: 'Low security risk detected',
        recommendation: 'Monitor content processing'
      };
    } else {
      return {
        level: 'low',
        description: 'No significant security risks detected',
        recommendation: 'Content appears safe for processing'
      };
    }
  }
}
