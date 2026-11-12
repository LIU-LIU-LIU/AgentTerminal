# AgentTerminal

[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-blue)

面向 AI 编程 Agent 的本地终端管理工具。通过 MCP 统一执行命令，在同一窗口中查看多个 Agent 的终端输出、任务状态和运行统计。

[![AgentTerminal 概念短片](docs/media/agentterminal-concept.gif)](docs/media/agentterminal-concept.mp4)


目前仅适配 [Codex](https://github.com/openai/codex) 和 [Claude Code](https://github.com/anthropics/claude-code)。[Gemini CLI](https://github.com/google-gemini/gemini-cli)、[Grok](https://grok.com)、[OpenCode](https://github.com/anomalyco/opencode)、[OpenClaw](https://github.com/openclaw/openclaw)、[Hermes Agent](https://github.com/NousResearch/hermes-agent)、[Pi](https://github.com/earendil-works/pi)、[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和腾讯 [WorkBuddy](https://www.workbuddy.cn/) 均尚未适配，不能视为已支持。

与侧重 API Provider 切换和 Agent 配置管理的 [CC Switch](https://github.com/farion1231/cc-switch) 定位不同，AgentTerminal 仅统一管理终端执行、交互、监控与统计，不提供 Provider、模型或 API 密钥的管理与切换，可与这类工具配合使用。使用时在配置中心完成接入即可，无需另装 IDE 插件。

## 功能

- **终端监控**：实时输出、交互输入、退出码、任务取消和历史记录。
- **多 Agent 接入**：支持 Codex、Claude Code 的 MCP、Hooks 和 Skill 安装与卸载。
- **Shell 配置**：默认使用本机 Git Bash，可切换 PowerShell 或 CMD，自定义可执行文件路径。
- **运行统计**：按 Agent、Shell 和任务状态统计，支持 JSONL 导出及终端文本 Token 估算。
- **服务管理**：重复启动自动复用，支持重启服务和完全退出。
- **悬浮窗**：显示运行中命令、实时耗时与流式输出，后台长任务优先；无任务运行时自动折叠，鼠标移上展开；可拖动、贴边吸附，多个 Agent 同时工作时并排显示，双击回到监控。
- **终端外观**：默认跟随 VS Code / Cursor 等 IDE 的终端主题与字体，也可在配置中心选择内置配色、字号和光标样式。
- **桌面窗口**：监控和配置两个 Tab，深色 / 浅色界面，可设置窗口置顶。

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

已发布的便携包可在 [Releases](https://github.com/LIU-LIU-LIU/AgentTerminal/releases) 中下载；若暂无版本，可按下文自行构建。解压完整目录后运行，不要只复制 exe。

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
| 关闭桌面窗口 | 收到系统托盘，后台服务和悬浮窗保持运行；单击托盘图标重新打开，右键可完全退出 |
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

工作目录概览：`apps/ui/` 为主界面与悬浮窗，`packages/runtime/` 负责终端运行与历史，`packages/` 下其余目录负责 Agent 接入；`tests/` 为测试，`scripts/` 为打包与发布脚本，`docs/` 为文档，`research/` 为调研复现脚本。命令默认在 Agent 当前工作目录执行，也可显式指定目录。

每次 push / PR 会自动构建前后端，并在 Windows、Linux、macOS 上运行测试。推送 `main` 后还会自动生成下一补丁版本（如 `0.1.1 → 0.1.2`），测试并编译 Windows 桌面端，生成包含 Node.js 的完整便携 ZIP 和 SHA-256 校验文件，上传到 GitHub Release。标题自动使用 `AgentTerminal v版本号`，更新说明由 GitHub 根据合并的 PR、贡献者和提交比较自动生成。三平台测试不代表已提供三平台桌面包。

自动发布会同步各版本文件及 Rust 锁文件，构建成功后以机器人提交版本、创建标签，再发布；失败不推送版本提交。第一次发布采用当前尚未打标签的版本，以后按已有稳定标签递增补丁号；可在 Actions 手动重跑。也支持预先执行 `node scripts/prepare-release.mjs 0.2.0` 指定较大的版本，或手动推送版本一致的 `v*` 标签；预发布标签（如 `v0.2.0-beta.1`）会标记为预发布。其他分支不会自动发布。工作流需要仓库允许 `GITHUB_TOKEN` 写入内容；受保护的 `main` 若禁止机器人推送，需调整规则或采用手动标签发布。机器人通过内置令牌推送不会再次触发工作流，避免版本循环；自动说明仍需人工核实功能变化。

欢迎一起开发！大家都在用 AI 编程，无论你是手写代码还是借助 AI，都欢迎通过 [Issue](https://github.com/LIU-LIU-LIU/AgentTerminal/issues) 交流想法、反馈问题，或提交 [Pull Request](https://github.com/LIU-LIU-LIU/AgentTerminal/pulls)。请说明改动目的、复现或验证方式，一起把终端管理做好。

## 使用说明

- 只聚合通过 AgentTerminal 执行的命令，不自动接管其他客户端的全部原生终端。
- 显式指定 Shell 时，不会自动转换不同 Shell 的命令语法。
- Token 为终端文本估算，不代表模型 API 用量或账单。
- 默认数据目录为 `~/.agentterminal`，可用 `AGENT_TERMINAL_HOME` 指定。
- 安装器记录程序绝对路径。移动便携目录前先卸载 Agent 接入，再从新位置安装。

更多说明见[使用指南](docs/usage.md)。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)，允许商用、修改与再分发，需遵守许可证中的署名和通知保留要求。
