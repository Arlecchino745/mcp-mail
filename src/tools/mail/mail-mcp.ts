import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MailService } from '../mail-service.js';
import { validateEnvironmentVariables, loadMailConfig } from './config.js';
import { registerSendingTools } from './sending-tools.js';
import { registerReceivingTools } from './receiving-tools.js';
import { registerFolderTools } from './folder-tools.js';
import { registerFlagTools } from './flag-tools.js';

export class MailMCP {
  private server: McpServer;
  private mailService: MailService;

  constructor() {
    // Validate environment variables
    validateEnvironmentVariables();

    // Load configuration from environment variables
    const config = loadMailConfig();

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
   * Register all MCP tools
   */
  private registerTools(): void {
    // Mail sending related tools
    registerSendingTools(this.server, this.mailService);
    
    // Mail receiving and query related tools
    registerReceivingTools(this.server, this.mailService);
    
    // Mail folder management tools
    registerFolderTools(this.server, this.mailService);
    
    // Mail flag tools
    registerFlagTools(this.server, this.mailService);
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.mailService.close();
  }
}
