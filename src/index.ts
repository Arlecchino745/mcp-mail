#!/usr/bin/env node

import { MailMCP } from './tools/mail/index.js';
import { ProcessManager } from './tools/process-manager.js';
import { config } from 'dotenv';

// Load environment variables
config();

// Main function
async function main() {
  // Create process manager
  const processManager = new ProcessManager();

  // Check process mutex
  if (!await processManager.checkAndCreateLock()) {
    console.log('Unable to create MCP instance, program exits');
    process.exit(1);
  }

  // Instantiate mail MCP
  const mailMCP = new MailMCP();

  // Handle process exit
  process.on('SIGINT', async () => {
    console.log('Closing mail MCP service...');
    await mailMCP.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Closing mail MCP service...');
    await mailMCP.close();
    process.exit(0);
  });
}

// Start application
main().catch(error => {
  console.error('MCP service startup failed:', error);
  process.exit(1);
}); 