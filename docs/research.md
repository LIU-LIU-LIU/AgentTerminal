# 调研结论(2026-11-11,Windows 11 实机)

## 环境
- Git Bash:`C:\Program Files\Git\bin\bash.exe`(5.2.37)。
- PATH 上的 `bash` 是 WSL 启动器(`uname` 返回 Linux),必须用绝对路径定位 Git Bash。
- `npm`/`claude` 的 `.ps1` 受执行策略限制,需用 `.cmd` 或 Git Bash 调用。
- Codex 0.167(hooks 特性默认开启),Claude Code 1.0.84。

## 实测结果
| 验证项 | 结果 |
|---|---|
| smart-terminal-mcp(node-pty)经 MCP 跑 Git Bash:流式输出、退出码 | 通过(`exit 3` 正确捕获) |
| Codex 经 MCP 调用 Git Bash | 通过 |
| Codex 原生命令 | 走 `pwsh -Command`,不经 MCP,需 hook 拦截 |
| Codex PreToolUse hook(项目级 `.codex/hooks.json`) | 收到 `tool_name=Bash` 与命令;返回 deny 后命令被阻止,原因回传模型 |
| Claude Code 无头 `claude -p` | 默认请求超时(网关直连 200 正常);设 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 后 3-5 秒正常返回 |
| Claude 经 MCP 调用 Git Bash | 通过,返回 `MINGW64_NT`,exit 0 |
| Claude PreToolUse hook | 通过。原生 `Bash` 被 deny,原因回传模型;hook 同时收到 `mcp__agentterm__terminal_run`,可区分 MCP 与原生调用。deny 输出格式与 Codex 相同(`hookSpecificOutput.permissionDecision=deny`) |
| Tabby + MCP | 未实测;插件依赖 Angular 15 与 Tabby 内部 API,SSE 传输 |

## 选型
- 不采用 Tabby/Wave:重,UI 被宿主绑定,与独立悬浮窗方案冲突。
- 参考 smart-terminal-mcp 的设计(node-pty 会话、后台任务、退出码解析、禁用 pager),不整体引入。
- 终端渲染用 xterm.js;自研外层:runtime、MCP、Hooks、安装器、悬浮窗 UI。

## 复现
- `research/mcp-gitbash-test.mjs`:需先克隆并安装 smart-terminal-mcp,在其目录运行。
- `research/codex-hook.js`:放入项目级 `.codex/hooks.json` 的 PreToolUse 命令中。

## 待办风险
- Claude 运行 runtime 相关测试时需带 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`(安装器可写入 settings 的 env)。
- 尚未测试:两个 Agent 并发写入同一 runtime;当前 smart-terminal-mcp 是每个 Agent 一个进程,无法共享会话,需自研 runtime 解决。
- Claude 模型曾把 MCP 工具名说成 `mcp__local__...`,以 hook 记录的真实 tool_name 为准。
- 用户级 hooks(`~/.codex/hooks.json`、`~/.claude/settings.json`)未实测,仅测了项目级与 `--settings`。

