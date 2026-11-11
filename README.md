# AgentTerminal

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)

面向 AI 编程 Agent 的本地终端管理工具。通过 MCP 统一执行命令，在同一窗口中查看多个 Agent 的终端输出、任务状态和运行统计。

## 功能

- **终端监控**：实时输出、交互输入、退出码、任务取消和历史记录。
- **多 Agent 接入**：支持 Codex、Claude Code 的 MCP、Hooks 和 Skill 安装与卸载。
- **Shell 配置**：默认使用本机 Git Bash，可切换 PowerShell 或 CMD，自定义可执行文件路径。
- **运行统计**：按 Agent、Shell 和任务状态统计，支持 JSONL 导出及终端文本 Token 估算。
- **服务管理**：重复启动自动复用，支持重启服务和完全退出。
- **桌面窗口**：监控和配置两个 Tab，可设置窗口置顶。

## 运行环境

- Windows x64
- Git for Windows
- 从源码运行：Node.js 22、pnpm 10
- 桌面端运行：WebView2；便携包已包含 Node.js
- 桌面端编译：额外需要 Rust 和 Visual Studio C++ 构建工具

Linux 和 macOS 尚未完成兼容性验证。

## 快速开始

### 使用桌面端

启动便携目录中的 `AgentTerminal.exe`，后台服务会自动启动。请保留整个目录。

在“配置中心”选择默认 Shell 和接入模式，安装 Agent 接入，然后重启对应 Agent 以加载配置。

便携包目前需自行构建，尚未发布 Release 下载。

### 从源码运行

```powershell
pnpm install
pnpm build
pnpm start
```

打开命令输出的本机界面地址。服务在后台运行，重复执行 `pnpm start` 会显示已有服务地址，不会启动重复实例。

```powershell
pnpm stop       # 停止后台服务
pnpm run restart # 停止任务并重启后台服务，保留历史
```

更新源码后先运行 `pnpm build`，再运行 `pnpm run restart` 加载新版本。使用 `run restart` 可避免 pnpm 的 restart 快捷命令额外执行 stop / start 生命周期。若 PowerShell 执行策略限制 `pnpm.ps1`，可改用 `pnpm.cmd`。

### 窗口与后台服务

界面用于配置和监控，后台服务负责命令执行与历史存储。

| 操作 | 行为 |
| --- | --- |
| 关闭桌面窗口 | 保留后台服务，正在运行的任务继续执行 |
| 重启服务 | 停止当前任务，重启后台服务并重新连接 |
| 完全退出 | 停止任务和后台服务，桌面端关闭窗口；浏览器页面显示已停止 |
| `pnpm stop` | 停止后台服务；已打开的其他界面失去连接 |

有运行任务时，界面会在重启或完全退出前提示确认。旧版本服务不支持正常停止接口时，命令行仅在确认没有运行任务后执行兼容停止。

## 开发与打包

```powershell
pnpm desktop           # 启动桌面开发环境，先完成 pnpm build
pnpm desktop:build     # 编译 Windows 桌面端
pnpm package:portable  # 生成 artifacts/ 下的完整便携目录
```

```powershell
pnpm test
pnpm --dir apps/ui test
```

技术栈：TypeScript、Node.js、SQLite、React、Tauri、xterm.js、node-pty。

## 使用说明

- 只聚合通过 AgentTerminal 执行的命令，不自动接管其他客户端的全部原生终端。
- 显式指定 Shell 时，不会自动转换不同 Shell 的命令语法。
- Token 为终端文本估算，不代表模型 API 用量或账单。
- Provider、模型和密钥切换由 cc-switch 等外部工具管理。
- 默认数据目录为 `~/.agentterminal`，可用 `AGENT_TERMINAL_HOME` 指定。
- 安装器记录程序绝对路径。移动便携目录前先卸载 Agent 接入，再从新位置安装。

更多说明见[使用指南](docs/usage.md)。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)，允许商用、修改与再分发，需遵守许可证中的署名和通知保留要求。
