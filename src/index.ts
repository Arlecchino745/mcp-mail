#!/usr/bin/env node

import { MailMCP } from './tools/mail.js';
import { ProcessManager } from './tools/process-manager.js';
import { config } from 'dotenv';

// 加载环境变量
config();

// 主函数
async function main() {
  // 创建进程管理器
  const processManager = new ProcessManager();

  // 检查进程互斥
  if (!await processManager.checkAndCreateLock()) {
    console.log('无法创建MCP实例，程序退出');
    process.exit(1);
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
}

// 启动应用
main().catch(error => {
  console.error('MCP服务启动失败:', error);
  process.exit(1);
}); 