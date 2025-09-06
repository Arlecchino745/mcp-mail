import { MailConfig } from '../mail-service.js';

/**
 * Validate whether necessary environment variables are set
 */
export function validateEnvironmentVariables(): void {
  const requiredVars = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'IMAP_HOST',
    'IMAP_USER',
    'IMAP_PASS'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    const errorMessage = `
Missing required environment variables:
${missingVars.join('\n')}

Please set these variables in your .env file:
SMTP_HOST=your.smtp.server
SMTP_PORT=587 (or your server port)
SMTP_SECURE=true/false
SMTP_USER=your.email@domain.com
SMTP_PASS=your_password

IMAP_HOST=your.imap.server
IMAP_PORT=993 (or your server port)
IMAP_SECURE=true/false
IMAP_USER=your.email@domain.com
IMAP_PASS=your_password

Optional variables:
DEFAULT_FROM_NAME=Your Name
DEFAULT_FROM_EMAIL=your.email@domain.com
`;
    console.error(errorMessage);
    throw new Error('Missing required environment variables');
  }

  // Validate port numbers
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const imapPort = parseInt(process.env.IMAP_PORT || '993');

  if (isNaN(smtpPort) || smtpPort <= 0 || smtpPort > 65535) {
    throw new Error('Invalid SMTP_PORT. Must be a number between 1 and 65535');
  }

  if (isNaN(imapPort) || imapPort <= 0 || imapPort > 65535) {
    throw new Error('Invalid IMAP_PORT. Must be a number between 1 and 65535');
  }
}

/**
 * Load mail configuration from environment variables
 */
export function loadMailConfig(): MailConfig {
  return {
    smtp: {
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      }
    },
    imap: {
      host: process.env.IMAP_HOST!,
      port: parseInt(process.env.IMAP_PORT || '993'),
      secure: process.env.IMAP_SECURE === 'true',
      auth: {
        user: process.env.IMAP_USER!,
        pass: process.env.IMAP_PASS!,
      }
    },
    defaults: {
      fromName: process.env.DEFAULT_FROM_NAME || process.env.SMTP_USER?.split('@')[0] || '',
      fromEmail: process.env.DEFAULT_FROM_EMAIL || process.env.SMTP_USER || '',
    }
  };
}
