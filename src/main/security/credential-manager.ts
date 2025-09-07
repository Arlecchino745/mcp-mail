import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SecurityEnhancement } from './security-enhancement.js';

/**
 * Credential manager for secure storage and retrieval of sensitive data
 */
export class CredentialManager {
  private static instance: CredentialManager;
  private masterKey: Buffer;
  private credentialsFile: string;

  private constructor() {
    // Generate or load master key
    this.masterKey = this.getOrCreateMasterKey();
    this.credentialsFile = path.join(process.cwd(), '.credentials.enc');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CredentialManager {
    if (!CredentialManager.instance) {
      CredentialManager.instance = new CredentialManager();
    }
    return CredentialManager.instance;
  }

  /**
   * Generate or load master key for encryption
   */
  private getOrCreateMasterKey(): Buffer {
    const keyFile = path.join(process.cwd(), '.master.key');
    
    // Check if key file exists
    if (fs.existsSync(keyFile)) {
      try {
        const keyData = fs.readFileSync(keyFile, 'utf8');
        const key = Buffer.from(keyData, 'hex');
        
        // Validate key length (should be 32 bytes for AES-256)
        if (key.length !== 32) {
          throw new Error('Invalid key length');
        }
        
        SecurityEnhancement.logSecurityEvent('Master key loaded from file', { keyFile });
        return key;
      } catch (error) {
        SecurityEnhancement.logSecurityEvent('Failed to load master key, generating new one', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    // Generate new master key
    const newKey = crypto.randomBytes(32); // 256 bits
    try {
      fs.writeFileSync(keyFile, newKey.toString('hex'), { mode: 0o600 }); // Read/write for owner only
      SecurityEnhancement.logSecurityEvent('New master key generated and saved', { keyFile });
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('Failed to save master key file', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    
    return newKey;
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(data: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16); // 128 bits
    const cipher = crypto.createCipheriv('aes-256-cbc', this.masterKey, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encrypted: string, iv: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc', 
      this.masterKey, 
      Buffer.from(iv, 'hex')
    );
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Store credentials securely
   */
  storeCredentials(credentials: { smtpPass: string; imapPass: string }): void {
    try {
      // Encrypt credentials
      const smtpEncrypted = this.encrypt(credentials.smtpPass);
      const imapEncrypted = this.encrypt(credentials.imapPass);
      
      // Prepare data for storage
      const data = {
        smtp: smtpEncrypted,
        imap: imapEncrypted,
        timestamp: new Date().toISOString()
      };
      
      // Encrypt the entire data structure
      const jsonData = JSON.stringify(data);
      const encryptedData = this.encrypt(jsonData);
      
      // Save to file
      fs.writeFileSync(
        this.credentialsFile, 
        JSON.stringify(encryptedData), 
        { mode: 0o600 } // Read/write for owner only
      );
      
      SecurityEnhancement.logSecurityEvent('Credentials stored securely', { 
        credentialsFile: this.credentialsFile 
      });
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('Failed to store credentials', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw new Error(`Failed to store credentials: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieve credentials securely
   */
  retrieveCredentials(): { smtpPass: string; imapPass: string } | null {
    try {
      // Check if credentials file exists
      if (!fs.existsSync(this.credentialsFile)) {
        SecurityEnhancement.logSecurityEvent('Credentials file not found', { 
          credentialsFile: this.credentialsFile 
        });
        return null;
      }
      
      // Read encrypted data
      const encryptedDataStr = fs.readFileSync(this.credentialsFile, 'utf8');
      const encryptedData = JSON.parse(encryptedDataStr);
      
      // Decrypt the data structure
      const jsonData = this.decrypt(encryptedData.encrypted, encryptedData.iv);
      const data = JSON.parse(jsonData);
      
      // Decrypt individual credentials
      const smtpPass = this.decrypt(data.smtp.encrypted, data.smtp.iv);
      const imapPass = this.decrypt(data.imap.encrypted, data.imap.iv);
      
      SecurityEnhancement.logSecurityEvent('Credentials retrieved securely', { 
        credentialsFile: this.credentialsFile 
      });
      
      return {
        smtpPass,
        imapPass
      };
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('Failed to retrieve credentials', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Check if secure credentials are available
   */
  hasSecureCredentials(): boolean {
    return fs.existsSync(this.credentialsFile);
  }

  /**
   * Clear stored credentials
   */
  clearCredentials(): void {
    try {
      if (fs.existsSync(this.credentialsFile)) {
        fs.unlinkSync(this.credentialsFile);
        SecurityEnhancement.logSecurityEvent('Credentials cleared', { 
          credentialsFile: this.credentialsFile 
        });
      }
    } catch (error) {
      SecurityEnhancement.logSecurityEvent('Failed to clear credentials', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
}