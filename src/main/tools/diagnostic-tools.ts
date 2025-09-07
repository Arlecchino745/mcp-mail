import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MailService } from '../service/exports.js';
import { SecurityEnhancement } from '../security/index.js';

/**
 * Register diagnostic tools for troubleshooting mail service issues
 */
export function registerDiagnosticTools(server: McpServer, mailService: MailService): void {
  // SMTP connection diagnostic tool
  server.tool(
    "testSmtpConnection",
    {},
    async () => {
      try {
        console.log('Running SMTP connection diagnostics...');
        
        SecurityEnhancement.logSecurityEvent('SMTP diagnostic test started', {
          timestamp: new Date().toISOString()
        });
        
        const result = await mailService.testSmtpConnection();
        
        SecurityEnhancement.logSecurityEvent('SMTP diagnostic test completed', {
          success: result.success
        });
        
        const statusText = result.success ? '✓ SUCCESS' : '✗ FAILED';
        const detailsText = result.details.join('\n');
        
        return {
          content: [
            { 
              type: "text", 
              text: `SMTP Connection Test - ${statusText}\n\n${detailsText}\n\n${
                result.success 
                  ? 'Your SMTP configuration is working correctly!' 
                  : 'Please review the troubleshooting information above and check your configuration.'
              }` 
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        SecurityEnhancement.logSecurityEvent('SMTP diagnostic test error', {
          error: errorMessage
        });
        
        return {
          content: [
            { 
              type: "text", 
              text: `SMTP Connection Test - ✗ ERROR\n\nAn unexpected error occurred during testing: ${errorMessage}\n\nPlease check your environment variables and configuration.` 
            }
          ]
        };
      }
    }
  );

  // Configuration diagnostic tool
  server.tool(
    "showMailConfiguration",
    {},
    async () => {
      try {
        // Get current configuration (without sensitive data)
        const config = {
          smtp: {
            host: process.env.SMTP_HOST || 'Not set',
            port: process.env.SMTP_PORT || 'Not set (default: 587)',
            secure: process.env.SMTP_SECURE || 'Not set (default: false)',
            user: process.env.SMTP_USER || 'Not set'
          },
          imap: {
            host: process.env.IMAP_HOST || 'Not set',
            port: process.env.IMAP_PORT || 'Not set (default: 993)',
            secure: process.env.IMAP_SECURE || 'Not set (default: true)',
            user: process.env.IMAP_USER || 'Not set'
          },
          defaults: {
            fromName: process.env.DEFAULT_FROM_NAME || process.env.SMTP_USER?.split('@')[0] || 'Not set',
            fromEmail: process.env.DEFAULT_FROM_EMAIL || process.env.SMTP_USER || 'Not set'
          }
        };

        const configText = `
Mail Service Configuration:

SMTP Settings:
- Host: ${config.smtp.host}
- Port: ${config.smtp.port}
- Secure: ${config.smtp.secure}
- User: ${config.smtp.user}
- Password: ${process.env.SMTP_PASS ? '••••••••' : 'Not set'}

IMAP Settings:
- Host: ${config.imap.host}
- Port: ${config.imap.port}
- Secure: ${config.imap.secure}
- User: ${config.imap.user}
- Password: ${process.env.IMAP_PASS ? '••••••••' : 'Not set'}

Default Email Settings:
- From Name: ${config.defaults.fromName}
- From Email: ${config.defaults.fromEmail}

Common Port Configurations:
- SMTP Port 25: Plain text (rarely used, often blocked)
- SMTP Port 587: STARTTLS (recommended, secure=false)
- SMTP Port 465: SSL/TLS (legacy, secure=true)
- IMAP Port 143: Plain text with STARTTLS (secure=false)
- IMAP Port 993: SSL/TLS (recommended, secure=true)

Note: Passwords are hidden for security. Use 'testSmtpConnection' to verify connectivity.
        `.trim();

        SecurityEnhancement.logSecurityEvent('Configuration displayed', {
          smtpConfigured: !!process.env.SMTP_HOST,
          imapConfigured: !!process.env.IMAP_HOST
        });

        return {
          content: [
            { type: "text", text: configText }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            { 
              type: "text", 
              text: `Error retrieving configuration: ${errorMessage}` 
            }
          ]
        };
      }
    }
  );

  // Environment setup guide tool
  server.tool(
    "showSetupGuide",
    {},
    async () => {
      const setupGuide = `
MCP Mail Service Setup Guide

1. Environment Variables Setup:
   Create a .env file in your project root with the following variables:

   # SMTP Configuration (for sending emails)
   SMTP_HOST=your.smtp.server.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your.email@domain.com
   SMTP_PASS=your_password_or_app_password

   # IMAP Configuration (for reading emails)
   IMAP_HOST=your.imap.server.com
   IMAP_PORT=993
   IMAP_SECURE=true
   IMAP_USER=your.email@domain.com
   IMAP_PASS=your_password_or_app_password

   # Default Email Settings (optional)
   DEFAULT_FROM_NAME=Your Name
   DEFAULT_FROM_EMAIL=your.email@domain.com

2. Common Email Provider Settings:

   Gmail:
   - SMTP_HOST=smtp.gmail.com
   - SMTP_PORT=587 or 465
   - IMAP_HOST=imap.gmail.com
   - IMAP_PORT=993
   - Note: Use App Passwords, not your regular password

   Outlook/Hotmail:
   - SMTP_HOST=smtp-mail.outlook.com
   - SMTP_PORT=587
   - IMAP_HOST=outlook.office365.com
   - IMAP_PORT=993

   Yahoo:
   - SMTP_HOST=smtp.mail.yahoo.com
   - SMTP_PORT=587 or 465
   - IMAP_HOST=imap.mail.yahoo.com
   - IMAP_PORT=993

3. Security Notes:
   - Use app-specific passwords when available
   - Enable 2FA on your email account
   - For Gmail, enable "Less secure app access" or use OAuth2
   - Some providers require you to enable IMAP/SMTP access

4. Testing:
   - Use 'testSmtpConnection' to verify your SMTP settings
   - Use 'showMailConfiguration' to review your current settings
   - Check firewall settings if connection fails

5. Troubleshooting "Greeting never received":
   - Verify the SMTP host and port are correct
   - Check if your network allows outbound connections
   - Try different ports (587 for STARTTLS, 465 for SSL)
   - Ensure the 'secure' setting matches your port
   - Contact your email provider for specific settings
      `;

      return {
        content: [
          { type: "text", text: setupGuide.trim() }
        ]
      };
    }
  );
}
