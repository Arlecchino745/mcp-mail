import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MailService } from '../mail-service/exports.js';

/**
 * Register mail flag tools
 */
export function registerFlagTools(server: McpServer, mailService: MailService): void {
  // Mark multiple emails as read
  server.tool(
    "markMultipleAsRead",
    {
      uids: z.array(z.number()),
      folder: z.string().default('INBOX')
    },
    async ({ uids, folder }) => {
      try {
        const numericUids = uids.map((uid: number) => Number(uid));
        const success = await mailService.markMultipleAsRead(numericUids, folder);
        
        if (success) {
          return {
            content: [
              { type: "text", text: `Marked ${uids.length} emails as read` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `Failed to mark multiple emails as read` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while marking multiple emails as read: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );

  // Mark multiple emails as unread
  server.tool(
    "markMultipleAsUnread",
    {
      uids: z.array(z.number()),
      folder: z.string().default('INBOX')
    },
    async ({ uids, folder }) => {
      try {
        const numericUids = uids.map((uid: number) => Number(uid));
        const success = await mailService.markMultipleAsUnread(numericUids, folder);
        
        if (success) {
          return {
            content: [
              { type: "text", text: `Marked ${uids.length} emails as unread` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `Failed to mark multiple emails as unread` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while marking multiple emails as unread: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );

  // Mark email as read
  server.tool(
    "markAsRead",
    {
      uid: z.number(),
      folder: z.string().default('INBOX')
    },
    async ({ uid, folder }) => {
      try {
        const numericUid = Number(uid);
        const success = await mailService.markAsRead(numericUid, folder);
        
        if (success) {
          return {
            content: [
              { type: "text", text: `Email (UID: ${uid}) has been marked as read` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `Failed to mark email (UID: ${uid}) as read` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while marking email as read: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );

  // Mark email as unread
  server.tool(
    "markAsUnread",
    {
      uid: z.number(),
      folder: z.string().default('INBOX')
    },
    async ({ uid, folder }) => {
      try {
        const numericUid = Number(uid);
        const success = await mailService.markAsUnread(numericUid, folder);
        
        if (success) {
          return {
            content: [
              { type: "text", text: `Email (UID: ${uid}) has been marked as unread` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `Failed to mark email (UID: ${uid}) as unread` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while marking email as unread: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );
}
