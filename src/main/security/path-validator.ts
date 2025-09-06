import path from 'path';
import fs from 'fs';
import { SecurityEnhancement } from './security-enhancement.js';

/**
 * Path validation and sanitization service for secure file operations
 */
export class PathValidator {
  
  // Safe characters for filenames and paths
  private static readonly SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9._\-\s()[\]{}]+$/;
  
  // Maximum path depth to prevent deeply nested attacks
  private static readonly MAX_PATH_DEPTH = 10;
  
  // Allowed base directories (relative to process.cwd())
  private static readonly ALLOWED_BASE_DIRS = [
    'downloads',
    'temp',
    'attachments',
    'uploads'
  ];

  /**
   * Validate and normalize a file path
   */
  static validateAndNormalizePath(inputPath: string, baseDir?: string): {
    isValid: boolean;
    normalizedPath: string;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let normalizedPath = '';

    try {
      // Basic input validation
      if (!inputPath || typeof inputPath !== 'string') {
        errors.push('Path must be a non-empty string');
        return { isValid: false, normalizedPath: '', errors, warnings };
      }

      // Remove leading/trailing whitespace
      inputPath = inputPath.trim();

      // Check for null bytes (security risk)
      if (inputPath.includes('\0')) {
        errors.push('Path contains null bytes');
        return { isValid: false, normalizedPath: '', errors, warnings };
      }

      // Check path length
      if (inputPath.length > 260) { // Windows MAX_PATH limit
        errors.push('Path is too long (max 260 characters)');
        return { isValid: false, normalizedPath: '', errors, warnings };
      }

      // Normalize the path
      normalizedPath = path.normalize(inputPath);

      // Check for path traversal attempts
      if (normalizedPath.includes('..')) {
        errors.push('Path traversal detected (..)');
        return { isValid: false, normalizedPath: '', errors, warnings };
      }

      // Check for absolute paths
      if (path.isAbsolute(normalizedPath)) {
        errors.push('Absolute paths are not allowed');
        return { isValid: false, normalizedPath: '', errors, warnings };
      }

      // Check path depth
      const pathParts = normalizedPath.split(path.sep).filter(part => part !== '');
      if (pathParts.length > this.MAX_PATH_DEPTH) {
        errors.push(`Path depth exceeds maximum allowed (${this.MAX_PATH_DEPTH})`);
        return { isValid: false, normalizedPath: '', errors, warnings };
      }

      // Validate each path component
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        
        // Check for empty parts
        if (!part || part.trim() === '') {
          errors.push('Path contains empty components');
          continue;
        }

        // Check for reserved names on Windows
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
        const nameWithoutExt = path.parse(part).name.toUpperCase();
        if (reservedNames.includes(nameWithoutExt)) {
          errors.push(`Path contains reserved name: ${part}`);
        }

        // Check for dangerous characters
        const dangerousChars = /[<>:"|?*\x00-\x1f]/;
        if (dangerousChars.test(part)) {
          errors.push(`Path component contains dangerous characters: ${part}`);
        }

        // Warn about unusual characters
        if (!this.SAFE_FILENAME_PATTERN.test(part) && i === pathParts.length - 1) {
          warnings.push(`Filename contains unusual characters: ${part}`);
        }
      }

      // If a base directory is specified, validate it
      if (baseDir) {
        const baseValidation = this.validateBaseDirectory(baseDir);
        if (!baseValidation.isValid) {
          errors.push(...baseValidation.errors);
        }
        
        // Construct full path and validate it's within base directory
        const fullPath = path.resolve(process.cwd(), baseDir, normalizedPath);
        const basePath = path.resolve(process.cwd(), baseDir);
        
        if (!fullPath.startsWith(basePath + path.sep) && fullPath !== basePath) {
          errors.push('Normalized path escapes base directory');
        }
      }

      return {
        isValid: errors.length === 0,
        normalizedPath,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Path validation error: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, normalizedPath: '', errors, warnings };
    }
  }

  /**
   * Validate base directory
   */
  static validateBaseDirectory(baseDir: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!baseDir || typeof baseDir !== 'string') {
      errors.push('Base directory must be a non-empty string');
      return { isValid: false, errors };
    }

    // Check if it's one of the allowed base directories
    if (!this.ALLOWED_BASE_DIRS.includes(baseDir)) {
      errors.push(`Base directory '${baseDir}' is not in allowed list: ${this.ALLOWED_BASE_DIRS.join(', ')}`);
    }

    // Additional security checks
    if (baseDir.includes('..') || baseDir.includes('/') || baseDir.includes('\\')) {
      errors.push('Base directory cannot contain path separators or traversal patterns');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a secure path within a base directory
   */
  static createSecurePath(filename: string, baseDir: string = 'downloads'): {
    success: boolean;
    securePath: string;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate base directory
      const baseDirValidation = this.validateBaseDirectory(baseDir);
      if (!baseDirValidation.isValid) {
        errors.push(...baseDirValidation.errors);
        return { success: false, securePath: '', errors, warnings };
      }

      // Validate and normalize the filename
      const pathValidation = this.validateAndNormalizePath(filename, baseDir);
      if (!pathValidation.isValid) {
        errors.push(...pathValidation.errors);
        return { success: false, securePath: '', errors, warnings };
      }

      warnings.push(...pathValidation.warnings);

      // Create the full secure path
      const basePath = path.resolve(process.cwd(), baseDir);
      const securePath = path.join(basePath, pathValidation.normalizedPath);

      // Final validation: ensure the path is still within bounds
      if (!securePath.startsWith(basePath + path.sep) && securePath !== basePath) {
        errors.push('Final path validation failed - path escapes base directory');
        return { success: false, securePath: '', errors, warnings };
      }

      SecurityEnhancement.logSecurityEvent('Secure path created', {
        filename,
        baseDir,
        securePath,
        warnings: warnings.length > 0 ? warnings : undefined
      });

      return {
        success: true,
        securePath,
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Failed to create secure path: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, securePath: '', errors, warnings };
    }
  }

  /**
   * Ensure a directory exists and is secure
   */
  static ensureSecureDirectory(dirPath: string): { success: boolean; error?: string } {
    try {
      // Validate the directory path
      const validation = this.validateAndNormalizePath(dirPath);
      if (!validation.isValid) {
        return { success: false, error: validation.errors.join(', ') };
      }

      const fullPath = path.resolve(process.cwd(), validation.normalizedPath);

      // Check if directory already exists
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory()) {
          return { success: false, error: 'Path exists but is not a directory' };
        }
        
        // Check directory permissions
        try {
          fs.accessSync(fullPath, fs.constants.W_OK);
        } catch {
          return { success: false, error: 'Directory is not writable' };
        }
        
        return { success: true };
      }

      // Create directory with secure permissions
      fs.mkdirSync(fullPath, { recursive: true, mode: 0o755 });

      SecurityEnhancement.logSecurityEvent('Secure directory created', {
        dirPath: fullPath
      });

      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        error: `Failed to ensure directory: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Check if a path is safe for file operations
   */
  static isPathSafe(filePath: string, baseDir?: string): boolean {
    const validation = this.validateAndNormalizePath(filePath, baseDir);
    return validation.isValid;
  }

  /**
   * Generate a unique secure filename
   */
  static generateUniqueSecureFilename(originalFilename: string, baseDir: string = 'downloads'): {
    success: boolean;
    filename: string;
    fullPath: string;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      // First, create a secure path
      const pathResult = this.createSecurePath(originalFilename, baseDir);
      if (!pathResult.success) {
        errors.push(...pathResult.errors);
        return { success: false, filename: '', fullPath: '', errors };
      }

      let uniquePath = pathResult.securePath;
      let filename = path.basename(pathResult.securePath);
      const ext = path.extname(filename);
      const nameWithoutExt = path.basename(filename, ext);
      let counter = 1;

      // Find a unique filename
      while (fs.existsSync(uniquePath)) {
        filename = `${nameWithoutExt}_${counter}${ext}`;
        uniquePath = path.join(path.dirname(pathResult.securePath), filename);
        counter++;

        // Prevent infinite loop
        if (counter > 1000) {
          errors.push('Unable to generate unique filename after 1000 attempts');
          return { success: false, filename: '', fullPath: '', errors };
        }
      }

      return {
        success: true,
        filename,
        fullPath: uniquePath,
        errors
      };

    } catch (error) {
      errors.push(`Failed to generate unique filename: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, filename: '', fullPath: '', errors };
    }
  }
}
