import { EmailAddress } from './types.js';

/**
 * Utility functions for mail service
 */
export class MailUtils {
  /**
   * Parse address list from IMAP headers
   */
  static parseAddressList(addresses?: string[]): EmailAddress[] {
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

  /**
   * Check if mail structure has attachments
   */
  static checkHasAttachments(struct: any[]): boolean {
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
   * Find all attachments in mail structure
   */
  static findAttachmentParts(struct: any[], prefix = ''): { partID: string; filename: string; contentType: string }[] {
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
}
