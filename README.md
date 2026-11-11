# AgentTerminal

为 Windows 上的 Codex、Claude Code 提供统一的 Git Bash 命令执行、实时监控与本地审计。当前实现使用 Node.js / TypeScript runtime、MCP、Hooks、SQLite，以及 React + xterm.js 界面；Tauri 2 承担桌面窗口外壳，Rust 不承担命令执行核心。

- [完整运行、接入、备份恢复指南](docs/usage.md)
- [调研与实测证据](docs/research.md)
- [架构决策：Node、PTY 隔离及桌面外壳](docs/architecture.md)
- [原始产品需求（含当前实现边界）](docs/PRD.md)
- [可复现脚本](research/README.md)

## 快速运行（Windows）

准备 Node.js 22、pnpm 10（仓库声明 10.33.0）、Git for Windows。在仓库根目录执行：

```powershell
pnpm install
pnpm build
pnpm start
```

`pnpm start` 输出 `http://127.0.0.1:随机端口/#token=…`，直接在浏览器打开。若 PowerShell 执行策略阻止 pnpm.ps1，改用 `pnpm.cmd`。原生依赖包括 node-pty、better-sqlite3；预编译不可用时需 Windows C++ 构建工具。

配置中心用于 MCP / Hooks / Skill 接入与本机 Codex、Claude Code provider 设置；监控窗口用于任务、终端输入输出、取消与统计。点击“独立打开监控窗口”可同时使用两个窗口。

另开终端执行 `pnpm desktop` 启动 Tauri 开发桌面端，需已构建 backend，以及 Rust / MSVC / WebView2 桌面构建环境。桌面端会复用运行中的 runtime，未连接时尝试启动；CLI / MCP 仍需先 `pnpm start`。浏览器配置安装/卸载、中文终端和统计已验证；Windows release 与便携目录生成成功，UIA 已确认两个原生窗口均显示 Runtime 已连接，包内 runtime 自动启动已确认。原生截图受工具环境限制，视觉验收仍待补，详见证据文档。

## 验证

```powershell
pnpm test
# 另一个终端已运行 pnpm start，且两边 AGENT_TERMINAL_HOME 相同
node research/runtime-mcp-smoke.mjs
pnpm cli run "echo cli-ok"
```

smoke 使用 SDK 启动本仓库编译后的 MCP，检查 HTTP、两个独立 MCP 客户端、Unicode、退出码和取消。真实 Codex / Claude Code 均已在 Windows 经本仓库 MCP 返回 Git Bash `MINGW`、exit 0，并在 strict hook 下拒绝原生 Bash；详见[报告摘要](docs/research.md)。Windows 为已实测平台；Linux / macOS 当前仅有架构上的可移植设计，须等待 CI。

根 `pnpm test` 已通过 26/26（86 秒，含实际 35 MiB ConPTY 输出），生产构建通过；UI API 此前 4 项通过，本轮重跑结果另记。真实双 Agent 经安装器生成的用户级配置完成 MCP 调用、strict 拦截和卸载原文恢复，cwd 正确。桌面退出后 runtime health 仍返回 200，重开 GUI 可重新连接。

Provider 仅修改本机 Codex / Claude 配置，不配置 Codex Cloud 远端 secrets。CLI、备份恢复与限制见[使用指南](docs/usage.md)。最终便携包正在重新生成，最终路径以[证据记录](docs/research.md)为准。
