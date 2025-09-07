/**
 * Password validation utilities
 */
export class PasswordValidator {
  
  /**
   * Password strength requirements configuration
   */
  private static readonly DEFAULT_CONFIG = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    specialChars: '!@#$%^&*(),.?":{}|<>'
  };

  /**
   * Validate password strength with configurable requirements
   */
  static validateStrength(
    password: string, 
    config: Partial<typeof PasswordValidator.DEFAULT_CONFIG> = {}
  ): { isValid: boolean; errors: string[]; score: number } {
    const errors: string[] = [];
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    let score = 0;

    if (!password || typeof password !== 'string') {
      errors.push('Password is required and must be a string');
      return { isValid: false, errors, score: 0 };
    }

    // Length check
    if (password.length < finalConfig.minLength) {
      errors.push(`Password must be at least ${finalConfig.minLength} characters long`);
    } else {
      score += Math.min(password.length - finalConfig.minLength + 1, 4);
    }

    // Uppercase check
    if (finalConfig.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else if (/[A-Z]/.test(password)) {
      score += 1;
    }

    // Lowercase check
    if (finalConfig.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else if (/[a-z]/.test(password)) {
      score += 1;
    }

    // Numbers check
    if (finalConfig.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else if (/\d/.test(password)) {
      score += 1;
    }

    // Special characters check
    if (finalConfig.requireSpecialChars) {
      const specialCharRegex = new RegExp(`[${finalConfig.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
      if (!specialCharRegex.test(password)) {
        errors.push('Password must contain at least one special character');
      } else {
        score += 1;
      }
    }

    // Additional scoring for complexity
    const uniqueChars = new Set(password).size;
    score += Math.min(Math.floor(uniqueChars / 4), 2);

    // Penalty for common patterns
    if (this.hasCommonPatterns(password)) {
      score = Math.max(0, score - 2);
      errors.push('Password contains common patterns and may be weak');
    }

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.min(score, 10) // Cap at 10
    };
  }

  /**
   * Check for common weak password patterns
   */
  private static hasCommonPatterns(password: string): boolean {
    const weakPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /abc/i,
      /(.)\1{2,}/, // Repeated characters
      /012345/,
      /987654/
    ];

    return weakPatterns.some(pattern => pattern.test(password));
  }

  /**
   * Generate password strength description
   */
  static getStrengthDescription(score: number): string {
    if (score <= 2) return 'Very Weak';
    if (score <= 4) return 'Weak';
    if (score <= 6) return 'Fair';
    if (score <= 8) return 'Good';
    return 'Strong';
  }

  /**
   * Get password improvement suggestions
   */
  static getSuggestions(password: string): string[] {
    const suggestions: string[] = [];
    
    if (password.length < 12) {
      suggestions.push('Consider using a longer password (12+ characters)');
    }
    
    if (!/[A-Z]/.test(password)) {
      suggestions.push('Add uppercase letters');
    }
    
    if (!/[a-z]/.test(password)) {
      suggestions.push('Add lowercase letters');
    }
    
    if (!/\d/.test(password)) {
      suggestions.push('Add numbers');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      suggestions.push('Add special characters');
    }
    
    if (this.hasCommonPatterns(password)) {
      suggestions.push('Avoid common patterns like "123456" or "password"');
    }

    return suggestions;
  }
}
