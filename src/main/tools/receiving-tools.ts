import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MailService, MailSearchOptions, MailItem } from '../service/exports.js';
import path from 'path';
import fs from 'fs';
import { FileSecurity, SecurityEnhancement } from '../security/index.js';

/**
 * Register mail receiving and query related tools
 */
export function registerReceivingTools(server: McpServer, mailService: MailService): void {
  // Wait for new mail reply
  // This tool is used to wait for user mail replies. This tool can be called multiple times, it is recommended to check the existing mail list before calling.
  server.tool(
    "waitForReply",
    {
      folder: z.string().default('INBOX'),
      timeout: z.number().default(3 * 60 * 60 * 1000)
    },
    async ({ folder, timeout }) => {
      try {
        const result = await mailService.waitForNewReply(folder, timeout);
        
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
  server.tool(
    "searchEmails",
    {
      keywords: z.string().optional(),
      folders: z.array(z.string()).optional(),
      startDate: z.union([z.date(), z.string().datetime()]).optional(),
      endDate: z.union([z.date(), z.string().datetime()]).optional(),
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

        const emails = await mailService.advancedSearchMails({
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
  server.tool(
    "listEmails",
    {
      folder: z.string().default('INBOX'),
      limit: z.number().default(20),
      readStatus: z.enum(['read', 'unread', 'all']).default('all'),
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      fromDate: z.union([z.date(), z.string().datetime()]).optional(),
      toDate: z.union([z.date(), z.string().datetime()]).optional(),
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

        const emails = await mailService.searchMails(options);
        
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
  server.tool(
    "getContacts",
    {
      maxResults: z.number().default(50),
      searchTerm: z.string().optional()
    },
    async (params) => {
      try {
        const result = await mailService.getContacts({
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
  server.tool(
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
        let email = await mailService.getMailDetail(numericUid, folder);
        
        // If normal retrieval fails, try to get the specified UID email through search
        if (!email) {
          console.log(`Failed to get email details through normal method, trying to get email with UID ${numericUid} through search method`);
          const searchResults = await mailService.searchMails({ 
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
  server.tool(
    "deleteEmail",
    {
      uid: z.number(),
      folder: z.string().default('INBOX')
    },
    async ({ uid, folder }) => {
      try {
        const numericUid = Number(uid);
        const success = await mailService.deleteMail(numericUid, folder);
        
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
  server.tool(
    "moveEmail",
    {
      uid: z.number(),
      sourceFolder: z.string(),
      targetFolder: z.string()
    },
    async ({ uid, sourceFolder, targetFolder }) => {
      try {
        const numericUid = Number(uid);
        const success = await mailService.moveMail(numericUid, sourceFolder, targetFolder);
        
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
  server.tool(
    "getAttachment",
    {
      uid: z.number(),
      folder: z.string().default('INBOX'),
      attachmentIndex: z.number(),
      saveToFile: z.boolean().default(true)
    },
    async (params) => {
      try {
        // Log security event
        SecurityEnhancement.logSecurityEvent('Attachment download request', {
          uid: params.uid,
          folder: params.folder,
          attachmentIndex: params.attachmentIndex,
          saveToFile: params.saveToFile
        });

        const attachment = await mailService.getAttachment(
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

        // Validate attachment security
        const validation = FileSecurity.validateAttachment(attachment);
        if (!validation.isValid) {
          SecurityEnhancement.logSecurityEvent('Attachment validation failed', {
            filename: attachment.filename,
            errors: validation.errors
          });
          return {
            content: [
              { type: "text", text: `Attachment validation failed: ${validation.errors.join(', ')}` }
            ]
          };
        }

        // Log warnings if any
        if (validation.warnings.length > 0) {
          SecurityEnhancement.logSecurityEvent('Attachment security warnings', {
            filename: attachment.filename,
            warnings: validation.warnings
          });
        }

        // Get secure file information
        const fileInfo = FileSecurity.getFileInfo(attachment);
        
        // Process attachment based on whether to save to file
        if (params.saveToFile) {
          // Save attachment securely
          const saveResult = await FileSecurity.saveAttachment(attachment);
          
          if (!saveResult.success) {
            SecurityEnhancement.logSecurityEvent('Attachment save failed', {
              filename: attachment.filename,
              error: saveResult.error
            });
            return {
              content: [
                { type: "text", text: `Failed to save attachment: ${saveResult.error}` }
              ]
            };
          }

          SecurityEnhancement.logSecurityEvent('Attachment saved successfully', {
            filename: attachment.filename,
            filePath: saveResult.filePath,
            size: fileInfo.size
          });

          let resultText = `📎 Attachment "${fileInfo.filename}" has been downloaded and saved to ${saveResult.filePath}\n`;
          resultText += `Type: ${fileInfo.contentType}\n`;
          resultText += `Size: ${fileInfo.sizeFormatted}\n`;
          resultText += `SHA256: ${fileInfo.hash}`;

          if (saveResult.warnings && saveResult.warnings.length > 0) {
            resultText += `\n\n⚠️ Warnings:\n${saveResult.warnings.join('\n')}`;
          }
          
          return {
            content: [
              { 
                type: "text", 
                text: resultText
              }
            ]
          };
        } else {
          // Process content based on content type for preview
          if (fileInfo.isPreviewSafe) {
            // Display content for safe preview types
            const textContent = attachment.content.toString('utf-8');
            const truncatedContent = textContent.length > 10000 ? 
              textContent.substring(0, 10000) + '\n\n[Content truncated for security]' : 
              textContent;

            SecurityEnhancement.logSecurityEvent('Attachment content previewed', {
              filename: attachment.filename,
              contentType: fileInfo.contentType,
              size: fileInfo.size
            });

            return {
              content: [
                { 
                  type: "text", 
                  text: `📎 Attachment "${fileInfo.filename}" (${fileInfo.contentType})\nSize: ${fileInfo.sizeFormatted}\nSHA256: ${fileInfo.hash}\n\n${truncatedContent}` 
                }
              ]
            };
          } else if (attachment.contentType.startsWith('image/')) {
            // Provide information for image files without exposing content
            SecurityEnhancement.logSecurityEvent('Image attachment info displayed', {
              filename: attachment.filename,
              contentType: fileInfo.contentType,
              size: fileInfo.size
            });

            return {
              content: [
                { 
                  type: "text", 
                  text: `📎 Image attachment "${fileInfo.filename}" (${fileInfo.contentType})\nSize: ${fileInfo.sizeFormatted}\nSHA256: ${fileInfo.hash}\n\n[Image preview disabled for security. Use saveToFile=true to download]` 
                }
              ]
            };
          } else {
            // Other binary files - provide info only
            SecurityEnhancement.logSecurityEvent('Binary attachment info displayed', {
              filename: attachment.filename,
              contentType: fileInfo.contentType,
              size: fileInfo.size
            });

            return {
              content: [
                { 
                  type: "text", 
                  text: `📎 Binary attachment "${fileInfo.filename}" (${fileInfo.contentType})\nSize: ${fileInfo.sizeFormatted}\nSHA256: ${fileInfo.hash}\n\n[Binary content cannot be displayed. Use saveToFile=true to download]` 
                }
              ]
            };
          }
        }
      } catch (error) {
        SecurityEnhancement.logSecurityEvent('Attachment processing error', {
          uid: params.uid,
          folder: params.folder,
          attachmentIndex: params.attachmentIndex,
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          content: [
            { type: "text", text: `Error occurred while getting attachment: ${error instanceof Error ? error.message : String(error)}` }
          ]
        };
      }
    }
  );
}
