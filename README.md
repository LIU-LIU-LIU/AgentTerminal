# AgentTerminal

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
![Windows x64](https://img.shields.io/badge/tested-Windows%20x64-blue)

为 Codex、Claude Code 等 AI 编程 Agent 提供统一的本机命令执行、终端监控和审计。多个 Agent 的 MCP 命令共享同一 Runtime，每个任务拥有独立 PTY、输出和生命周期。

## 功能与边界

- **单窗口**：实时监控与配置中心两个 Tab，支持窗口置顶。
- **执行与交互**：MCP `run / start / read / status / write / kill / list`，流式输出、输入、退出码和取消。
- **本机 Shell**：默认 Git Bash；可设置 PowerShell / CMD，以及各 Shell 的绝对路径。MCP 可显式覆盖默认值，不自动改写命令语法。
- **Agent 接入**：预览、备份、安装和卸载 MCP / Hooks / Skill，保留其他配置。
- **监控与统计**：任务、Agent / Shell 分布、JSONL 元数据导出；每任务终端输入 / 输出 Token **文本估算**，不是模型计费。
- **持久化**：SQLite 元数据与日志文件，关闭 UI 后 Runtime 继续运行，重开查看历史。

聚合范围是通过本工具执行的命令；不会自动接管其他客户端的所有原生终端。Hooks 审计或拦截受支持的工具调用，不是系统沙箱。Provider、模型、API Key 切换交给 cc-switch 等工具，本项目不管理 Provider 或 Codex Cloud 远程环境。

## 快速开始

Windows x64，准备 Git for Windows、Node.js 22 和 pnpm 10：

```powershell
pnpm install
pnpm build
pnpm start
```

打开 Runtime 输出的本机地址（包含 `#token=…`），在配置中心选择 Shell、接入模式并安装 Agent 接入，再重启 Agent。PowerShell 执行策略限制 pnpm.ps1 时可用 `pnpm.cmd`。

桌面开发和打包需要 Rust / MSVC / WebView2：

```powershell
pnpm desktop
pnpm desktop:build
pnpm package:portable
```

本地便携包位于 `artifacts/`，保留整个目录，启动 `AgentTerminal.exe`。安装器记录绝对路径，移动目录前先卸载接入，再从新位置安装。构建产物未提交 Git，尚未发布 GitHub Release。升级旧版时先等待任务结束、停止旧 Runtime，再启动新版；仅关闭 UI 不会更新正在运行的 Runtime。

## 技术栈与验证

Node.js / TypeScript Runtime，SQLite、node-pty、MCP SDK；React + xterm.js UI，Tauri 2 / Rust 桌面外壳。每任务独立 PTY helper，隔离 Windows ConPTY 生命周期；IPC 队列提供背压。选择这一组合便于共享类型和 AI 辅助维护，保留成熟 PTY 库；仍需维护原生模块 ABI、每任务 helper 开销和平台打包。Windows 已实测，Linux / macOS 尚未完成平台验收。

```powershell
pnpm build
pnpm test
pnpm --dir apps/ui test
```

- [本轮完成项、实测与限制](docs/current-status.md)
- [使用、备份和卸载](docs/usage.md)
- [调研与历史实测](docs/research.md)
- [架构决策](docs/architecture.md)
- [复现脚本](research/README.md)
- [GitHub 设置与许可](docs/github.md)

## 来源与许可

任务调度、Runtime 协议、MCP 转发、Hooks、安装器和 UI 整合由本项目实现。研究过 smart-terminal-mcp、Tabby，没有复制这些项目源码或依赖它们作为宿主。终端进程与模拟器复用 node-pty / xterm.js，依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

采用 [Apache License 2.0](LICENSE)：允许使用、修改、转载、分发和商用；分发时保留许可证、版权和适用 NOTICE，并按许可标明修改。署名义务不等于每个界面必须展示 Logo；第三方组件按各自许可执行。欢迎提交 Issue / PR，请勿上传密钥、连接令牌或私人配置。
