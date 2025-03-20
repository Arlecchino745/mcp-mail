# Mail MCP 工具

[![ISC License](https://img.shields.io/badge/License-ISC-9f7aea?style=flat-square)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-38a169?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-2b6cb0?style=flat-square)](https://www.typescriptlang.org/)
[![Mail](https://img.shields.io/badge/Mail-MCP-ff69b4?style=flat-square)](https://github.com/shuakami/mcp-mail)

[English Version (README-EN.md)](README-EN.md)

## 这是什么

这是一个基于 MCP (Model Context Protocol) 的邮件工具，它能让 AI 模型通过标准化接口访问电子邮件服务。

简单来说，它让 AI 助手能够执行各种邮件操作，如发送邮件、阅读收件箱、处理附件等，无需用户手动输入复杂的API调用或切换到邮件客户端。

<details>
<summary><b>支持的功能</b> (点击展开)</summary>

- **邮件发送**：普通文本邮件、HTML邮件、带附件邮件、群发邮件
- **邮件接收与查询**：获取文件夹列表、列出邮件、高级搜索、获取邮件详情
- **邮件管理**：标记已读/未读、删除邮件、移动邮件
- **附件管理**：查看附件列表、下载附件、查看附件内容
- **联系人管理**：获取联系人列表、搜索联系人
</details>

<details>
<summary><b>功能特点</b> (点击展开)</summary>

以下是 Mail MCP 工具的一些核心特点：

- **高级搜索功能**：支持多文件夹、关键词、日期范围、发件人、收件人等复杂条件搜索
- **智能联系人管理**：自动从邮件历史中提取联系人信息，包括联系频率分析
- **内容范围控制**：可以分段查看大型邮件，避免加载过多内容
- **多种邮件格式**：支持纯文本和HTML格式邮件的发送和显示
- **附件处理能力**：智能识别附件类型，支持文本、图片等不同类型的附件预览
- **安全可靠**：本地处理所有邮件操作，不通过第三方服务器转发敏感信息

通过简单的自然语言指令，AI 可以帮助你完成上述所有操作，无需手动编写API调用或在邮件客户端中执行复杂操作。
</details>

## 快速上手

### 0. 环境准备

<details>
<summary>如果你之前没有使用过 Node.js (点击展开)</summary>

1. 安装 Node.js 和 npm
   - 访问 [Node.js 官网](https://nodejs.org/)
   - 下载并安装 LTS（长期支持）版本
   - 安装时选择默认选项即可，安装包会同时安装 Node.js 和 npm

2. 验证安装
   - 安装完成后，打开命令提示符（CMD）或 PowerShell
   - 输入以下命令确认安装成功：
     ```bash
     node --version
     npm --version
     ```
   - 如果显示版本号，则表示安装成功

3. 安装 Git（如果尚未安装）
   - 访问 [Git 官网](https://git-scm.com/)
   - 下载并安装 Git
   - 安装时使用默认选项即可
</details>

### 1. 克隆并安装

```bash
git clone https://github.com/shuakami/mcp-mail.git
cd mcp-mail
npm install
```

### 2. 构建项目

```bash
npm run build
```

### 3. 配置邮箱账户

<details>
<summary><b>邮箱配置步骤</b> (点击展开)</summary>

1. 创建配置文件
   - 在项目根目录下，创建 `mcp.json` 文件

2. 配置你的邮箱信息
   ```json
   {
     "smtp": {
       "host": "smtp.example.com",
       "port": 465,
       "secure": true,
       "auth": {
         "user": "your.email@example.com",
         "pass": "your-password-or-app-password"
       }
     },
     "imap": {
       "host": "imap.example.com",
       "port": 993,
       "secure": true,
       "auth": {
         "user": "your.email@example.com",
         "pass": "your-password-or-app-password"
       }
     },
     "defaults": {
       "fromName": "Your Name",
       "fromEmail": "your.email@example.com"
     }
   }
   ```

3. 常见邮箱服务商配置参考

   **QQ邮箱**
   ```json
   {
     "smtp": {
       "host": "smtp.qq.com",
       "port": 465,
       "secure": true
     },
     "imap": {
       "host": "imap.qq.com",
       "port": 993,
       "secure": true
     }
   }
   ```

   **Gmail**
   ```json
   {
     "smtp": {
       "host": "smtp.gmail.com",
       "port": 465,
       "secure": true
     },
     "imap": {
       "host": "imap.gmail.com",
       "port": 993,
       "secure": true
     }
   }
   ```

   **Outlook/Hotmail**
   ```json
   {
     "smtp": {
       "host": "smtp-mail.outlook.com",
       "port": 587,
       "secure": false
     },
     "imap": {
       "host": "outlook.office365.com",
       "port": 993,
       "secure": true
     }
   }
   ```

> ⚠️ **安全提示**:
> - 对于 Gmail、Outlook 等服务，请使用 [应用专用密码](https://support.google.com/accounts/answer/185833)，而不是你的账户密码
> - 对于 QQ 邮箱，需要在 QQ 邮箱设置中开启 POP3/SMTP/IMAP 服务并获取授权码
> - 请确保你的 `mcp.json` 文件不会被提交到公共代码仓库
</details>

### 4. 添加到 Cursor MCP 配置

根据你的操作系统，按照以下步骤配置 MCP：

<details>
<summary><b>Windows 配置</b> (点击展开)</summary>

1. 在 Cursor 中，打开或创建 MCP 配置文件：`C:\\Users\\你的用户名\\.cursor\\mcp.json`
   - 注意：请将 `你的用户名` 替换为你的 Windows 用户名

2. 添加或修改配置如下：

```json
{
  "mcpServers": {
    "mail-mcp": {
      "command": "powershell",
      "args": [
        "-WindowStyle",
        "Hidden",
        "-Command",
        "node",
        "C:/Users/你的用户名/mcp-mail/dist/index.js"
      ]
    }
  }
}
```

> ⚠️ **请注意**:
> - 将 `你的用户名` 替换为你的 Windows 用户名（例如：`C:/Users/John/mcp-mail/...`）
> - 确保路径正确指向你的项目目录
</details>

<details>
<summary><b>macOS 配置</b> (点击展开)</summary>

1. 在 Cursor 中，打开或创建 MCP 配置文件：`/Users/你的用户名/.cursor/mcp.json`
   - 注意：请将 `你的用户名` 替换为你的 macOS 用户名

2. 添加或修改配置如下：

```json
{
  "mcpServers": {
    "mail-mcp": {
      "command": "bash",
      "args": [
        "-c",
        "node /Users/你的用户名/mcp-mail/dist/index.js"
      ]
    }
  }
}
```

> ⚠️ **请注意**:
> - 将 `你的用户名` 替换为你的 macOS 用户名（例如：`/Users/johndoe/mcp-mail/...`）
> - 确保路径正确指向你的项目目录
</details>

<details>
<summary><b>Linux 配置</b> (点击展开)</summary>

1. 在 Cursor 中，打开或创建 MCP 配置文件：`/home/你的用户名/.cursor/mcp.json`
   - 注意：请将 `你的用户名` 替换为你的 Linux 用户名

2. 添加或修改配置如下：

```json
{
  "mcpServers": {
    "mail-mcp": {
      "command": "bash",
      "args": [
        "-c",
        "node /home/你的用户名/mcp-mail/dist/index.js"
      ]
    }
  }
}
```

> ⚠️ **请注意**:
> - 将 `你的用户名` 替换为你的 Linux 用户名（例如：`/home/user/mcp-mail/...`）
> - 确保路径正确指向你的项目目录
</details>

### 5. 启动服务

配置好之后，重启 Cursor 编辑器，它会自动启动 MCP 服务。然后你就可以开始使用了。

<details>
<summary>使用示例 (点击展开)</summary>

你可以要求 AI 执行以下操作：
- "列出我的邮箱文件夹"
- "显示收件箱中的最新5封邮件"
- "发送一封主题为'测试邮件'的邮件给example@example.com"
- "搜索包含'发票'关键词的邮件"
- "查看UID为1234的邮件详情"
- "下载邮件中的附件"
</details>

## 工作原理

<details>
<summary>技术实现细节 (点击展开)</summary>

本工具基于 **MCP (Model Context Protocol)** 标准实现，作为 AI 模型与电子邮件服务之间的桥梁。它使用 **nodemailer** 和 **node-imap** 作为底层邮件客户端，并通过 **Zod** 进行请求验证和类型检查。

主要技术组件包括：
- **SMTP 客户端**：负责所有邮件发送功能，支持HTML内容和附件
- **IMAP 客户端**：负责连接邮箱服务器，获取邮件列表、详情和附件
- **邮件解析器**：使用 **mailparser** 解析复杂的电子邮件格式
- **内容处理**：智能处理HTML和纯文本内容，并支持分段加载大型邮件
- **联系人提取**：从邮件历史中自动提取和整理联系人信息

每个邮件操作都被封装为标准化的 MCP 工具，接收结构化参数并返回格式化结果。所有数据都经过处理，以确保以人类可读的格式呈现，使 AI 模型能够轻松理解电子邮件的内容结构。
</details>

## 许可证

ISC

---

如果这个项目对你有帮助，欢迎给个 Star ⭐️ (｡♥‿♥｡)
