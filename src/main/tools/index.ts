// Re-export the main MailMCP class
export { MailMCP } from './mail-mcp.js';

// Re-export individual modules for advanced usage
export { validateEnvironmentVariables, loadMailConfig } from './config.js';
export { registerSendingTools } from './sending-tools.js';
export { registerReceivingTools } from './receiving-tools.js';
export { registerFolderTools } from './folder-tools.js';
export { registerFlagTools } from './flag-tools.js';
export { registerCredentialTools } from './credential-tools.js';
