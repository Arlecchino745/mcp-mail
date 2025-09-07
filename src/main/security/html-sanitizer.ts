import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

/**
 * HTML sanitization utilities for safe HTML content processing
 */
export class HtmlSanitizer {
  private static domPurify: ReturnType<typeof createDOMPurify> | null = null;

  /**
   * Initialize DOMPurify with jsdom window
   */
  private static initializeDOMPurify() {
    if (!this.domPurify) {
      const window = new JSDOM('').window;
      this.domPurify = createDOMPurify(window as any);
    }
    return this.domPurify;
  }

  /**
   * Sanitize HTML content with strict security settings
   */
  static sanitizeHtml(htmlContent: string, options?: {
    allowImages?: boolean;
    allowLinks?: boolean;
    allowStyles?: boolean;
    customConfig?: any;
  }): { sanitized: string; isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    try {
      const purify = this.initializeDOMPurify();
      
      // Default strict configuration
      const defaultConfig = {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'div', 'span', 'table', 
          'thead', 'tbody', 'tr', 'td', 'th'
        ],
        ALLOWED_ATTR: ['class', 'id'],
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
        SANITIZE_DOM: true,
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_DOM_IMPORT: false,
        FORBID_CONTENTS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
        FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur']
      };

      // Customize based on options
      let config = { ...defaultConfig };
      
      if (options?.allowImages) {
        config.ALLOWED_TAGS.push('img');
        config.ALLOWED_ATTR.push('src', 'alt', 'width', 'height');
        warnings.push('Images are allowed - ensure src URLs are from trusted sources');
      }
      
      if (options?.allowLinks) {
        config.ALLOWED_TAGS.push('a');
        config.ALLOWED_ATTR.push('href', 'target', 'rel');
        warnings.push('Links are allowed - users should verify destinations before clicking');
      }
      
      if (options?.allowStyles) {
        config.ALLOWED_ATTR.push('style');
        warnings.push('Inline styles are allowed - potential for CSS-based attacks');
      }

      // Apply custom configuration if provided
      if (options?.customConfig) {
        config = { ...config, ...options.customConfig };
      }

      // Sanitize the HTML
      const sanitized = purify.sanitize(htmlContent, config);
      
      // Check if content was modified
      const wasModified = sanitized !== htmlContent;
      if (wasModified) {
        warnings.push('HTML content was modified during sanitization');
      }

      return {
        sanitized: sanitized as string,
        isValid: true,
        warnings
      };
    } catch (error) {
      return {
        sanitized: '',
        isValid: false,
        warnings: [`HTML sanitization failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Extract and sanitize text content from HTML
   */
  static extractTextContent(htmlContent: string): string {
    try {
      const purify = this.initializeDOMPurify();
      
      // Remove all HTML tags and get plain text
      const sanitized = purify.sanitize(htmlContent, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true
      });
      
      return sanitized as string;
    } catch (error) {
      return htmlContent; // Fallback to original content
    }
  }

  /**
   * Check if HTML content contains potentially dangerous elements
   */
  static analyzeSecurity(htmlContent: string): {
    hasDangerousElements: boolean;
    risks: string[];
    recommendations: string[];
  } {
    const risks: string[] = [];
    const recommendations: string[] = [];

    // Check for script tags
    if (/<script[^>]*>/i.test(htmlContent)) {
      risks.push('Contains script tags');
      recommendations.push('Remove all script tags');
    }

    // Check for event handlers
    if (/on\w+\s*=/i.test(htmlContent)) {
      risks.push('Contains event handlers (onclick, onload, etc.)');
      recommendations.push('Remove all event handler attributes');
    }

    // Check for iframe/object/embed
    if (/<(iframe|object|embed)[^>]*>/i.test(htmlContent)) {
      risks.push('Contains embedded content (iframe, object, embed)');
      recommendations.push('Remove embedded content tags');
    }

    // Check for form elements
    if (/<(form|input|button)[^>]*>/i.test(htmlContent)) {
      risks.push('Contains form elements');
      recommendations.push('Remove form elements if not needed');
    }

    // Check for style tags
    if (/<style[^>]*>/i.test(htmlContent)) {
      risks.push('Contains style tags');
      recommendations.push('Use external CSS or sanitized inline styles');
    }

    // Check for javascript: URLs
    if (/javascript:/i.test(htmlContent)) {
      risks.push('Contains javascript: URLs');
      recommendations.push('Replace with safe URLs');
    }

    // Check for data: URLs
    if (/data:/i.test(htmlContent)) {
      risks.push('Contains data: URLs');
      recommendations.push('Verify data URLs are safe');
    }

    return {
      hasDangerousElements: risks.length > 0,
      risks,
      recommendations
    };
  }

  /**
   * Validate HTML content for email attachments
   */
  static validateHtmlAttachment(htmlContent: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sanitizedContent?: string;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check content size (prevent DoS)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (htmlContent.length > maxSize) {
      errors.push(`HTML content is too large (${Math.round(htmlContent.length / 1024 / 1024)}MB > 5MB)`);
      return { isValid: false, errors, warnings };
    }

    // Analyze security risks
    const securityAnalysis = this.analyzeSecurity(htmlContent);
    if (securityAnalysis.hasDangerousElements) {
      warnings.push(`Security risks detected: ${securityAnalysis.risks.join(', ')}`);
      warnings.push(`Recommendations: ${securityAnalysis.recommendations.join(', ')}`);
    }

    // Sanitize the content
    const sanitizationResult = this.sanitizeHtml(htmlContent, {
      allowImages: false, // Conservative approach for email attachments
      allowLinks: false,  // Conservative approach for email attachments
      allowStyles: false  // Conservative approach for email attachments
    });

    if (!sanitizationResult.isValid) {
      errors.push(...sanitizationResult.warnings);
      return { isValid: false, errors, warnings };
    }

    warnings.push(...sanitizationResult.warnings);

    return {
      isValid: true,
      errors,
      warnings,
      sanitizedContent: sanitizationResult.sanitized
    };
  }

  /**
   * Create safe HTML preview for email display
   */
  static createSafePreview(htmlContent: string, maxLength: number = 500): {
    preview: string;
    isTruncated: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // First, extract text content
    const textContent = this.extractTextContent(htmlContent);
    
    // Truncate if needed
    const isTruncated = textContent.length > maxLength;
    const preview = isTruncated ? textContent.substring(0, maxLength) + '...' : textContent;

    if (isTruncated) {
      warnings.push(`Content was truncated to ${maxLength} characters`);
    }

    return {
      preview,
      isTruncated,
      warnings
    };
  }

  /**
   * Sanitize email content to prevent injection attacks
   * This method provides basic text sanitization for email content
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
      .replace(/data:text\/javascript/gi, 'data:text/plain')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }
}
