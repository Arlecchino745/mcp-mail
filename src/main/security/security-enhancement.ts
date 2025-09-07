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
   * Log security events (deprecated - use Logger.security instead)
   * @deprecated Use Logger.getInstance().security() for better security event logging
   */
  static logSecurityEvent(event: string, details: any = {}): void {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY] ${timestamp}: ${event}`, details);
  }
}
