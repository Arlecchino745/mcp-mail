import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MailService, MailConfig, MailInfo, MailSearchOptions, MailItem } from './mail-service.js';
import path from 'path';
import fs from 'fs';

export class MailMCP {
  private server: McpServer;
  private mailService: MailService;

  constructor() {
    // Validate environment variables
    this.validateEnvironmentVariables();

    // Load configuration from environment variables
    const config: MailConfig = {
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

    // Initialize mail service
    this.mailService = new MailService(config);

    // Initialize MCP server
    this.server = new McpServer({
      name: "mail-mcp",
      version: "1.0.0"
    });

    // Register tools
    this.registerTools();

    // Connect to standard input/output
    const transport = new StdioServerTransport();
    this.server.connect(transport).catch(err => {
      console.error('Failed to connect to MCP transport:', err);
    });
  }

  /**
   * Validate whether necessary environment variables are set
   */
  private validateEnvironmentVariables(): void {
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
   * Register all MCP tools
   */
  private registerTools(): void {
    // Mail sending related tools
    this.registerSendingTools();
    
    // Mail receiving and query related tools
    this.registerReceivingTools();
    
    // Mail folder management tools
    this.registerFolderTools();
    
    // Mail flag tools
    this.registerFlagTools();
  }

  /**
   * Register mail sending related tools
   */
  private registerSendingTools(): void {
    // Bulk mail sending tool
    this.server.tool(
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
              const result = await this.mailService.sendMail({
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
    
    this.server.tool(
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
          
          const result = await this.mailService.sendMail(mailInfo);
          
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
    this.server.tool(
      "sendSimpleMail",
      {
        to: z.string(),
        subject: z.string(),
        body: z.string()
      },
      async ({ to, subject, body }) => {
        try {
          const result = await this.mailService.sendMail({
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
    this.server.tool(
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
          
          const result = await this.mailService.sendMail(mailInfo);
          
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

  /**
   * Register mail receiving and query related tools
   */
  private registerReceivingTools(): void {
    // Wait for new mail reply
    // This tool is used to wait for user mail replies. This tool can be called multiple times, it is recommended to check the existing mail list before calling.
    this.server.tool(
      "waitForReply",
      {
        folder: z.string().default('INBOX'),
        timeout: z.number().default(3 * 60 * 60 * 1000)
      },
      async ({ folder, timeout }) => {
        try {
          const result = await this.mailService.waitForNewReply(folder, timeout);
          
          // If it's an unread mail warning
          if (result && typeof result === 'object' && 'type' in result && result.type === 'unread_warning') {
            let warningText = `⚠️ Detected ${result.mails.length} unread emails within the last 5 minutes.\n`;
            warningText += `Please process (read or reply) these emails first, then continue waiting for new replies:\n\n`;
            
            result.mails.forEach((mail, index) => {
              const fromStr = mail.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
              warningText += `${index + 1}. Subject: ${mail.subject}\n`;
              warningText += `   From: ${fromStr}\n`;
              warningText += `   Time: ${mail.date.toLocaleString()}\n`;
              warningText += `   UID: ${mail.uid}\n\n`;
            });
            
            warningText += `Tips:\n`;
            warningText += `1. Use the markAsRead tool to mark emails as read\n`;
            warningText += `2. Use the getEmailDetail tool to view email details\n`;
            warningText += `3. After processing these emails, call the waitForReply tool again to wait for new replies\n`;
            
            return {
              content: [
                { type: "text", text: warningText }
              ]
            };
          }
          
          // If timeout
          if (!result) {
            return {
              content: [
                { type: "text", text: `Waiting for mail reply timeout (${timeout / 1000} seconds)` }
              ]
            };
          }

          // Received new mail
          const email = result as MailItem;  // Add type assertion
          const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
          const date = email.date.toLocaleString();
          const status = email.isRead ? 'Read' : 'Unread';
          const attachmentInfo = email.hasAttachments ? '📎' : '';
          
          let resultText = `Received new mail!\n\n`;
          resultText += `[${status}] ${attachmentInfo} From: ${fromStr}\n`;
          resultText += `Subject: ${email.subject}\n`;
          resultText += `Time: ${date}\n`;
          resultText += `UID: ${email.uid}\n\n`;
          
          if (email.textBody) {
            resultText += `Content:\n${email.textBody}\n\n`;
          }
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while waiting for mail reply: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Advanced mail search - supports multiple folders and complex conditions
    this.server.tool(
      "searchEmails",
      {
        keywords: z.string().optional(),
        folders: z.array(z.string()).optional(),
        startDate: z.union([z.date(), z.string().datetime({ message: "startDate must be a valid ISO 8601 date time string or Date object" })]).optional(),
        endDate: z.union([z.date(), z.string().datetime({ message: "endDate must be a valid ISO 8601 date time string or Date object" })]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        hasAttachment: z.boolean().optional(),
        maxResults: z.number().default(50),
        includeBody: z.boolean().default(false)
      },
      async (params) => {
        try {
          console.log(`Starting advanced mail search, keywords: ${params.keywords || 'none'}`);
          
          // Process date strings
          const startDate = typeof params.startDate === 'string' ? new Date(params.startDate) : params.startDate;
          const endDate = typeof params.endDate === 'string' ? new Date(params.endDate) : params.endDate;

          const emails = await this.mailService.advancedSearchMails({
            folders: params.folders,
            keywords: params.keywords,
            startDate: startDate,
            endDate: endDate,
            from: params.from,
            to: params.to,
            subject: params.subject,
            hasAttachment: params.hasAttachment,
            maxResults: params.maxResults,
            includeBody: params.includeBody
          });
          
          // Convert to human readable format
          if (emails.length === 0) {
            return {
              content: [
                { type: "text", text: `No emails matching the criteria found.` }
              ]
            };
          }
          
          const searchTerms = [];
          if (params.keywords) searchTerms.push(`keyword "${params.keywords}"`);
          if (params.from) searchTerms.push(`from contains "${params.from}"`);
          if (params.to) searchTerms.push(`to contains "${params.to}"`);
          if (params.subject) searchTerms.push(`subject contains "${params.subject}"`);
          if (startDate) searchTerms.push(`start date ${startDate.toLocaleDateString()}`);
          if (endDate) searchTerms.push(`end date ${endDate.toLocaleDateString()}`);
          if (params.hasAttachment) searchTerms.push(`has attachment`);
          
          const searchDescription = searchTerms.length > 0 
            ? `Search criteria: ${searchTerms.join(', ')}` 
            : 'All emails';
          
          let resultText = `🔍 Mail search results (${emails.length} emails)\n${searchDescription}\n\n`;
          
          emails.forEach((email, index) => {
            const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
            const date = email.date.toLocaleString();
            const status = email.isRead ? 'Read' : 'Unread';
            const attachmentInfo = email.hasAttachments ? 'Yes' : '';
            const folder = email.folder;
            
            resultText += `${index + 1}. [${status}] ${attachmentInfo} From: ${fromStr}\n`;
            resultText += `   Subject: ${email.subject}\n`;
            resultText += `   Time: ${date}\n`;
            resultText += `   Folder: ${folder}\n`;
            resultText += `   UID: ${email.uid}\n\n`;
          });
          
          resultText += `Use the getEmailDetail tool with UID and folder to view email details.`;
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while searching emails: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Get inbox mail list
    this.server.tool(
      "listEmails",
      {
        folder: z.string().default('INBOX'),
        limit: z.number().default(20),
        readStatus: z.enum(['read', 'unread', 'all']).default('all'),
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        fromDate: z.union([z.date(), z.string().datetime({ message: "fromDate must be a valid ISO 8601 date time string or Date object" })]).optional(),
        toDate: z.union([z.date(), z.string().datetime({ message: "toDate must be a valid ISO 8601 date time string or Date object" })]).optional(),
        hasAttachments: z.boolean().optional()
      },
      async (params) => {
        try {
          // Process date strings
          const fromDate = typeof params.fromDate === 'string' ? new Date(params.fromDate) : params.fromDate;
          const toDate = typeof params.toDate === 'string' ? new Date(params.toDate) : params.toDate;
          
          const options: MailSearchOptions = {
            folder: params.folder,
            limit: params.limit,
            readStatus: params.readStatus,
            from: params.from,
            to: params.to,
            subject: params.subject,
            fromDate: fromDate,
            toDate: toDate,
            hasAttachments: params.hasAttachments
          };

          const emails = await this.mailService.searchMails(options);
          
          // Convert to human readable format
          if (emails.length === 0) {
            return {
              content: [
                { type: "text", text: `No emails matching the criteria found in ${params.folder} folder.` }
              ]
            };
          }
          
          let resultText = `Found ${emails.length} emails in ${params.folder} folder:\n\n`;
          
          emails.forEach((email, index) => {
            const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
            const date = email.date.toLocaleString();
            const status = email.isRead ? 'Read' : 'Unread';
            const attachmentInfo = email.hasAttachments ? '📎' : '';
            
            resultText += `${index + 1}. [${status}] ${attachmentInfo} From: ${fromStr}\n`;
            resultText += `   Subject: ${email.subject}\n`;
            resultText += `   Time: ${date}\n`;
            resultText += `   UID: ${email.uid}\n\n`;
          });
          
          resultText += `Use the getEmailDetail tool with UID to view email details.`;
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while getting mail list: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Get contacts
    this.server.tool(
      "getContacts",
      {
        maxResults: z.number().default(50),
        searchTerm: z.string().optional()
      },
      async (params) => {
        try {
          const result = await this.mailService.getContacts({
            maxResults: params.maxResults,
            searchTerm: params.searchTerm
          });
          
          const contacts = result.contacts;
          
          // Convert to human readable format
          if (contacts.length === 0) {
            const message = params.searchTerm 
              ? `No contacts found containing "${params.searchTerm}".` 
              : `No contacts found.`;
            
            return {
              content: [
                { type: "text", text: message }
              ]
            };
          }
          
          const header = params.searchTerm 
            ? `📋 Search results: Contacts containing "${params.searchTerm}" (${contacts.length}):\n\n` 
            : `📋 Contact list (${contacts.length}):\n\n`;
          
          let resultText = header;
          
          contacts.forEach((contact, index) => {
            const name = contact.name || '(No name)';
            const frequency = contact.frequency;
            const lastContact = contact.lastContact ? contact.lastContact.toLocaleDateString() : 'Unknown';
            
            resultText += `${index + 1}. ${name} <${contact.email}>\n`;
            resultText += `   Mail frequency: ${frequency} times\n`;
            resultText += `   Last contact: ${lastContact}\n\n`;
          });
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while getting contacts: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Get email details
    this.server.tool(
      "getEmailDetail",
      {
        uid: z.number(),
        folder: z.string().default('INBOX'),
        contentRange: z.object({
          start: z.number().default(0),
          end: z.number().default(2000)
        }).optional()
      },
      async ({ uid, folder, contentRange }) => {
        try {
          // Special handling for QQ mail, first try to get email details
          const numericUid = Number(uid);
          let email = await this.mailService.getMailDetail(numericUid, folder);
          
          // If normal retrieval fails, try to get the specified UID email through search
          if (!email) {
            console.log(`Failed to get email details through normal method, trying to get email with UID ${numericUid} through search method`);
            const searchResults = await this.mailService.searchMails({ 
              folder: folder,
              limit: 50 // Search more emails to increase the chance of finding the target
            });
            
            // Find the specified UID email from search results
            const foundEmail = searchResults.find(e => e.uid === numericUid);
            if (foundEmail) {
              console.log(`Found email with UID ${numericUid} in search results`);
              email = foundEmail;
              
              // Try to get email body (if not present)
              if (!email.textBody && !email.htmlBody) {
                console.log(`Email has no body content, trying to get body separately`);
                try {
                  // Additional logic to try to get body can be added here
                  // ...
                } catch (e) {
                  console.error('Error getting email body:', e);
                }
              }
            }
          }
          
          if (!email) {
            return {
              content: [
                { type: "text", text: `Email with UID ${numericUid} not found` }
              ]
            };
          }
          
          // Convert to human readable format
          const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
          const toStr = email.to.map(t => t.name ? `${t.name} <${t.address}>` : t.address).join(', ');
          const ccStr = email.cc ? email.cc.map(c => c.name ? `${c.name} <${c.address}>` : c.address).join(', ') : '';
          const date = email.date.toLocaleString();
          const status = email.isRead ? 'Read' : 'Unread';
          
          let resultText = `📧 Email details (UID: ${email.uid})\n\n`;
          resultText += `Subject: ${email.subject}\n`;
          resultText += `From: ${fromStr}\n`;
          resultText += `To: ${toStr}\n`;
          if (ccStr) resultText += `CC: ${ccStr}\n`;
          resultText += `Date: ${date}\n`;
          resultText += `Status: ${status}\n`;
          resultText += `Folder: ${email.folder}\n`;
          
          if (email.hasAttachments && email.attachments && email.attachments.length > 0) {
            resultText += `\n📎 Attachments (${email.attachments.length}):\n`;
            email.attachments.forEach((att, index) => {
              const sizeInKB = Math.round(att.size / 1024);
              resultText += `${index + 1}. ${att.filename} (${sizeInKB} KB, ${att.contentType})\n`;
            });
          }
          
          // Get email content
          let content = '';
          if (email.textBody) {
            content = email.textBody;
          } else if (email.htmlBody) {
            // Simple HTML to text processing
            content = '(HTML content, showing plain text version)\n\n' + 
              email.htmlBody
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]*>/g, '');
          } else {
            content = '(Email has no text content or content cannot be retrieved)\n\n' +
              'Possible reasons:\n' +
              '1. QQ mail IMAP access restrictions\n' +
              '2. Special mail content format\n' +
              'It is recommended to view the full content directly in QQ mail web or client';
          }
          
          // Calculate total content length
          const totalLength = content.length;
          
          // Set default range
          const start = contentRange?.start || 0;
          const end = Math.min(contentRange?.end || 2000, totalLength);
          
          // Extract content based on range
          const selectedContent = content.substring(start, end);
          
          resultText += `\n📄 Content (${start+1}-${end}/${totalLength} characters):\n\n`;
          resultText += selectedContent;
          
          // If there is more content, add prompt
          if (end < totalLength) {
            resultText += `\n\n[...]\n\n(Content is too long, only showing first ${end} characters. Use contentRange parameter to view more content, for example view ${end+1}-${Math.min(end+2000, totalLength)} range: contentRange.start=${end}, contentRange.end=${Math.min(end+2000, totalLength)})`;
          }
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while getting email details: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Delete email
    this.server.tool(
      "deleteEmail",
      {
        uid: z.number(),
        folder: z.string().default('INBOX')
      },
      async ({ uid, folder }) => {
        try {
          const numericUid = Number(uid);
          const success = await this.mailService.deleteMail(numericUid, folder);
          
          if (success) {
            return {
              content: [
                { type: "text", text: `Email (UID: ${numericUid}) has been deleted from ${folder} folder` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `Failed to delete email (UID: ${numericUid})` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while deleting email: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Move email to another folder
    this.server.tool(
      "moveEmail",
      {
        uid: z.number(),
        sourceFolder: z.string(),
        targetFolder: z.string()
      },
      async ({ uid, sourceFolder, targetFolder }) => {
        try {
          const numericUid = Number(uid);
          const success = await this.mailService.moveMail(numericUid, sourceFolder, targetFolder);
          
          if (success) {
            return {
              content: [
                { type: "text", text: `Email (UID: ${numericUid}) has been successfully moved from "${sourceFolder}" to "${targetFolder}" folder` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `Failed to move email (UID: ${numericUid})` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while moving email: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // Add get attachment tool
    this.server.tool(
      "getAttachment",
      {
        uid: z.number(),
        folder: z.string().default('INBOX'),
        attachmentIndex: z.number(),
        saveToFile: z.boolean().default(true)
      },
      async (params) => {
        try {
          const attachment = await this.mailService.getAttachment(
            params.uid, 
            params.folder, 
            params.attachmentIndex
          );
          
          if (!attachment) {
            return {
              content: [
                { type: "text", text: `Attachment ${params.attachmentIndex} of email with UID ${params.uid} not found` }
              ]
            };
          }
          
          // Process attachment based on whether to save to file
          if (params.saveToFile) {
            // Create attachment save directory
            const downloadDir = path.join(process.cwd(), 'downloads');
            if (!fs.existsSync(downloadDir)) {
              fs.mkdirSync(downloadDir, { recursive: true });
            }
            
            // Generate safe filename (remove illegal characters)
            const safeFilename = attachment.filename.replace(/[/\\?%*:|"<>]/g, '-');
            const filePath = path.join(downloadDir, safeFilename);
            
            // Write to file
            fs.writeFileSync(filePath, attachment.content);
            
            return {
              content: [
                { 
                  type: "text", 
                  text: `Attachment "${attachment.filename}" has been downloaded and saved to ${filePath}\nType: ${attachment.contentType}\nSize: ${Math.round(attachment.content.length / 1024)} KB` 
                }
              ]
            };
          } else {
            // Process content based on content type
            if (attachment.contentType.startsWith('text/') || 
                attachment.contentType === 'application/json') {
              // Display content for text files
              const textContent = attachment.content.toString('utf-8');
              return {
                content: [
                  { 
                    type: "text", 
                    text: `📎 Attachment "${attachment.filename}" (${attachment.contentType})\n\n${textContent.substring(0, 10000)}${textContent.length > 10000 ? '\n\n[Content too long, truncated]' : ''}` 
                  }
                ]
              };
            } else if (attachment.contentType.startsWith('image/')) {
              // Provide Base64 encoding for image files
              const base64Content = attachment.content.toString('base64');
              return {
                content: [
                  { 
                    type: "text", 
                    text: `📎 Image attachment "${attachment.filename}" (${attachment.contentType})\nSize: ${Math.round(attachment.content.length / 1024)} KB\n\n[Image content has been converted to Base64 encoding, can be used for online preview]` 
                  }
                ]
              };
            } else {
              // Other binary files
              return {
                content: [
                  { 
                    type: "text", 
                    text: `📎 Binary attachment "${attachment.filename}" (${attachment.contentType})\nSize: ${Math.round(attachment.content.length / 1024)} KB\n\n[Binary content cannot be displayed directly]` 
                  }
                ]
              };
            }
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error occurred while getting attachment: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );
  }

  /**
   * Register folder management tools
   */
  private registerFolderTools(): void {
    // Get all mail folders
    this.server.tool(
      "listFolders",
      { random_string: z.string().optional() },
      async () => {
        try {
          const folders = await this.mailService.getFolders();
          
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

  /**
   * Register mail flag tools
   */
  private registerFlagTools(): void {
    // Mark multiple emails as read
    this.server.tool(
      "markMultipleAsRead",
      {
        uids: z.array(z.number()),
        folder: z.string().default('INBOX')
      },
      async ({ uids, folder }) => {
        try {
          const numericUids = uids.map((uid: number) => Number(uid));
          const success = await this.mailService.markMultipleAsRead(numericUids, folder);
          
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
    this.server.tool(
      "markMultipleAsUnread",
      {
        uids: z.array(z.number()),
        folder: z.string().default('INBOX')
      },
      async ({ uids, folder }) => {
        try {
          const numericUids = uids.map((uid: number) => Number(uid));
          const success = await this.mailService.markMultipleAsUnread(numericUids, folder);
          
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
    this.server.tool(
      "markAsRead",
      {
        uid: z.number(),
        folder: z.string().default('INBOX')
      },
      async ({ uid, folder }) => {
        try {
          const numericUid = Number(uid);
          const success = await this.mailService.markAsRead(numericUid, folder);
          
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
    this.server.tool(
      "markAsUnread",
      {
        uid: z.number(),
        folder: z.string().default('INBOX')
      },
      async ({ uid, folder }) => {
        try {
          const numericUid = Number(uid);
          const success = await this.mailService.markAsUnread(numericUid, folder);
          
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

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.mailService.close();
  }
} 