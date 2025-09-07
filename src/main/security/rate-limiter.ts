import { SecurityEnhancement } from './security-enhancement.js';

/**
 * Rate limiting implementation for email operations
 */
export class RateLimiter {
  private static instances: Map<string, RateLimiter> = new Map();
  
  private limits: Map<string, { count: number; resetTime: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;
  private operationType: string;

  constructor(operationType: string, maxAttempts: number = 10, windowMs: number = 60000) {
    this.operationType = operationType;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  /**
   * Get or create a rate limiter instance for a specific operation type
   */
  static getInstance(operationType: string, maxAttempts?: number, windowMs?: number): RateLimiter {
    if (!this.instances.has(operationType)) {
      this.instances.set(operationType, new RateLimiter(operationType, maxAttempts, windowMs));
    }
    return this.instances.get(operationType)!;
  }

  /**
   * Check if an operation is allowed for the given identifier
   */
  isAllowed(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const key = `${this.operationType}:${identifier}`;
    const record = this.limits.get(key);

    if (!record || now > record.resetTime) {
      this.limits.set(key, { count: 1, resetTime: now + this.windowMs });
      return {
        allowed: true,
        remaining: this.maxAttempts - 1,
        resetIn: this.windowMs
      };
    }

    if (record.count >= this.maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: record.resetTime - now
      };
    }

    record.count++;
    return {
      allowed: true,
      remaining: this.maxAttempts - record.count,
      resetIn: record.resetTime - now
    };
  }

  /**
   * Reset the rate limit for a specific identifier
   */
  reset(identifier: string): void {
    const key = `${this.operationType}:${identifier}`;
    this.limits.delete(key);
  }

  /**
   * Get current rate limit status for an identifier
   */
  getStatus(identifier: string): { count: number; maxAttempts: number; resetIn: number } | null {
    const now = Date.now();
    const key = `${this.operationType}:${identifier}`;
    const record = this.limits.get(key);

    if (!record) {
      return null;
    }

    if (now > record.resetTime) {
      return null;
    }

    return {
      count: record.count,
      maxAttempts: this.maxAttempts,
      resetIn: record.resetTime - now
    };
  }

  /**
   * Clear all rate limit records (for testing purposes)
   */
  clearAll(): void {
    this.limits.clear();
  }
}

/**
 * Predefined rate limiters for common email operations
 */
export class EmailRateLimiters {
  // Rate limiter for sending emails (10 per minute per user)
  static sendMail = RateLimiter.getInstance('sendMail', 10, 60000);
  
  // Rate limiter for receiving/checking emails (30 per minute per user)
  static receiveMail = RateLimiter.getInstance('receiveMail', 30, 60000);
  
  // Rate limiter for authentication attempts (5 per 10 minutes per IP)
  static auth = RateLimiter.getInstance('auth', 5, 600000);
  
  // Rate limiter for attachment operations (20 per minute per user)
  static attachment = RateLimiter.getInstance('attachment', 20, 60000);
  
  // Rate limiter for folder operations (50 per minute per user)
  static folder = RateLimiter.getInstance('folder', 50, 60000);
}