import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CredentialManager, SecurityEnhancement } from '../security/index.js';

/**
 * Register credential management tools
 */
export function registerCredentialTools(server: McpServer): void {
  // Store credentials securely
  server.tool(
    "store_mail_credentials",
    {
      smtpPass: z.string(),
      imapPass: z.string()
    },
    async (params) => {
      try {
        const credentialManager = CredentialManager.getInstance();
        credentialManager.storeCredentials({
          smtpPass: params.smtpPass,
          imapPass: params.imapPass
        });

        SecurityEnhancement.logSecurityEvent('Credentials stored via MCP tool', {});

        return {
          content: [
            { 
              type: "text", 
              text: "Credentials stored securely. You can now remove SMTP_PASS and IMAP_PASS from your environment variables for enhanced security." 
            }
          ]
        };
      } catch (error) {
        SecurityEnhancement.logSecurityEvent('Failed to store credentials via MCP tool', {
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          content: [
            { 
              type: "text", 
              text: `Failed to store credentials: ${error instanceof Error ? error.message : String(error)}` 
            }
          ]
        };
      }
    }
  );

  // Retrieve stored credentials info
  server.tool(
    "get_credential_status",
    {},
    async () => {
      try {
        const credentialManager = CredentialManager.getInstance();
        const hasCredentials = credentialManager.hasSecureCredentials();

        SecurityEnhancement.logSecurityEvent('Credential status checked via MCP tool', {
          hasCredentials
        });

        return {
          content: [
            { 
              type: "text", 
              text: hasCredentials 
                ? "Secure credentials are stored and will be used for mail operations." 
                : "No secure credentials stored. Using environment variables if available." 
            }
          ]
        };
      } catch (error) {
        SecurityEnhancement.logSecurityEvent('Failed to check credential status via MCP tool', {
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          content: [
            { 
              type: "text", 
              text: `Failed to check credential status: ${error instanceof Error ? error.message : String(error)}` 
            }
          ]
        };
      }
    }
  );

  // Clear stored credentials
  server.tool(
    "clear_stored_credentials",
    {
      confirm: z.boolean()
    },
    async (params) => {
      if (!params.confirm) {
        return {
          content: [
            { 
              type: "text", 
              text: "Confirmation required to clear credentials. Please set confirm=true to proceed." 
            }
          ]
        };
      }

      try {
        const credentialManager = CredentialManager.getInstance();
        credentialManager.clearCredentials();

        SecurityEnhancement.logSecurityEvent('Stored credentials cleared via MCP tool', {});

        return {
          content: [
            { 
              type: "text", 
              text: "Stored credentials have been cleared. The system will now use environment variables if available." 
            }
          ]
        };
      } catch (error) {
        SecurityEnhancement.logSecurityEvent('Failed to clear credentials via MCP tool', {
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          content: [
            { 
              type: "text", 
              text: `Failed to clear credentials: ${error instanceof Error ? error.message : String(error)}` 
            }
          ]
        };
      }
    }
  );
}