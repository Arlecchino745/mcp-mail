# Mail MCP Tool

[![ISC License](https://img.shields.io/badge/License-ISC-9f7aea?style=flat-square)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-38a169?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-2b6cb0?style=flat-square)](https://www.typescriptlang.org/)
[![Mail](https://img.shields.io/badge/Mail-MCP-ff69b4?style=flat-square)](https://github.com/shuakami/mcp-mail)

[中文版 (README.md)](README.md)

## What is this

This is an email tool based on MCP (Model Context Protocol) that enables AI models to access email services through a standardized interface.

Simply put, it allows AI assistants to perform various email operations such as sending emails, reading inboxes, processing attachments, etc., without requiring users to manually input complex API calls or switch to an email client.

<details>
<summary><b>Supported Features</b> (click to expand)</summary>

- **Email Sending**: Plain text emails, HTML emails, emails with attachments, bulk emails
- **Email Receiving and Querying**: Get folder list, list emails, advanced search, get email details
- **Email Management**: Mark as read/unread, delete emails, move emails
- **Attachment Management**: View attachment list, download attachments, view attachment content
- **Contact Management**: Get contact list, search contacts
</details>

<details>
<summary><b>Feature Highlights</b> (click to expand)</summary>

Here are some core features of the Mail MCP tool:

- **Advanced Search Functionality**: Support for multi-folder, keyword, date range, sender, recipient, and other complex search conditions
- **Intelligent Contact Management**: Automatically extract contact information from email history, including contact frequency analysis
- **Content Range Control**: View large emails in segments to avoid loading too much content
- **Multiple Email Formats**: Support for sending and displaying plain text and HTML format emails
- **Attachment Processing Capability**: Intelligent identification of attachment types, support for previewing text, images, and other attachment types
- **Secure and Reliable**: Process all email operations locally, without forwarding sensitive information through third-party servers

Through simple natural language instructions, AI can help you complete all the above operations without having to manually write API calls or perform complex operations in an email client.
</details>

## Quick Start

### 0. Environment Preparation

<details>
<summary>If you have never used Node.js before (click to expand)</summary>

1. Install Node.js and npm
   - Visit the [Node.js website](https://nodejs.org/)
   - Download and install the LTS (Long Term Support) version
   - Choose the default options during installation, which will install both Node.js and npm

2. Verify installation
   - After installation, open Command Prompt (CMD) or PowerShell
   - Enter the following commands to confirm successful installation:
     ```bash
     node --version
     npm --version
     ```
   - If version numbers are displayed, the installation was successful

3. Install Git (if not already installed)
   - Visit the [Git website](https://git-scm.com/)
   - Download and install Git
   - Use the default options during installation
   
4. Install Python 3.11 or higher (required)
   - Visit the [Python website](https://www.python.org/downloads/)
   - Download and install Python 3.11 or higher
   - **Important**: You MUST check the "Add Python to PATH" option during installation
   - **Restart your computer** after installation to ensure environment variables take effect
</details>

### 1. Clone and Install

```bash
git clone https://github.com/shuakami/mcp-mail.git
cd mcp-mail
npm install
npm run build
```

### 2. Build the Project

```bash
npm run build
```

### 3. Add to Cursor MCP Configuration

Follow these steps to configure MCP according to your operating system:

<details>
<summary><b>Windows Configuration</b> (click to expand)</summary>

1. In Cursor, open or create the MCP configuration file: `C:\\Users\\your-username\\.cursor\\mcp.json`
   - Note: Replace `your-username` with your Windows username

2. Add or modify the configuration as follows:

```json
{
  "mcpServers": {
    "mail-mcp": {
      "command": "pythonw",
      "args": [
        "C:/Users/your-username/mcp-mail/bridging_mail_mcp.py"
      ],
      "env": {
        "SMTP_HOST": "smtp.qq.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "SMTP_USER": "your.email@qq.com",
        "SMTP_PASS": "your-app-specific-password",
        "IMAP_HOST": "imap.qq.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "IMAP_USER": "your.email@qq.com",
        "IMAP_PASS": "your-app-specific-password",
        "DEFAULT_FROM_NAME": "Your Name",
        "DEFAULT_FROM_EMAIL": "your.email@qq.com"
      }
    }
  }
}
```

> ⚠️ **Please note**:
> - Replace `your-username` with your Windows username
> - Ensure the path correctly points to where you cloned or extracted the project
> - The path should reflect the actual location where you placed the project files
> - **Do not delete the cloned or extracted folder**, as this will cause the MCP to stop working
</details>

<details>
<summary><b>macOS Configuration</b> (click to expand)</summary>

1. In Cursor, open or create the MCP configuration file: `/Users/your-username/.cursor/mcp.json`
   - Note: Replace `your-username` with your macOS username

2. Add or modify the configuration as follows:

```json
{
  "mcpServers": {
    "mail-mcp": {
      "command": "pythonw3",
      "args": [
        "/Users/your-username/mcp-mail/bridging_mail_mcp.py"
      ]
    }
  }
}
```

> ⚠️ **Please note**:
> - Replace `your-username` with your macOS username
> - Ensure the path correctly points to where you cloned or extracted the project
> - The path should reflect the actual location where you placed the project files
> - **Do not delete the cloned or extracted folder**, as this will cause the MCP to stop working
</details>

<details>
<summary><b>Linux Configuration</b> (click to expand)</summary>

1. In Cursor, open or create the MCP configuration file: `/home/your-username/.cursor/mcp.json`
   - Note: Replace `your-username` with your Linux username

2. Add or modify the configuration as follows:

```json
{
  "mcpServers": {
    "mail-mcp": {
      "command": "python3",
      "args": [
        "/home/your-username/mcp-mail/bridging_mail_mcp.py"
      ]
    }
  }
}
```

> ⚠️ **Please note**:
> - Replace `your-username` with your Linux username
> - Ensure the path correctly points to where you cloned or extracted the project
> - The path should reflect the actual location where you placed the project files
> - **Do not delete the cloned or extracted folder**, as this will cause the MCP to stop working
</details>

### 4. Start the Service

After configuration, restart the Cursor editor, which will automatically start the MCP service. Then you can start using it.

<details>
<summary>Usage Examples (click to expand)</summary>

You can ask the AI to perform the following operations:
- "List my email folders"
- "Show the latest 5 emails in my inbox"
- "Send an email with the subject 'Test Email' to example@example.com"
- "Search for emails containing the keyword 'invoice'"
- "View the details of the email with UID 1234"
- "Download attachments from the email"
</details>

## How It Works

<details>
<summary>Technical Implementation Details (click to expand)</summary>

This tool is implemented based on the **MCP (Model Context Protocol)** standard, serving as a bridge between AI models and email services. It uses **nodemailer** and **node-imap** as the underlying email clients, and **Zod** for request validation and type checking.

The main technical components include:
- **SMTP Client**: Responsible for all email sending functions, supporting HTML content and attachments
- **IMAP Client**: Responsible for connecting to email servers, retrieving email lists, details, and attachments
- **Email Parser**: Uses **mailparser** to parse complex email formats
- **Content Processing**: Intelligently processes HTML and plain text content, and supports loading large emails in segments
- **Contact Extraction**: Automatically extracts and organizes contact information from email history

Each email operation is encapsulated as a standardized MCP tool, receiving structured parameters and returning formatted results. All data is processed to ensure it is presented in a human-readable format, making it easy for AI models to understand the content structure of emails.
</details>

## License

ISC

---

If this project helps you, please consider giving it a Star ⭐️ (｡♥‿♥｡) 