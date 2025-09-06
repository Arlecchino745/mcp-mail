import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MailService } from '../mail-service/exports.js';

/**
 * Register folder management tools
 */
export function registerFolderTools(server: McpServer, mailService: MailService): void {
  // Get all mail folders
  server.tool(
    "listFolders",
    { random_string: z.string().optional() },
    async () => {
      try {
        const folders = await mailService.getFolders();
        
        if (folders.length === 0) {
          return {
            content: [
              { type: "text", text: "No mail folders found." }
            ]
          };
        }
        
        let resultText = `📁 Mail folder list (${folders.length}):\n\n`;
        folders.forEach((folder, index) => {
          resultText += `${index + 1}. ${folder}\n`;
        });
        
        return {
          content: [
            { type: "text", text: resultText }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while getting mail folder list: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );
}
