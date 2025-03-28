#!/usr/bin/env node

import { MailMCP } from './tools/mail.js';
import { ProcessManager } from './tools/process-manager.js';
import { config } from 'dotenv';

// 加载环境变量
config();

// 创建进程管理器
const processManager = new ProcessManager();

// 检查进程互斥
if (!processManager.checkAndCreateLock()) {
  console.log('MCP服务已在运行，本实例将退出');
  process.exit(0);
}

// 实例化邮件MCP
const mailMCP = new MailMCP();

// 处理进程退出
process.on('SIGINT', async () => {
  console.log('正在关闭邮件MCP服务...');
  await mailMCP.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('正在关闭邮件MCP服务...');
  await mailMCP.close();
  process.exit(0);
}); 