import nodemailer from 'nodemailer';
import IMAP from 'imap';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { Readable } from 'stream';
import { promisify } from 'util';

// 邮件配置接口
export interface MailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    }
  },
  imap: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    }
  },
  defaults: {
    fromName: string;
    fromEmail: string;
  }
}

// 邮件信息接口
export interface MailInfo {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

// 邮件查询选项
export interface MailSearchOptions {
  folder?: string;
  readStatus?: 'read' | 'unread' | 'all';
  fromDate?: Date;
  toDate?: Date;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachments?: boolean;
  limit?: number;
}

// 邮件项
export interface MailItem {
  id: string;
  uid: number;
  subject: string;
  from: { name?: string; address: string }[];
  to: { name?: string; address: string }[];
  cc?: { name?: string; address: string }[];
  date: Date;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: { filename: string; contentType: string; size: number }[];
  textBody?: string;
  htmlBody?: string;
  flags?: string[];
  size: number;
  folder: string;
}

// 地址信息接口
interface EmailAddress {
  name?: string;
  address: string;
}

export class MailService {
  private smtpTransporter: nodemailer.Transporter;
  private imapClient: IMAP;
  private config: MailConfig;
  private isImapConnected = false;

  constructor(config: MailConfig) {
    this.config = config;

    // 创建SMTP传输器
    this.smtpTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.auth.user,
        pass: config.smtp.auth.pass,
      },
    });

    // 创建IMAP客户端
    this.imapClient = new IMAP({
      user: config.imap.auth.user,
      password: config.imap.auth.pass,
      host: config.imap.host,
      port: config.imap.port,
      tls: config.imap.secure,
      tlsOptions: { rejectUnauthorized: false },
    });

    // 监听IMAP连接错误
    this.imapClient.on('error', (err: Error) => {
      console.error('IMAP错误:', err);
      this.isImapConnected = false;
    });
  }

  /**
   * 连接到IMAP服务器
   */
  async connectImap(): Promise<void> {
    if (this.isImapConnected) return;
    
    return new Promise((resolve, reject) => {
      this.imapClient.once('ready', () => {
        this.isImapConnected = true;
        resolve();
      });

      this.imapClient.once('error', (err: Error) => {
        reject(err);
      });

      this.imapClient.connect();
    });
  }

  /**
   * 关闭IMAP连接
   */
  closeImap(): void {
    if (this.isImapConnected) {
      this.imapClient.end();
      this.isImapConnected = false;
    }
  }

  /**
   * 发送邮件
   */
  async sendMail(mailInfo: MailInfo): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const mailOptions = {
        from: {
          name: this.config.defaults.fromName,
          address: this.config.defaults.fromEmail,
        },
        to: mailInfo.to,
        cc: mailInfo.cc,
        bcc: mailInfo.bcc,
        subject: mailInfo.subject,
        text: mailInfo.text,
        html: mailInfo.html,
        attachments: mailInfo.attachments,
      };

      const info = await this.smtpTransporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('发送邮件错误:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 获取邮箱文件夹列表
   */
  async getFolders(): Promise<string[]> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.getBoxes((err, boxes) => {
        if (err) {
          reject(err);
          return;
        }

        const folderNames: string[] = [];
        
        // 递归遍历所有邮件文件夹
        const processBoxes = (boxes: IMAP.MailBoxes, prefix = '') => {
          for (const name in boxes) {
            folderNames.push(prefix + name);
            if (boxes[name].children) {
              processBoxes(boxes[name].children, `${prefix}${name}${boxes[name].delimiter}`);
            }
          }
        };

        processBoxes(boxes);
        resolve(folderNames);
      });
    });
  }

  /**
   * 搜索邮件
   */
  async searchMails(options: MailSearchOptions = {}): Promise<MailItem[]> {
    await this.connectImap();

    const folder = options.folder || 'INBOX';
    const limit = options.limit || 20;

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        // 构建搜索条件
        const criteria: any[] = [];

        if (options.readStatus === 'read') {
          criteria.push('SEEN');
        } else if (options.readStatus === 'unread') {
          criteria.push('UNSEEN');
        }

        if (options.fromDate) {
          criteria.push(['SINCE', options.fromDate]);
        }

        if (options.toDate) {
          criteria.push(['BEFORE', options.toDate]);
        }

        if (options.from) {
          criteria.push(['FROM', options.from]);
        }

        if (options.to) {
          criteria.push(['TO', options.to]);
        }

        if (options.subject) {
          criteria.push(['SUBJECT', options.subject]);
        }

        if (criteria.length === 0) {
          criteria.push('ALL');
        }

        // 执行搜索
        this.imapClient.search(criteria, (err, uids) => {
          if (err) {
            reject(err);
            return;
          }

          if (uids.length === 0) {
            resolve([]);
            return;
          }

          // 限制结果数量
          const limitedUids = uids.slice(-Math.min(limit, uids.length));

          // 获取邮件详情
          const fetch = this.imapClient.fetch(limitedUids, {
            bodies: ['HEADER', 'TEXT'],
            struct: true,
            envelope: true,
            size: true,
            markSeen: false,
          });

          const messages: MailItem[] = [];

          fetch.on('message', (msg, seqno) => {
            const message: Partial<MailItem> = {
              id: '',
              uid: 0,
              folder,
              flags: [],
              subject: '',
              from: [],
              to: [],
              date: new Date(),
              isRead: false,
              hasAttachments: false,
              size: 0,
            };

            msg.on('body', (stream, info) => {
              let buffer = '';
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });

              stream.once('end', () => {
                if (info.which === 'HEADER') {
                  const parsed = IMAP.parseHeader(buffer);
                  
                  message.subject = parsed.subject?.[0] || '';
                  message.from = this.parseAddressList(parsed.from);
                  message.to = this.parseAddressList(parsed.to);
                  message.cc = this.parseAddressList(parsed.cc);
                  
                  if (parsed.date && parsed.date[0]) {
                    message.date = new Date(parsed.date[0]);
                  }
                } else if (info.which === 'TEXT') {
                  const readable = new Readable();
                  readable.push(buffer);
                  readable.push(null);
                  
                  simpleParser(readable).then((parsed) => {
                    message.textBody = parsed.text || undefined;
                    message.htmlBody = parsed.html || undefined;
                    message.attachments = parsed.attachments.map(att => ({
                      filename: att.filename || 'unknown',
                      contentType: att.contentType,
                      size: att.size,
                    }));
                    message.hasAttachments = parsed.attachments.length > 0;
                  }).catch(err => {
                    console.error('解析邮件内容错误:', err);
                  });
                }
              });
            });

            msg.once('attributes', (attrs) => {
              message.uid = attrs.uid;
              message.id = attrs.uid.toString();
              message.flags = attrs.flags;
              message.isRead = attrs.flags.includes('\\Seen');
              message.size = attrs.size || 0;
              
              // 检查是否有附件
              if (attrs.struct) {
                message.hasAttachments = this.checkHasAttachments(attrs.struct);
              }
            });

            msg.once('end', () => {
              messages.push(message as MailItem);
            });
          });

          fetch.once('error', (err) => {
            reject(err);
          });

          fetch.once('end', () => {
            resolve(messages);
          });
        });
      });
    });
  }

  /**
   * 获取邮件详情
   */
  async getMailDetail(uid: number, folder: string = 'INBOX'): Promise<MailItem | null> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const fetch = this.imapClient.fetch([uid], {
          bodies: '',
          struct: true,
          markSeen: false,
        });

        let mailItem: MailItem | null = null;
        let attributes: any = null;
        let bodyParsed = false;
        let endReceived = false;

        // 检查是否所有处理都已完成并可以返回结果
        const checkAndResolve = () => {
          if (bodyParsed && endReceived) {
            // 如果有属性数据但mailItem还没设置上，则现在设置
            if (attributes && mailItem) {
              mailItem.flags = attributes.flags;
              mailItem.isRead = attributes.flags.includes('\\Seen');
              mailItem.size = attributes.size || 0;
            }
            resolve(mailItem);
          }
        };

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            // 创建一个可读流缓冲区
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });

            stream.once('end', () => {
              // 使用simpleParser解析邮件内容
              const readable = new Readable();
              readable.push(buffer);
              readable.push(null);

              simpleParser(readable).then((parsed: ParsedMail) => {
                // 处理发件人信息
                const from: EmailAddress[] = [];
                if (parsed.from && 'value' in parsed.from) {
                  from.push(...(parsed.from.value.map(addr => ({
                    name: addr.name || undefined,
                    address: addr.address || '',
                  }))));
                }

                // 处理收件人信息
                const to: EmailAddress[] = [];
                if (parsed.to && 'value' in parsed.to) {
                  to.push(...(parsed.to.value.map(addr => ({
                    name: addr.name || undefined,
                    address: addr.address || '',
                  }))));
                }

                // 处理抄送人信息
                const cc: EmailAddress[] = [];
                if (parsed.cc && 'value' in parsed.cc) {
                  cc.push(...(parsed.cc.value.map(addr => ({
                    name: addr.name || undefined,
                    address: addr.address || '',
                  }))));
                }

                mailItem = {
                  id: uid.toString(),
                  uid,
                  subject: parsed.subject || '',
                  from,
                  to,
                  cc: cc.length > 0 ? cc : undefined,
                  date: parsed.date || new Date(),
                  isRead: false, // 将通过attributes更新
                  hasAttachments: parsed.attachments.length > 0,
                  attachments: parsed.attachments.map(att => ({
                    filename: att.filename || 'unknown',
                    contentType: att.contentType,
                    size: att.size,
                  })),
                  textBody: parsed.text || undefined,
                  htmlBody: parsed.html || undefined,
                  size: 0, // 将通过attributes更新
                  folder,
                };

                // 如果已经接收到属性，现在应用它们
                if (attributes) {
                  mailItem.flags = attributes.flags;
                  mailItem.isRead = attributes.flags.includes('\\Seen');
                  mailItem.size = attributes.size || 0;
                }

                bodyParsed = true;
                checkAndResolve();
              }).catch(err => {
                console.error('解析邮件详情错误:', err);
                reject(err);
              });
            });
          });

          msg.once('attributes', (attrs) => {
            attributes = attrs;
            if (mailItem) {
              mailItem.flags = attrs.flags;
              mailItem.isRead = attrs.flags.includes('\\Seen');
              mailItem.size = attrs.size || 0;
            }
          });
        });

        fetch.once('error', (err) => {
          reject(err);
        });

        fetch.once('end', () => {
          endReceived = true;
          // 如果邮件没有内容，或者处理过程中出现问题，尝试确保至少返回空结果
          if (!bodyParsed && !mailItem) {
            console.log(`没有找到UID为${uid}的邮件或邮件内容为空`);
          }
          checkAndResolve();
        });
      });
    });
  }

  /**
   * 将邮件标记为已读
   */
  async markAsRead(uid: number, folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.addFlags(uid, '\\Seen', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      });
    });
  }

  /**
   * 将邮件标记为未读
   */
  async markAsUnread(uid: number, folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.delFlags(uid, '\\Seen', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      });
    });
  }

  /**
   * 删除邮件
   */
  async deleteMail(uid: number, folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.addFlags(uid, '\\Deleted', (err) => {
          if (err) {
            reject(err);
            return;
          }

          this.imapClient.expunge((err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(true);
          });
        });
      });
    });
  }

  /**
   * 移动邮件到其他文件夹
   */
  async moveMail(uid: number, sourceFolder: string, targetFolder: string): Promise<boolean> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(sourceFolder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.move(uid, targetFolder, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      });
    });
  }

  /**
   * 关闭所有连接
   */
  async close(): Promise<void> {
    this.closeImap();
    await promisify(this.smtpTransporter.close.bind(this.smtpTransporter))();
  }

  // 辅助方法：解析地址列表
  private parseAddressList(addresses?: string[]): EmailAddress[] {
    if (!addresses || addresses.length === 0) return [];
    
    return addresses.map(addr => {
      const match = addr.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
      if (match) {
        const [, name, address] = match;
        return { name: name || undefined, address: address || '' };
      }
      return { address: addr };
    });
  }

  // 辅助方法：检查是否有附件
  private checkHasAttachments(struct: any[]): boolean {
    if (!struct || !Array.isArray(struct)) return false;
    
    if (struct[0] && struct[0].disposition && struct[0].disposition.type.toLowerCase() === 'attachment') {
      return true;
    }
    
    for (const item of struct) {
      if (Array.isArray(item)) {
        if (this.checkHasAttachments(item)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 高级搜索邮件 - 支持多个文件夹和更复杂的过滤条件
   */
  async advancedSearchMails(options: {
    folders?: string[];        // 要搜索的文件夹列表，默认为INBOX
    keywords?: string;         // 全文搜索关键词
    startDate?: Date;          // 开始日期
    endDate?: Date;            // 结束日期
    from?: string;             // 发件人
    to?: string;               // 收件人
    subject?: string;          // 主题
    hasAttachment?: boolean;   // 是否有附件
    maxResults?: number;       // 最大结果数
    includeBody?: boolean;     // 是否包含邮件正文
  }): Promise<MailItem[]> {
    const allResults: MailItem[] = [];
    const folders = options.folders || ['INBOX'];
    const maxResults = options.maxResults || 100;
    
    console.log(`执行高级搜索，文件夹: ${folders.join(', ')}, 关键词: ${options.keywords || '无'}`);
    
    // 对每个文件夹执行搜索
    for (const folder of folders) {
      if (allResults.length >= maxResults) break;
      
      try {
        const folderResults = await this.searchMails({
          folder,
          readStatus: 'all',
          fromDate: options.startDate,
          toDate: options.endDate,
          from: options.from,
          to: options.to,
          subject: options.subject,
          hasAttachments: options.hasAttachment,
          limit: maxResults - allResults.length
        });
        
        // 如果包含关键词，执行全文匹配
        if (options.keywords && options.keywords.trim() !== '') {
          const keywordLower = options.keywords.toLowerCase();
          const filteredResults = folderResults.filter(mail => {
            // 在主题、发件人、收件人中搜索
            const subjectMatch = mail.subject.toLowerCase().includes(keywordLower);
            const fromMatch = mail.from.some(f => 
              (f.name?.toLowerCase() || '').includes(keywordLower) || 
              f.address.toLowerCase().includes(keywordLower)
            );
            const toMatch = mail.to.some(t => 
              (t.name?.toLowerCase() || '').includes(keywordLower) || 
              t.address.toLowerCase().includes(keywordLower)
            );
            
            // 如果需要在正文中搜索，可能需要额外获取邮件详情
            let bodyMatch = false;
            if (options.includeBody) {
              bodyMatch = (mail.textBody?.toLowerCase() || '').includes(keywordLower) ||
                         (mail.htmlBody?.toLowerCase() || '').includes(keywordLower);
            }
            
            return subjectMatch || fromMatch || toMatch || bodyMatch;
          });
          
          allResults.push(...filteredResults);
        } else {
          allResults.push(...folderResults);
        }
      } catch (error) {
        console.error(`搜索文件夹 ${folder} 时出错:`, error);
        // 继续搜索其他文件夹
      }
    }
    
    // 按日期降序排序（最新的邮件优先）
    allResults.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // 限制结果数量
    return allResults.slice(0, maxResults);
  }
  
  /**
   * 获取通讯录 - 基于邮件历史提取联系人信息
   */
  async getContacts(options: {
    maxResults?: number;   // 最大结果数
    includeGroups?: boolean; // 是否包含分组
    searchTerm?: string;   // 搜索词
  } = {}): Promise<{
    contacts: {
      name?: string;
      email: string;
      frequency: number;   // 联系频率
      lastContact?: Date;  // 最后联系时间
    }[];
  }> {
    const maxResults = options.maxResults || 100;
    const searchTerm = options.searchTerm?.toLowerCase() || '';
    
    // 从最近的邮件中提取联系人
    const contactMap = new Map<string, {
      name?: string;
      email: string;
      frequency: number;
      lastContact?: Date;
    }>();
    
    // 从收件箱和已发送邮件中收集联系人
    const folders = ['INBOX', 'Sent Messages'];
    
    for (const folder of folders) {
      try {
        const emails = await this.searchMails({
          folder,
          limit: 200, // 搜索足够多的邮件以收集联系人
        });
        
        emails.forEach(email => {
          // 处理收件箱中的发件人
          if (folder === 'INBOX') {
            email.from.forEach(sender => {
              if (sender.address === this.config.defaults.fromEmail) return; // 跳过自己
              
              const key = sender.address.toLowerCase();
              if (!contactMap.has(key)) {
                contactMap.set(key, {
                  name: sender.name,
                  email: sender.address,
                  frequency: 1,
                  lastContact: email.date
                });
              } else {
                const contact = contactMap.get(key)!;
                contact.frequency += 1;
                if (!contact.lastContact || email.date > contact.lastContact) {
                  contact.lastContact = email.date;
                }
              }
            });
          }
          
          // 处理已发送邮件中的收件人
          if (folder === 'Sent Messages') {
            email.to.forEach(recipient => {
              if (recipient.address === this.config.defaults.fromEmail) return; // 跳过自己
              
              const key = recipient.address.toLowerCase();
              if (!contactMap.has(key)) {
                contactMap.set(key, {
                  name: recipient.name,
                  email: recipient.address,
                  frequency: 1,
                  lastContact: email.date
                });
              } else {
                const contact = contactMap.get(key)!;
                contact.frequency += 1;
                if (!contact.lastContact || email.date > contact.lastContact) {
                  contact.lastContact = email.date;
                }
              }
            });
            
            // 如果有抄送人，也处理
            if (email.cc) {
              email.cc.forEach(cc => {
                if (cc.address === this.config.defaults.fromEmail) return; // 跳过自己
                
                const key = cc.address.toLowerCase();
                if (!contactMap.has(key)) {
                  contactMap.set(key, {
                    name: cc.name,
                    email: cc.address,
                    frequency: 1,
                    lastContact: email.date
                  });
                } else {
                  const contact = contactMap.get(key)!;
                  contact.frequency += 1;
                  if (!contact.lastContact || email.date > contact.lastContact) {
                    contact.lastContact = email.date;
                  }
                }
              });
            }
          }
        });
      } catch (error) {
        console.error(`从文件夹 ${folder} 收集联系人时出错:`, error);
        // 继续处理其他文件夹
      }
    }
    
    // 转换为数组并排序（频率优先）
    let contacts = Array.from(contactMap.values());
    
    // 如果提供了搜索词，进行过滤
    if (searchTerm) {
      contacts = contacts.filter(contact => 
        (contact.name?.toLowerCase() || '').includes(searchTerm) ||
        contact.email.toLowerCase().includes(searchTerm)
      );
    }
    
    // 按联系频率排序
    contacts.sort((a, b) => b.frequency - a.frequency);
    
    // 限制结果数
    contacts = contacts.slice(0, maxResults);
    
    return { contacts };
  }

  /**
   * 获取邮件附件
   * @param uid 邮件UID
   * @param folder 文件夹名称
   * @param attachmentIndex 附件索引
   * @returns 附件数据，包括文件名、内容和内容类型
   */
  async getAttachment(uid: number, folder: string = 'INBOX', attachmentIndex: number): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    await this.connectImap();
    console.log(`正在获取UID ${uid} 的第 ${attachmentIndex} 个附件...`);

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, true, (err) => {
        if (err) {
          console.error(`打开文件夹 ${folder} 失败:`, err);
          reject(err);
          return;
        }

        const f = this.imapClient.fetch(`${uid}`, { bodies: '', struct: true });
        
        let attachmentInfo: { partID: string; filename: string; contentType: string } | null = null;
        
        f.on('message', (msg, seqno) => {
          msg.on('body', (stream, info) => {
            // 这个事件处理器只是为了确保消息体被处理
            stream.on('data', () => {});
            stream.on('end', () => {});
          });

          msg.once('attributes', (attrs) => {
            try {
              const struct = attrs.struct;
              const attachments = this.findAttachmentParts(struct);
              
              if (attachments.length <= attachmentIndex) {
                console.log(`附件索引 ${attachmentIndex} 超出范围，附件总数: ${attachments.length}`);
                resolve(null);
                return;
              }
              
              attachmentInfo = attachments[attachmentIndex];
              console.log(`找到附件信息:`, attachmentInfo);
            } catch (error) {
              console.error(`解析附件结构时出错:`, error);
              reject(error);
            }
          });
          
          msg.once('end', () => {
            if (!attachmentInfo) {
              console.log(`未找到附件或附件索引无效`);
              resolve(null);
              return;
            }
            
            // 获取附件内容
            const attachmentFetch = this.imapClient.fetch(`${uid}`, { 
              bodies: [attachmentInfo.partID],
              struct: true 
            });
            
            let buffer = Buffer.alloc(0);
            
            attachmentFetch.on('message', (msg, seqno) => {
              msg.on('body', (stream, info) => {
                stream.on('data', (chunk) => {
                  buffer = Buffer.concat([buffer, chunk]);
                });
                
                stream.once('end', () => {
                  console.log(`附件内容下载完成，大小: ${buffer.length} 字节`);
                });
              });
              
              msg.once('end', () => {
                console.log(`附件消息处理完成`);
              });
            });
            
            attachmentFetch.once('error', (err) => {
              console.error(`获取附件内容时出错:`, err);
              reject(err);
            });
            
            attachmentFetch.once('end', () => {
              console.log(`附件获取流程结束`);
              resolve({
                filename: attachmentInfo!.filename,
                content: buffer,
                contentType: attachmentInfo!.contentType
              });
            });
          });
        });
        
        f.once('error', (err) => {
          console.error(`获取邮件时出错:`, err);
          reject(err);
        });
        
        f.once('end', () => {
          if (!attachmentInfo) {
            console.log(`未找到附件或结构中没有附件`);
            resolve(null);
          }
        });
      });
    });
  }

  /**
   * 辅助方法：查找邮件结构中的所有附件
   */
  private findAttachmentParts(struct: any[], prefix = ''): { partID: string; filename: string; contentType: string }[] {
    const attachments: { partID: string; filename: string; contentType: string }[] = [];
    
    if (!struct || !Array.isArray(struct)) return attachments;
    
    const processStruct = (s: any, partID = '') => {
      if (Array.isArray(s)) {
        // 多部分结构
        if (s[0] && typeof s[0] === 'object' && s[0].partID) {
          // 这是一个具体的部分
          if (s[0].disposition && 
              (s[0].disposition.type.toLowerCase() === 'attachment' || 
               s[0].disposition.type.toLowerCase() === 'inline')) {
            let filename = '';
            if (s[0].disposition.params && s[0].disposition.params.filename) {
              filename = s[0].disposition.params.filename;
            } else if (s[0].params && s[0].params.name) {
              filename = s[0].params.name;
            }
            
            const contentType = s[0].type + '/' + s[0].subtype;
            
            if (filename) {
              attachments.push({
                partID: s[0].partID,
                filename: filename,
                contentType: contentType
              });
            }
          }
        } else {
          // 遍历数组中的每个元素
          for (let i = 0; i < s.length; i++) {
            const newPrefix = partID ? `${partID}.${i + 1}` : `${i + 1}`;
            if (Array.isArray(s[i])) {
              processStruct(s[i], newPrefix);
            } else if (typeof s[i] === 'object') {
              // 可能是一个部分定义
              if (s[i].disposition && 
                  (s[i].disposition.type.toLowerCase() === 'attachment' || 
                   s[i].disposition.type.toLowerCase() === 'inline')) {
                let filename = '';
                if (s[i].disposition.params && s[i].disposition.params.filename) {
                  filename = s[i].disposition.params.filename;
                } else if (s[i].params && s[i].params.name) {
                  filename = s[i].params.name;
                }
                
                const contentType = s[i].type + '/' + s[i].subtype;
                
                if (filename) {
                  attachments.push({
                    partID: newPrefix,
                    filename: filename,
                    contentType: contentType
                  });
                }
              }
            }
          }
        }
      }
    };
    
    processStruct(struct, prefix);
    return attachments;
  }

  /**
   * 批量将邮件标记为已读
   */
  async markMultipleAsRead(uids: number[], folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.addFlags(uids, '\\Seen', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      });
    });
  }

  /**
   * 批量将邮件标记为未读
   */
  async markMultipleAsUnread(uids: number[], folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.delFlags(uids, '\\Seen', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      });
    });
  }
} 