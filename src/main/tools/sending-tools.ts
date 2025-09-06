import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MailService, MailInfo } from '../service/exports.js';

/**
 * Register mail sending related tools
 */
export function registerSendingTools(server: McpServer, mailService: MailService): void {
  // Bulk mail sending tool
  server.tool(
    "sendBulkMail",
    {
      to: z.array(z.string()),
      cc: z.array(z.string()).optional(),
      bcc: z.array(z.string()).optional(),
      subject: z.string(),
      text: z.string().optional(),
      html: z.string().optional(),
      attachments: z.array(
        z.object({
          filename: z.string(),
          content: z.union([z.string(), z.instanceof(Buffer)]),
          contentType: z.string().optional()
        })
      ).optional()
    },
    async (params) => {
      try {
        if (!params.text && !params.html) {
          return {
            content: [
              { type: "text", text: `Mail content cannot be empty, please provide text or html parameter.` }
            ]
          };
        }
        
        console.log(`Starting bulk mail sending, number of recipients: ${params.to.length}`);
        
        const results = [];
        let successCount = 0;
        let failureCount = 0;
        
        // Send in batches, maximum 10 recipients per batch
        const batchSize = 10;
        for (let i = 0; i < params.to.length; i += batchSize) {
          const batch = params.to.slice(i, i + batchSize);
          
          try {
            const result = await mailService.sendMail({
              to: batch,
              cc: params.cc,
              bcc: params.bcc,
              subject: params.subject,
              text: params.text,
              html: params.html,
              attachments: params.attachments
            });
            
            results.push(result);
            
            if (result.success) {
              successCount += batch.length;
            } else {
              failureCount += batch.length;
            }
            
            // Add delay to avoid mail server restrictions
            if (i + batchSize < params.to.length) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`Error sending batch ${i / batchSize + 1}:`, error);
            failureCount += batch.length;
          }
        }
        
        return {
          content: [
            { 
              type: "text", 
              text: `Bulk mail sending completed.\nSuccess: ${successCount} recipients\nFailed: ${failureCount} recipients\n\n${
                failureCount > 0 ? 'Some emails failed to send, possibly due to mail server restrictions or invalid recipient addresses.' : ''
              }`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while sending bulk mail: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );
  
  server.tool(
    "sendMail",
    {
      to: z.array(z.string()),
      cc: z.string().or(z.array(z.string())).optional(),
      bcc: z.string().or(z.array(z.string())).optional(),
      subject: z.string(),
      text: z.string().optional(),
      html: z.string().optional(),
      useHtml: z.boolean().default(false),
      attachments: z.array(
        z.object({
          filename: z.string(),
          content: z.union([z.string(), z.instanceof(Buffer)]),
          contentType: z.string().optional()
        })
      ).optional()
    },
    async (params) => {
      try {
        // Check if content is provided
        if (!params.text && !params.html) {
          return {
            content: [
              { type: "text", text: `Mail content cannot be empty, please provide text or html parameter.` }
            ]
          };
        }
        
        // If HTML is specified but no HTML content is provided, automatically convert
        if (params.useHtml && !params.html && params.text) {
          // Simple conversion of text to HTML
          params.html = params.text
            .split('\n')
            .map((line: string) => `<p>${line}</p>`)
            .join('');
        }
        
        // Process recipient information, ensure to field exists
        const to = params.to;
        
        const mailInfo: MailInfo = {
          to: to,
          subject: params.subject,
          attachments: params.attachments
        };
        
        // Process CC and BCC information
        if (params.cc) {
          mailInfo.cc = typeof params.cc === 'string' ? params.cc : params.cc;
        }
        
        if (params.bcc) {
          mailInfo.bcc = typeof params.bcc === 'string' ? params.bcc : params.bcc;
        }
        
        // Set mail content
        if (params.html || (params.useHtml && params.text)) {
          mailInfo.html = params.html || params.text?.split('\n').map((line: string) => `<p>${line}</p>`).join('');
        } else {
          mailInfo.text = params.text;
        }
        
        const result = await mailService.sendMail(mailInfo);
        
        if (result.success) {
          return {
            content: [
              { type: "text", text: `Mail sent successfully, message ID: ${result.messageId}\n\nTip: If you need to wait for a reply, you can use the waitForReply tool.` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `Mail sending failed: ${result.error}` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while sending mail: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );

  // Send simple mail tool (keep original implementation)
  server.tool(
    "sendSimpleMail",
    {
      to: z.string(),
      subject: z.string(),
      body: z.string()
    },
    async ({ to, subject, body }) => {
      try {
        const result = await mailService.sendMail({
          to,
          subject,
          text: body
        });
        
        if (result.success) {
          return {
            content: [
              { type: "text", text: `Simple mail sent successfully, message ID: ${result.messageId}\n\nTip: If you need to wait for a reply, you can use the waitForReply tool.` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `Simple mail sending failed: ${result.error}` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while sending simple mail: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );

  // Add dedicated HTML mail sending tool
  server.tool(
    "sendHtmlMail",
    {
      to: z.string(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      subject: z.string(),
      html: z.string(),
      attachments: z.array(
        z.object({
          filename: z.string(),
          content: z.union([z.string(), z.instanceof(Buffer)]),
          contentType: z.string().optional()
        })
      ).optional()
    },
    async (params) => {
      try {
        const mailInfo: MailInfo = {
          to: params.to,
          subject: params.subject,
          html: params.html
        };
        
        if (params.cc) {
          mailInfo.cc = params.cc;
        }
        
        if (params.bcc) {
          mailInfo.bcc = params.bcc;
        }
        
        if (params.attachments) {
          mailInfo.attachments = params.attachments;
        }
        
        const result = await mailService.sendMail(mailInfo);
        
        if (result.success) {
          return {
            content: [
              { type: "text", text: `HTML mail sent successfully, message ID: ${result.messageId}\n\nTip: If you need to wait for a reply, you can use the waitForReply tool.` }
            ]
          };
        } else {
          return {
            content: [
              { type: "text", text: `HTML mail sending failed: ${result.error}` }
            ]
          };
        }
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error occurred while sending HTML mail: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );
}
