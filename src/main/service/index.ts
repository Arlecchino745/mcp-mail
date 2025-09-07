import { 
  MailConfig, 
  MailInfo, 
  MailSearchOptions, 
  MailItem, 
  AdvancedSearchOptions,
  ContactsOptions,
  ContactsResponse,
  AttachmentData,
  WaitForNewReplyResponse
} from './types.js';
import { SmtpService } from './smtp-service.js';
import { ImapService } from './imap-service.js';

/**
 * Main mail service that orchestrates SMTP and IMAP services
 */
export class MailService {
  private smtpService: SmtpService;
  private imapService: ImapService;
  private config: MailConfig;

  constructor(config: MailConfig) {
    this.config = config;
    this.smtpService = new SmtpService(config);
    this.imapService = new ImapService(config);
  }

  /**
   * Connect to IMAP server
   */
  async connectImap(): Promise<void> {
    return this.imapService.connect();
  }

  /**
   * Close IMAP connection
   */
  closeImap(): void {
    this.imapService.close();
  }

  /**
   * Send mail
   */
  async sendMail(mailInfo: MailInfo): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return this.smtpService.sendMail(mailInfo);
  }

  /**
   * Test SMTP connection with diagnostic information
   */
  async testSmtpConnection(): Promise<{ success: boolean; details: string[] }> {
    return this.smtpService.testConnection();
  }

  /**
   * Get mailbox folder list
   */
  async getFolders(): Promise<string[]> {
    return this.imapService.getFolders();
  }

  /**
   * Search mails
   */
  async searchMails(options: MailSearchOptions = {}): Promise<MailItem[]> {
    return this.imapService.searchMails(options);
  }

  /**
   * Get mail details
   */
  async getMailDetail(uid: number | string, folder: string = 'INBOX'): Promise<MailItem | null> {
    return this.imapService.getMailDetail(uid, folder);
  }

  /**
   * Mark mail as read
   */
  async markAsRead(uid: number | string, folder: string = 'INBOX'): Promise<boolean> {
    return this.imapService.markAsRead(uid, folder);
  }

  /**
   * Mark mail as unread
   */
  async markAsUnread(uid: number | string, folder: string = 'INBOX'): Promise<boolean> {
    return this.imapService.markAsUnread(uid, folder);
  }

  /**
   * Delete mail
   */
  async deleteMail(uid: number | string, folder: string = 'INBOX'): Promise<boolean> {
    return this.imapService.deleteMail(uid, folder);
  }

  /**
   * Move mail to other folder
   */
  async moveMail(uid: number | string, sourceFolder: string, targetFolder: string): Promise<boolean> {
    return this.imapService.moveMail(uid, sourceFolder, targetFolder);
  }

  /**
   * Advanced search mails - support multiple folders and more complex filter conditions
   */
  async advancedSearchMails(options: AdvancedSearchOptions): Promise<MailItem[]> {
    return this.imapService.advancedSearchMails(options);
  }

  /**
   * Get address book - extract contact information based on email history
   */
  async getContacts(options: ContactsOptions = {}): Promise<ContactsResponse> {
    return this.imapService.getContacts(options);
  }

  /**
   * Get mail attachment
   */
  async getAttachment(uid: number, folder: string = 'INBOX', attachmentIndex: number): Promise<AttachmentData | null> {
    return this.imapService.getAttachment(uid, folder, attachmentIndex);
  }

  /**
   * Batch mark mails as read
   */
  async markMultipleAsRead(uids: (number | string)[], folder: string = 'INBOX'): Promise<boolean> {
    return this.imapService.markMultipleAsRead(uids, folder);
  }

  /**
   * Batch mark mails as unread
   */
  async markMultipleAsUnread(uids: (number | string)[], folder: string = 'INBOX'): Promise<boolean> {
    return this.imapService.markMultipleAsUnread(uids, folder);
  }

  /**
   * Wait for new mail reply
   */
  async waitForNewReply(folder: string = 'INBOX', timeout: number = 3 * 60 * 60 * 1000): Promise<WaitForNewReplyResponse> {
    return this.imapService.waitForNewReply(folder, timeout);
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this.closeImap();
    await this.smtpService.close();
  }
}
