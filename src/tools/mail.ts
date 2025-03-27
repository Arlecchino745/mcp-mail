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
    // 从环境变量加载配置
    const config: MailConfig = {
      smtp: {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        }
      },
      imap: {
        host: process.env.IMAP_HOST || '',
        port: parseInt(process.env.IMAP_PORT || '993'),
        secure: process.env.IMAP_SECURE === 'true',
        auth: {
          user: process.env.IMAP_USER || '',
          pass: process.env.IMAP_PASS || '',
        }
      },
      defaults: {
        fromName: process.env.DEFAULT_FROM_NAME || '',
        fromEmail: process.env.DEFAULT_FROM_EMAIL || '',
      }
    };

    // 初始化邮件服务
    this.mailService = new MailService(config);

    // 初始化MCP服务器
    this.server = new McpServer({
      name: "mail-mcp",
      version: "1.0.0"
    });

    // 注册工具
    this.registerTools();

    // 连接到标准输入/输出
    const transport = new StdioServerTransport();
    this.server.connect(transport).catch(err => {
      console.error('连接MCP传输错误:', err);
    });
  }

  /**
   * 注册所有MCP工具
   */
  private registerTools(): void {
    // 邮件发送相关工具
    this.registerSendingTools();
    
    // 邮件接收和查询相关工具
    this.registerReceivingTools();
    
    // 邮件文件夹管理工具
    this.registerFolderTools();
    
    // 邮件标记工具
    this.registerFlagTools();
  }

  /**
   * 注册邮件发送相关工具
   */
  private registerSendingTools(): void {
    // 群发邮件工具
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
                { type: "text", text: `邮件内容不能为空，请提供text或html参数。` }
              ]
            };
          }
          
          console.log(`开始群发邮件，收件人数量: ${params.to.length}`);
          
          const results = [];
          let successCount = 0;
          let failureCount = 0;
          
          // 分批发送，每批最多10个收件人
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
              
              // 添加延迟，避免邮件服务器限制
              if (i + batchSize < params.to.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (error) {
              console.error(`发送批次 ${i / batchSize + 1} 时出错:`, error);
              failureCount += batch.length;
            }
          }
          
          return {
            content: [
              { 
                type: "text", 
                text: `群发邮件完成。\n成功: ${successCount}个收件人\n失败: ${failureCount}个收件人\n\n${
                  failureCount > 0 ? '部分邮件发送失败，可能是由于邮件服务器限制或收件人地址无效。' : ''
                }`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `群发邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );
    
    this.server.tool(
      "sendMail",
      {
        to: z.string().or(z.array(z.string())),
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
          // 检查内容是否提供
          if (!params.text && !params.html) {
            return {
              content: [
                { type: "text", text: `邮件内容不能为空，请提供text或html参数。` }
              ]
            };
          }
          
          // 如果指定使用HTML但没有提供HTML内容，自动转换
          if (params.useHtml && !params.html && params.text) {
            // 简单转换文本为HTML
            params.html = params.text
              .split('\n')
              .map(line => `<p>${line}</p>`)
              .join('');
          }
          
          // 处理收件人信息，确保to字段一定存在
          const to = typeof params.to === 'string' ? params.to : params.to;
          
          const mailInfo: MailInfo = {
            to: to,
            subject: params.subject,
            attachments: params.attachments
          };
          
          // 处理抄送和密送信息
          if (params.cc) {
            mailInfo.cc = typeof params.cc === 'string' ? params.cc : params.cc;
          }
          
          if (params.bcc) {
            mailInfo.bcc = typeof params.bcc === 'string' ? params.bcc : params.bcc;
          }
          
          // 设置邮件内容
          if (params.html || (params.useHtml && params.text)) {
            mailInfo.html = params.html || params.text?.split('\n').map(line => `<p>${line}</p>`).join('');
          } else {
            mailInfo.text = params.text;
          }
          
          const result = await this.mailService.sendMail(mailInfo);
          
          if (result.success) {
            return {
              content: [
                { type: "text", text: `邮件发送成功，消息ID: ${result.messageId}\n\n提示：如果需要等待对方回复，可以使用 waitForReply 工具。` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `邮件发送失败: ${result.error}` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `发送邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 发送简单邮件工具（保留原有实现）
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
                { type: "text", text: `简单邮件发送成功，消息ID: ${result.messageId}\n\n提示：如果需要等待对方回复，可以使用 waitForReply 工具。` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `简单邮件发送失败: ${result.error}` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `发送简单邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 添加专门的HTML邮件发送工具
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
                { type: "text", text: `HTML邮件发送成功，消息ID: ${result.messageId}\n\n提示：如果需要等待对方回复，可以使用 waitForReply 工具。` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `HTML邮件发送失败: ${result.error}` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `发送HTML邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );
  }

  /**
   * 注册邮件接收和查询相关工具
   */
  private registerReceivingTools(): void {
    // 等待新邮件回复
    // 此工具用于等待用户的邮件回复。可以多次调用此工具，建议在调用前先检查现有邮件列表。
    this.server.tool(
      "waitForReply",
      {
        folder: z.string().default('INBOX'),
        timeout: z.number().default(3 * 60 * 60 * 1000)
      },
      async ({ folder, timeout }) => {
        try {
          const result = await this.mailService.waitForNewReply(folder, timeout);
          
          // 如果是未读邮件警告
          if (result && typeof result === 'object' && 'type' in result && result.type === 'unread_warning') {
            let warningText = `⚠️ 检测到${result.mails.length}封最近5分钟内的未读邮件。\n`;
            warningText += `请先处理（阅读或回复）这些邮件，再继续等待新回复：\n\n`;
            
            result.mails.forEach((mail, index) => {
              const fromStr = mail.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
              warningText += `${index + 1}. 主题: ${mail.subject}\n`;
              warningText += `   发件人: ${fromStr}\n`;
              warningText += `   时间: ${mail.date.toLocaleString()}\n`;
              warningText += `   UID: ${mail.uid}\n\n`;
            });
            
            warningText += `提示：\n`;
            warningText += `1. 使用 markAsRead 工具将邮件标记为已读\n`;
            warningText += `2. 使用 getEmailDetail 工具查看邮件详情\n`;
            warningText += `3. 处理完这些邮件后，再次调用 waitForReply 工具等待新回复\n`;
            
            return {
              content: [
                { type: "text", text: warningText }
              ]
            };
          }
          
          // 如果超时
          if (!result) {
            return {
              content: [
                { type: "text", text: `等待邮件回复超时（${timeout / 1000}秒）` }
              ]
            };
          }

          // 收到新邮件
          const email = result as MailItem;  // 添加类型断言
          const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
          const date = email.date.toLocaleString();
          const status = email.isRead ? '已读' : '未读';
          const attachmentInfo = email.hasAttachments ? '📎' : '';
          
          let resultText = `收到新邮件！\n\n`;
          resultText += `[${status}] ${attachmentInfo} 来自: ${fromStr}\n`;
          resultText += `主题: ${email.subject}\n`;
          resultText += `时间: ${date}\n`;
          resultText += `UID: ${email.uid}\n\n`;
          
          if (email.textBody) {
            resultText += `内容:\n${email.textBody}\n\n`;
          }
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `等待邮件回复时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 高级邮件搜索 - 支持多文件夹和复杂条件
    this.server.tool(
      "searchEmails",
      {
        keywords: z.string().optional(),
        folders: z.array(z.string()).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        hasAttachment: z.boolean().optional(),
        maxResults: z.number().default(50),
        includeBody: z.boolean().default(false)
      },
      async (params) => {
        try {
          console.log(`开始执行高级邮件搜索，关键词: ${params.keywords || '无'}`);
          const emails = await this.mailService.advancedSearchMails({
            folders: params.folders,
            keywords: params.keywords,
            startDate: params.startDate,
            endDate: params.endDate,
            from: params.from,
            to: params.to,
            subject: params.subject,
            hasAttachment: params.hasAttachment,
            maxResults: params.maxResults,
            includeBody: params.includeBody
          });
          
          // 转换为人类可读格式
          if (emails.length === 0) {
            return {
              content: [
                { type: "text", text: `没有找到符合条件的邮件。` }
              ]
            };
          }
          
          const searchTerms = [];
          if (params.keywords) searchTerms.push(`关键词"${params.keywords}"`);
          if (params.from) searchTerms.push(`发件人包含"${params.from}"`);
          if (params.to) searchTerms.push(`收件人包含"${params.to}"`);
          if (params.subject) searchTerms.push(`主题包含"${params.subject}"`);
          if (params.startDate) searchTerms.push(`开始日期${params.startDate.toLocaleDateString()}`);
          if (params.endDate) searchTerms.push(`结束日期${params.endDate.toLocaleDateString()}`);
          if (params.hasAttachment) searchTerms.push(`包含附件`);
          
          const searchDescription = searchTerms.length > 0 
            ? `搜索条件: ${searchTerms.join(', ')}` 
            : '所有邮件';
          
          let resultText = `🔍 邮件搜索结果 (${emails.length}封邮件)\n${searchDescription}\n\n`;
          
          emails.forEach((email, index) => {
            const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
            const date = email.date.toLocaleString();
            const status = email.isRead ? '已读' : '未读';
            const attachmentInfo = email.hasAttachments ? '有' : '';
            const folder = email.folder;
            
            resultText += `${index + 1}. [${status}] ${attachmentInfo} 来自: ${fromStr}\n`;
            resultText += `   主题: ${email.subject}\n`;
            resultText += `   时间: ${date}\n`;
            resultText += `   文件夹: ${folder}\n`;
            resultText += `   UID: ${email.uid}\n\n`;
          });
          
          resultText += `使用 getEmailDetail 工具并提供 UID 和 folder 可以查看邮件详情。`;
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `搜索邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 获取收件箱邮件列表
    this.server.tool(
      "listEmails",
      {
        folder: z.string().default('INBOX'),
        limit: z.number().default(20),
        readStatus: z.enum(['read', 'unread', 'all']).default('all'),
        from: z.string().optional(),
        to: z.string().optional(),
        subject: z.string().optional(),
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
        hasAttachments: z.boolean().optional()
      },
      async (params) => {
        try {
          const options: MailSearchOptions = {
            folder: params.folder,
            limit: params.limit,
            readStatus: params.readStatus,
            from: params.from,
            to: params.to,
            subject: params.subject,
            fromDate: params.fromDate,
            toDate: params.toDate,
            hasAttachments: params.hasAttachments
          };

          const emails = await this.mailService.searchMails(options);
          
          // 转换为人类可读格式
          if (emails.length === 0) {
            return {
              content: [
                { type: "text", text: `在${params.folder}文件夹中没有找到符合条件的邮件。` }
              ]
            };
          }
          
          let resultText = `在${params.folder}文件夹中找到了${emails.length}封邮件：\n\n`;
          
          emails.forEach((email, index) => {
            const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
            const date = email.date.toLocaleString();
            const status = email.isRead ? '已读' : '未读';
            const attachmentInfo = email.hasAttachments ? '📎' : '';
            
            resultText += `${index + 1}. [${status}] ${attachmentInfo} 来自: ${fromStr}\n`;
            resultText += `   主题: ${email.subject}\n`;
            resultText += `   时间: ${date}\n`;
            resultText += `   UID: ${email.uid}\n\n`;
          });
          
          resultText += `使用 getEmailDetail 工具并提供 UID 可以查看邮件详情。`;
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `获取邮件列表时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 获取通讯录
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
          
          // 转换为人类可读格式
          if (contacts.length === 0) {
            const message = params.searchTerm 
              ? `没有找到包含"${params.searchTerm}"的联系人。` 
              : `没有找到任何联系人。`;
            
            return {
              content: [
                { type: "text", text: message }
              ]
            };
          }
          
          const header = params.searchTerm 
            ? `📋 搜索结果: 包含"${params.searchTerm}"的联系人 (${contacts.length}个):\n\n` 
            : `📋 联系人列表 (${contacts.length}个):\n\n`;
          
          let resultText = header;
          
          contacts.forEach((contact, index) => {
            const name = contact.name || '(无名称)';
            const frequency = contact.frequency;
            const lastContact = contact.lastContact ? contact.lastContact.toLocaleDateString() : '未知';
            
            resultText += `${index + 1}. ${name} <${contact.email}>\n`;
            resultText += `   邮件频率: ${frequency}次\n`;
            resultText += `   最后联系: ${lastContact}\n\n`;
          });
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `获取联系人时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 获取邮件详情
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
          // 对于QQ邮箱的特殊处理，先尝试获取邮件详情
          const numericUid = Number(uid);
          let email = await this.mailService.getMailDetail(numericUid, folder);
          
          // 如果正常获取失败，尝试通过搜索来获取指定UID的邮件
          if (!email) {
            console.log(`通过常规方法获取邮件详情失败，尝试使用搜索方法获取UID为${numericUid}的邮件`);
            const searchResults = await this.mailService.searchMails({ 
              folder: folder,
              limit: 50 // 搜索更多邮件以提高找到目标的可能性
            });
            
            // 从搜索结果中找到指定UID的邮件
            const foundEmail = searchResults.find(e => e.uid === numericUid);
            if (foundEmail) {
              console.log(`在搜索结果中找到了UID为${numericUid}的邮件`);
              email = foundEmail;
              
              // 尝试获取邮件正文（如果没有）
              if (!email.textBody && !email.htmlBody) {
                console.log(`邮件没有正文内容，尝试单独获取正文`);
                try {
                  // 这里可以添加额外的尝试获取正文的逻辑
                  // ...
                } catch (e) {
                  console.error('获取邮件正文时出错:', e);
                }
              }
            }
          }
          
          if (!email) {
            return {
              content: [
                { type: "text", text: `未找到UID为${numericUid}的邮件` }
              ]
            };
          }
          
          // 转换为人类可读格式
          const fromStr = email.from.map(f => f.name ? `${f.name} <${f.address}>` : f.address).join(', ');
          const toStr = email.to.map(t => t.name ? `${t.name} <${t.address}>` : t.address).join(', ');
          const ccStr = email.cc ? email.cc.map(c => c.name ? `${c.name} <${c.address}>` : c.address).join(', ') : '';
          const date = email.date.toLocaleString();
          const status = email.isRead ? '已读' : '未读';
          
          let resultText = `📧 邮件详情 (UID: ${email.uid})\n\n`;
          resultText += `主题: ${email.subject}\n`;
          resultText += `发件人: ${fromStr}\n`;
          resultText += `收件人: ${toStr}\n`;
          if (ccStr) resultText += `抄送: ${ccStr}\n`;
          resultText += `日期: ${date}\n`;
          resultText += `状态: ${status}\n`;
          resultText += `文件夹: ${email.folder}\n`;
          
          if (email.hasAttachments && email.attachments && email.attachments.length > 0) {
            resultText += `\n📎 附件 (${email.attachments.length}个):\n`;
            email.attachments.forEach((att, index) => {
              const sizeInKB = Math.round(att.size / 1024);
              resultText += `${index + 1}. ${att.filename} (${sizeInKB} KB, ${att.contentType})\n`;
            });
          }
          
          // 获取邮件内容
          let content = '';
          if (email.textBody) {
            content = email.textBody;
          } else if (email.htmlBody) {
            // 简单的HTML转文本处理
            content = '(HTML内容，显示纯文本版本)\n\n' + 
              email.htmlBody
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<[^>]*>/g, '');
          } else {
            content = '(邮件没有文本内容或内容无法获取)\n\n' +
              '可能原因：\n' +
              '1. QQ邮箱IMAP访问限制\n' +
              '2. 邮件内容格式特殊\n' +
              '建议直接在QQ邮箱网页或客户端查看完整内容';
          }
          
          // 计算内容总长度
          const totalLength = content.length;
          
          // 设置默认范围
          const start = contentRange?.start || 0;
          const end = Math.min(contentRange?.end || 2000, totalLength);
          
          // 根据范围截取内容
          const selectedContent = content.substring(start, end);
          
          resultText += `\n📄 内容 (${start+1}-${end}/${totalLength}字符):\n\n`;
          resultText += selectedContent;
          
          // 如果有更多内容，添加提示
          if (end < totalLength) {
            resultText += `\n\n[...]\n\n(内容过长，仅显示前${end}个字符。使用contentRange参数可查看更多内容，例如查看${end+1}-${Math.min(end+2000, totalLength)}范围：contentRange.start=${end}, contentRange.end=${Math.min(end+2000, totalLength)})`;
          }
          
          return {
            content: [
              { type: "text", text: resultText }
            ]
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `获取邮件详情时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 删除邮件
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
                { type: "text", text: `邮件(UID: ${numericUid})已从${folder}文件夹中删除` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `删除邮件(UID: ${numericUid})失败` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `删除邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 移动邮件到其他文件夹
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
                { type: "text", text: `邮件(UID: ${numericUid})已成功从"${sourceFolder}"移动到"${targetFolder}"文件夹` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `移动邮件(UID: ${numericUid})失败` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `移动邮件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 添加获取附件工具
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
                { type: "text", text: `未找到UID为${params.uid}的邮件的第${params.attachmentIndex}个附件` }
              ]
            };
          }
          
          // 根据是否保存到文件处理附件
          if (params.saveToFile) {
            // 创建附件保存目录
            const downloadDir = path.join(process.cwd(), 'downloads');
            if (!fs.existsSync(downloadDir)) {
              fs.mkdirSync(downloadDir, { recursive: true });
            }
            
            // 生成安全的文件名（去除非法字符）
            const safeFilename = attachment.filename.replace(/[/\\?%*:|"<>]/g, '-');
            const filePath = path.join(downloadDir, safeFilename);
            
            // 写入文件
            fs.writeFileSync(filePath, attachment.content);
            
            return {
              content: [
                { 
                  type: "text", 
                  text: `附件 "${attachment.filename}" 已下载保存至 ${filePath}\n类型: ${attachment.contentType}\n大小: ${Math.round(attachment.content.length / 1024)} KB` 
                }
              ]
            };
          } else {
            // 根据内容类型处理内容
            if (attachment.contentType.startsWith('text/') || 
                attachment.contentType === 'application/json') {
              // 文本文件显示内容
              const textContent = attachment.content.toString('utf-8');
              return {
                content: [
                  { 
                    type: "text", 
                    text: `📎 附件 "${attachment.filename}" (${attachment.contentType})\n\n${textContent.substring(0, 10000)}${textContent.length > 10000 ? '\n\n[内容过长，已截断]' : ''}` 
                  }
                ]
              };
            } else if (attachment.contentType.startsWith('image/')) {
              // 图片文件提供Base64编码
              const base64Content = attachment.content.toString('base64');
              return {
                content: [
                  { 
                    type: "text", 
                    text: `📎 图片附件 "${attachment.filename}" (${attachment.contentType})\n大小: ${Math.round(attachment.content.length / 1024)} KB\n\n[图片内容已转为Base64编码，可用于在线预览]` 
                  }
                ]
              };
            } else {
              // 其他二进制文件
              return {
                content: [
                  { 
                    type: "text", 
                    text: `📎 二进制附件 "${attachment.filename}" (${attachment.contentType})\n大小: ${Math.round(attachment.content.length / 1024)} KB\n\n[二进制内容无法直接显示]` 
                  }
                ]
              };
            }
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `获取附件时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );
  }

  /**
   * 注册文件夹管理工具
   */
  private registerFolderTools(): void {
    // 获取所有邮件文件夹
    this.server.tool(
      "listFolders",
      { random_string: z.string().optional() },
      async () => {
        try {
          const folders = await this.mailService.getFolders();
          
          if (folders.length === 0) {
            return {
              content: [
                { type: "text", text: "没有找到邮件文件夹。" }
              ]
            };
          }
          
          let resultText = `📁 邮件文件夹列表 (${folders.length}个):\n\n`;
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
              { type: "text", text: `获取邮件文件夹列表时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );
  }

  /**
   * 注册邮件标记工具
   */
  private registerFlagTools(): void {
    // 批量将邮件标记为已读
    this.server.tool(
      "markMultipleAsRead",
      {
        uids: z.array(z.number()),
        folder: z.string().default('INBOX')
      },
      async ({ uids, folder }) => {
        try {
          const numericUids = uids.map(uid => Number(uid));
          const success = await this.mailService.markMultipleAsRead(numericUids, folder);
          
          if (success) {
            return {
              content: [
                { type: "text", text: `已将 ${uids.length} 封邮件标记为已读` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `批量标记邮件为已读失败` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `批量标记邮件为已读时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 批量将邮件标记为未读
    this.server.tool(
      "markMultipleAsUnread",
      {
        uids: z.array(z.number()),
        folder: z.string().default('INBOX')
      },
      async ({ uids, folder }) => {
        try {
          const numericUids = uids.map(uid => Number(uid));
          const success = await this.mailService.markMultipleAsUnread(numericUids, folder);
          
          if (success) {
            return {
              content: [
                { type: "text", text: `已将 ${uids.length} 封邮件标记为未读` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `批量标记邮件为未读失败` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `批量标记邮件为未读时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 将邮件标记为已读
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
                { type: "text", text: `邮件(UID: ${uid})已标记为已读` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `标记邮件(UID: ${uid})为已读失败` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `标记邮件为已读时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );

    // 将邮件标记为未读
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
                { type: "text", text: `邮件(UID: ${uid})已标记为未读` }
              ]
            };
          } else {
            return {
              content: [
                { type: "text", text: `标记邮件(UID: ${uid})为未读失败` }
              ]
            };
          }
        } catch (error) {
          return {
            content: [
              { type: "text", text: `标记邮件为未读时发生错误: ${error instanceof Error ? error.message : String(error)}` }
            ]
          };
        }
      }
    );
  }

  /**
   * 关闭所有连接
   */
  async close(): Promise<void> {
    await this.mailService.close();
  }
} 