import nodemailer from 'nodemailer';
import IMAP from 'imap';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { Readable } from 'stream';
import { promisify } from 'util';

// Mail configuration interface
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

// Mail information interface
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

// Mail search options
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

// Mail item
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

// Email address interface
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

    // Create SMTP transporter
    this.smtpTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.auth.user,
        pass: config.smtp.auth.pass,
      },
    });

    // Create IMAP client
    this.imapClient = new IMAP({
      user: config.imap.auth.user,
      password: config.imap.auth.pass,
      host: config.imap.host,
      port: config.imap.port,
      tls: config.imap.secure,
      tlsOptions: { rejectUnauthorized: false },
    });

    // Listen for IMAP connection errors
    this.imapClient.on('error', (err: Error) => {
      console.error('IMAP error:', err);
      this.isImapConnected = false;
    });
  }

  /**
   * Connect to IMAP server
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
   * Close IMAP connection
   */
  closeImap(): void {
    if (this.isImapConnected) {
      this.imapClient.end();
      this.isImapConnected = false;
    }
  }

  /**
   * Send mail
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
      console.error('Send mail error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get mailbox folder list
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
        
        // Recursively traverse all mail folders
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
   * Search mails
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

        // Build search criteria
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

        // Execute search
        this.imapClient.search(criteria, (err, uids) => {
          if (err) {
            reject(err);
            return;
          }

          if (uids.length === 0) {
            resolve([]);
            return;
          }

          // Limit result count
          const limitedUids = uids.slice(-Math.min(limit, uids.length));

          // Get mail details
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
                    console.error('Parse mail content error:', err);
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
              
              // Check if there are attachments
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
   * Get mail details
   */
  async getMailDetail(uid: number | string, folder: string = 'INBOX'): Promise<MailItem | null> {
    await this.connectImap();

    // Ensure uid is numeric type
    const numericUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        const fetch = this.imapClient.fetch([numericUid], {
          bodies: '',
          struct: true,
          markSeen: false,
        });

        let mailItem: MailItem | null = null;
        let attributes: any = null;
        let bodyParsed = false;
        let endReceived = false;

        // Check if all processing is completed and can return result
        const checkAndResolve = () => {
          if (bodyParsed && endReceived) {
            // If there is attribute data but mailItem hasn't been set yet, set it now
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
            // Create a readable stream buffer
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });

            stream.once('end', () => {
              // Use simpleParser to parse mail content
              const readable = new Readable();
              readable.push(buffer);
              readable.push(null);

              simpleParser(readable).then((parsed: ParsedMail) => {
                // Process sender information
                const from: EmailAddress[] = [];
                if (parsed.from && 'value' in parsed.from) {
                  from.push(...(parsed.from.value.map(addr => ({
                    name: addr.name || undefined,
                    address: addr.address || '',
                  }))));
                }

                // Process recipient information
                const to: EmailAddress[] = [];
                if (parsed.to && 'value' in parsed.to) {
                  to.push(...(parsed.to.value.map(addr => ({
                    name: addr.name || undefined,
                    address: addr.address || '',
                  }))));
                }

                // Process CC information
                const cc: EmailAddress[] = [];
                if (parsed.cc && 'value' in parsed.cc) {
                  cc.push(...(parsed.cc.value.map(addr => ({
                    name: addr.name || undefined,
                    address: addr.address || '',
                  }))));
                }

                mailItem = {
                  id: numericUid.toString(),
                  uid: numericUid,
                  subject: parsed.subject || '',
                  from,
                  to,
                  cc: cc.length > 0 ? cc : undefined,
                  date: parsed.date || new Date(),
                  isRead: false, // Will be updated via attributes
                  hasAttachments: parsed.attachments.length > 0,
                  attachments: parsed.attachments.map(att => ({
                    filename: att.filename || 'unknown',
                    contentType: att.contentType,
                    size: att.size,
                  })),
                  textBody: parsed.text || undefined,
                  htmlBody: parsed.html || undefined,
                  size: 0, // Will be updated via attributes
                  folder,
                };

                // If attributes have been received, apply them now
                if (attributes) {
                  mailItem.flags = attributes.flags;
                  mailItem.isRead = attributes.flags.includes('\\Seen');
                  mailItem.size = attributes.size || 0;
                }

                bodyParsed = true;
                checkAndResolve();
              }).catch(err => {
                console.error('Parse mail details error:', err);
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
          // If mail has no content, or if there are issues during processing, try to ensure at least an empty result is returned
          if (!bodyParsed && !mailItem) {
            console.log(`No mail found with UID ${numericUid} or mail content is empty`);
          }
          checkAndResolve();
        });
      });
    });
  }

  /**
   * Mark mail as read
   */
  async markAsRead(uid: number | string, folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();
    
    // Ensure uid is numeric type
    const numericUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.addFlags(numericUid, '\\Seen', (err) => {
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
   * Mark mail as unread
   */
  async markAsUnread(uid: number | string, folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();
    
    // Ensure uid is numeric type
    const numericUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.delFlags(numericUid, '\\Seen', (err) => {
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
   * Delete mail
   */
  async deleteMail(uid: number | string, folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();
    
    // Ensure uid is numeric type
    const numericUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.addFlags(numericUid, '\\Deleted', (err) => {
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
   * Move mail to other folder
   */
  async moveMail(uid: number | string, sourceFolder: string, targetFolder: string): Promise<boolean> {
    await this.connectImap();
    
    // Ensure uid is numeric type
    const numericUid = typeof uid === 'string' ? parseInt(uid, 10) : uid;

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(sourceFolder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }

        this.imapClient.move(numericUid, targetFolder, (err) => {
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
   * Close all connections
   */
  async close(): Promise<void> {
    this.closeImap();
    await promisify(this.smtpTransporter.close.bind(this.smtpTransporter))();
  }

  // Helper method: parse address list
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

  // Helper method: check if there are attachments
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
   * Advanced search mails - support multiple folders and more complex filter conditions
   */
  async advancedSearchMails(options: {
    folders?: string[];        // List of folders to search, defaults to INBOX
    keywords?: string;         // Full-text search keywords
    startDate?: Date;          // Start date
    endDate?: Date;            // End date
    from?: string;             // Sender
    to?: string;               // Recipient
    subject?: string;          // Subject
    hasAttachment?: boolean;   // Whether it has attachments
    maxResults?: number;       // Maximum number of results
    includeBody?: boolean;     // Whether to include email body
  }): Promise<MailItem[]> {
    const allResults: MailItem[] = [];
    const folders = options.folders || ['INBOX'];
    const maxResults = options.maxResults || 100;
    
    console.log(`Performing advanced search, folders: ${folders.join(', ')}, keywords: ${options.keywords || 'none'}`);
    
    // Search each folder
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
        
        // If includes keywords, perform full-text matching
        if (options.keywords && options.keywords.trim() !== '') {
          const keywordLower = options.keywords.toLowerCase();
          const filteredResults = folderResults.filter(mail => {
            // Search in subject, sender, recipient
            const subjectMatch = mail.subject.toLowerCase().includes(keywordLower);
            const fromMatch = mail.from.some(f => 
              (f.name?.toLowerCase() || '').includes(keywordLower) || 
              f.address.toLowerCase().includes(keywordLower)
            );
            const toMatch = mail.to.some(t => 
              (t.name?.toLowerCase() || '').includes(keywordLower) || 
              t.address.toLowerCase().includes(keywordLower)
            );
            
            // If need to search in body, may need to get additional mail details
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
        console.error(`Error searching folder ${folder}:`, error);
        // Continue searching other folders
      }
    }
    
    // Sort by date in descending order (newest emails first)
    allResults.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // Limit result count
    return allResults.slice(0, maxResults);
  }
  
  /**
   * Get address book - extract contact information based on email history
   */
  async getContacts(options: {
    maxResults?: number;   // Maximum number of results
    includeGroups?: boolean; // Whether to include groups
    searchTerm?: string;   // Search term
  } = {}): Promise<{
    contacts: {
      name?: string;
      email: string;
      frequency: number;   // Contact frequency
      lastContact?: Date;  // Last contact time
    }[];
  }> {
    const maxResults = options.maxResults || 100;
    const searchTerm = options.searchTerm?.toLowerCase() || '';
    
    // Extract contacts from recent emails
    const contactMap = new Map<string, {
      name?: string;
      email: string;
      frequency: number;
      lastContact?: Date;
    }>();
    
    // Collect contacts from inbox and sent mails
    const folders = ['INBOX', 'Sent Messages'];
    
    for (const folder of folders) {
      try {
        const emails = await this.searchMails({
          folder,
          limit: 200, // Search enough emails to collect contacts
        });
        
        emails.forEach(email => {
          // Process senders in inbox
          if (folder === 'INBOX') {
            email.from.forEach(sender => {
              if (sender.address === this.config.defaults.fromEmail) return; // Skip self
              
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
          
          // Process recipients in sent mails
          if (folder === 'Sent Messages') {
            email.to.forEach(recipient => {
              if (recipient.address === this.config.defaults.fromEmail) return; // Skip self
              
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
            
            // If there are CC, also process
            if (email.cc) {
              email.cc.forEach(cc => {
                if (cc.address === this.config.defaults.fromEmail) return; // Skip self
                
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
        console.error(`Error collecting contacts from folder ${folder}:`, error);
        // Continue processing other folders
      }
    }
    
    // Convert to array and sort (frequency priority)
    let contacts = Array.from(contactMap.values());
    
    // If search term is provided, filter
    if (searchTerm) {
      contacts = contacts.filter(contact => 
        (contact.name?.toLowerCase() || '').includes(searchTerm) ||
        contact.email.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort by contact frequency
    contacts.sort((a, b) => b.frequency - a.frequency);
    
    // Limit result count
    contacts = contacts.slice(0, maxResults);
    
    return { contacts };
  }

  /**
   * Get mail attachment
   * @param uid Mail UID
   * @param folder Folder name
   * @param attachmentIndex Attachment index
   * @returns Attachment data, including filename, content and content type
   */
  async getAttachment(uid: number, folder: string = 'INBOX', attachmentIndex: number): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
    await this.connectImap();
    console.log(`Getting attachment ${attachmentIndex} for UID ${uid}...`);

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, true, (err) => {
        if (err) {
          console.error(`Failed to open folder ${folder}:`, err);
          reject(err);
          return;
        }

        const f = this.imapClient.fetch(`${uid}`, { bodies: '', struct: true });
        
        let attachmentInfo: { partID: string; filename: string; contentType: string } | null = null;
        
        f.on('message', (msg, seqno) => {
          msg.on('body', (stream, info) => {
            // This event handler is only to ensure message body is processed
            stream.on('data', () => {});
            stream.on('end', () => {});
          });

          msg.once('attributes', (attrs) => {
            try {
              const struct = attrs.struct;
              const attachments = this.findAttachmentParts(struct);
              
              if (attachments.length <= attachmentIndex) {
                console.log(`Attachment index ${attachmentIndex} out of range, total attachments: ${attachments.length}`);
                resolve(null);
                return;
              }
              
              attachmentInfo = attachments[attachmentIndex];
              console.log('Found attachment info:', attachmentInfo);
            } catch (error) {
              console.error('Error parsing attachment structure:', error);
              reject(error);
            }
          });
          
          msg.once('end', () => {
            if (!attachmentInfo) {
              console.log('Attachment not found or invalid attachment index');
              resolve(null);
              return;
            }
            
            // Get attachment content
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
                  console.log(`Attachment content download completed, size: ${buffer.length} bytes`);
                });
              });
              
              msg.once('end', () => {
                console.log('Attachment message processing completed');
              });
            });
            
            attachmentFetch.once('error', (err) => {
              console.error('Error getting attachment content:', err);
              reject(err);
            });
            
            attachmentFetch.once('end', () => {
              console.log('Attachment retrieval process ended');
              resolve({
                filename: attachmentInfo!.filename,
                content: buffer,
                contentType: attachmentInfo!.contentType
              });
            });
          });
        });
        
        f.once('error', (err) => {
          console.error('Error getting mail:', err);
          reject(err);
        });
        
        f.once('end', () => {
          if (!attachmentInfo) {
            console.log('No attachment found or no attachments in structure');
            resolve(null);
          }
        });
      });
    });
  }

  /**
   * Helper method: find all attachments in mail structure
   */
  private findAttachmentParts(struct: any[], prefix = ''): { partID: string; filename: string; contentType: string }[] {
    const attachments: { partID: string; filename: string; contentType: string }[] = [];
    
    if (!struct || !Array.isArray(struct)) return attachments;
    
    const processStruct = (s: any, partID = '') => {
      if (Array.isArray(s)) {
        // Multi-part structure
        if (s[0] && typeof s[0] === 'object' && s[0].partID) {
          // This is a specific part
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
          // Iterate through each element in the array
          for (let i = 0; i < s.length; i++) {
            const newPrefix = partID ? `${partID}.${i + 1}` : `${i + 1}`;
            if (Array.isArray(s[i])) {
              processStruct(s[i], newPrefix);
            } else if (typeof s[i] === 'object') {
              // Might be a part definition
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
   * Batch mark mails as read
   */
  async markMultipleAsRead(uids: (number | string)[], folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();
    
    // Ensure all uids are numeric type
    const numericUids = uids.map(uid => typeof uid === 'string' ? parseInt(uid, 10) : uid);

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.imapClient.addFlags(numericUids, '\\Seen', (err) => {
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
   * Batch mark mails as unread
   */
  async markMultipleAsUnread(uids: (number | string)[], folder: string = 'INBOX'): Promise<boolean> {
    await this.connectImap();
    
    // Ensure all uids are numeric type
    const numericUids = uids.map(uid => typeof uid === 'string' ? parseInt(uid, 10) : uid);

    return new Promise((resolve, reject) => {
      this.imapClient.openBox(folder, false, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.imapClient.delFlags(numericUids, '\\Seen', (err) => {
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
   * Wait for new mail reply
   * This method uses polling to detect new mail arrivals. Mainly used for scenarios that need to wait for user mail replies.
   * 
   * Working principle:
   * 1. First check if there are unread mails within 5 minutes, if yes, return special status to prompt processing of these mails first
   * 2. If no recent unread mails, then:
   *    - Connect to IMAP server and get current mail count
   *    - Check every 5 seconds for mail count changes
   *    - If new mail is detected, get the latest mail content
   *    - If no new mail arrives within the specified time, return null
   * 
   * @param folder Folder to listen to, defaults to 'INBOX' (inbox)
   * @param timeout Timeout (milliseconds), defaults to 3 hours. Returns null if timeout
   * @returns If new mail arrives before timeout, return mail details; if timeout, return null; if there are recent unread mails, return list with special marker
   */
  async waitForNewReply(folder: string = 'INBOX', timeout: number = 3 * 60 * 60 * 1000): Promise<MailItem | null | { type: 'unread_warning'; mails: MailItem[] }> {
    await this.connectImap();

    // Check for unread mails within 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingMails = await this.searchMails({
      folder,
      limit: 5,
      readStatus: 'unread',
      fromDate: fiveMinutesAgo
    });

    // If there are unread mails within 5 minutes, return special status
    if (existingMails.length > 0) {
      console.log(`[waitForNewReply] Found ${existingMails.length} unread mails in the last 5 minutes, need to process first`);
      return {
        type: 'unread_warning',
        mails: existingMails
      };
    }

    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      let isResolved = false;
      let initialCount = 0;
      let checkInterval: NodeJS.Timeout;

      // Cleanup function
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (checkInterval) {
          clearInterval(checkInterval);
        }
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(null);
        }
      }, timeout);

      // Get initial mail count and start polling
      this.imapClient.openBox(folder, false, (err, mailbox) => {
        if (err) {
          cleanup();
          reject(err);
          return;
        }

        // Record initial mail count
        initialCount = mailbox.messages.total;
        console.log(`[waitForNewReply] Initial mail count: ${initialCount}, starting to wait for new mail reply...`);

        // Check for new mails every 5 seconds
        checkInterval = setInterval(async () => {
          if (isResolved) return;

          try {
            // Reopen mailbox to get latest status
            this.imapClient.openBox(folder, false, async (err, mailbox) => {
              if (err || isResolved) return;

              const currentCount = mailbox.messages.total;
              console.log(`[waitForNewReply] Current mail count: ${currentCount}, initial count: ${initialCount}`);

              if (currentCount > initialCount) {
                // There are new mails, get the latest mail
                try {
                  const messages = await this.searchMails({
                    folder,
                    limit: 1
                  });

                  if (messages.length > 0 && !isResolved) {
                    // Get complete mail content
                    const fullMail = await this.getMailDetail(messages[0].uid, folder);
                    if (fullMail) {
                      console.log(`[waitForNewReply] Received new mail reply, subject: "${fullMail.subject}"`);
                      isResolved = true;
                      cleanup();
                      resolve(fullMail);
                    }
                  }
                } catch (error) {
                  console.error('[waitForNewReply] Failed to get new mail:', error);
                }
              }
            });
          } catch (error) {
            console.error('[waitForNewReply] Error checking for new mail:', error);
          }
        }, 5000);
      });
    });
  }
} 