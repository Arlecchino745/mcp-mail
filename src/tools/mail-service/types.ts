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
export interface EmailAddress {
  name?: string;
  address: string;
}

// Advanced search options
export interface AdvancedSearchOptions {
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
}

// Contacts options
export interface ContactsOptions {
  maxResults?: number;   // Maximum number of results
  includeGroups?: boolean; // Whether to include groups
  searchTerm?: string;   // Search term
}

// Contact information
export interface Contact {
  name?: string;
  email: string;
  frequency: number;   // Contact frequency
  lastContact?: Date;  // Last contact time
}

// Contacts response
export interface ContactsResponse {
  contacts: Contact[];
}

// Attachment information
export interface AttachmentInfo {
  partID: string;
  filename: string;
  contentType: string;
}

// Attachment data
export interface AttachmentData {
  filename: string;
  content: Buffer;
  contentType: string;
}

// Wait for new reply response types
export interface UnreadWarning {
  type: 'unread_warning';
  mails: MailItem[];
}

export type WaitForNewReplyResponse = MailItem | null | UnreadWarning;
