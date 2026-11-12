# 可复现研究与集成 smoke

脚本按仓库位置定位编译入口，不依赖开发者用户名或硬编码临时目录。模板中的 `<ABSOLUTE_REPO>` / `<ABSOLUTE_RUNTIME_HOME>` 必须替换；可用生成器避免手工替换。所有结果只适用于实际执行环境，不代替跨平台 CI。

## 自有 runtime / HTTP / 双 MCP 客户端

先在根目录运行 `pnpm install`、`pnpm build`，并在终端 A 执行 `pnpm start`。终端 B：

```powershell
node research/runtime-mcp-smoke.mjs
```

两终端使用相同的 `AGENT_TERMINAL_HOME`（未设置时使用 `~/.agentterminal`）。脚本不会启动 runtime。它用 MCP SDK 拉起两个独立 stdio 进程：`node dist/packages/mcp/src/index.js --agent research`，验证工具发现、共享任务、并发 Unicode 输出、exit 0 / 7、增量 offset、跨客户端取消，以及 HTTP 未授权拒绝、health、tasks、stats。失败返回非零；PASS 输出时间、环境、检查项和 task IDs。脚本只取消自己创建且仍在运行的任务，不清除历史，也不修改 Agent 全局配置。`mcp-gitbash-test.mjs` 作为兼容入口调用同一脚本，已不依赖 smart-terminal-mcp。

这是实际 runtime 集成 smoke，使用已经构建的 dist；先构建以避免测到旧代码。它不重启已有 runtime，所以不覆盖重启持久化或真实模型；源码测试 `pnpm test` 包含真实 ConPTY 并发、Unicode、退出、取消和重新打开历史数据库的检查，最终通过情况须以该次执行输出为准。`pnpm --dir apps/ui test` 为 UI 单元检查，不等于完整桌面验收。

最终根测试已通过 26/26（86 秒），UI API 重跑 4/4，runtime reviewer 11/11 通过，包含实际 35 MiB ConPTY 输出、32 MiB 日志上限、流式脱敏、prompt、Unicode 分页、子进程取消、崩溃与交互。公开 offset 为 UTF-16 code units，内部字节索引不改变接口单位。最终便携包为 `artifacts/AgentTerminal-1794393818214-win-x64/`，已验证包内 CLI Git Bash 执行成功；测试边界与原生截图限制见证据记录。

## 单独核对 Claude hook

准备一个绝对的临时 home，并用相同 home 在另一终端启动 runtime；在 Git Bash 中运行：

```bash
export AGENT_TERMINAL_HOME="$(cygpath -m "$(mktemp -d)")"
# 在另一终端用此相同值运行 pnpm start 后：
bash research/claude-e2e.sh
```

`prepare-config.mjs` 在显式选定的 home 生成 `research-mcp.json` 和 `research-claude-hooks.json`，使用当前 Node 与仓库的绝对路径；不会写入用户全局设置。`codex-hook.js` 为研究用 ESM hook，收到事件后写 `<home>/research-hook.jsonl` 并对已知原生工具名返回 deny；它不等同于生产 hook 的在线审计/离线放行策略。`claude-hooks.json` / `mcp.example.json` 仅是模板。Claude 需要已安装、已认证且网关可用，运行可能消耗模型额度；默认权限可能导致无头环境无法完成某些操作，应检查实际输出。

`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 仅可由调用者显式设置于当前进程进行对照研究；脚本不自动设置，不改全局 settings。早期超时与该变量之间只有 workaround 相关性，尚未证明精确网络/telemetry 根因。

## 真实双 Agent 研究

CI 排查：`node research/inspect-ci.mjs [RUN_ID]` 读取 GitHub Actions 各平台日志并保存到临时目录，不修改远端配置；`node research/pty-smoke.mjs` 在构建后执行真实 PTY 输出 / exit 7 冒烟检查。Linux 隔离验证可在 WSL / Linux x64 运行 `bash research/linux-ci-smoke.sh`，会在临时目录下载 Node、安装依赖并运行构建与全部测试，不复用 Windows 原生模块。macOS 专用回归会模拟 node-pty 打包缺失执行权限，检查 Runtime 自动修复并正确保留非零退出码。

本轮新增：`node research/ui-current-smoke.mjs` 启动独立临时配置 / Runtime 并创建示例任务，用于浏览器验证 Shell 配置与 Token 估算；Ctrl+C 关闭。`node research/github-repository.mjs` 非交互检查现有 GitHub 凭据权限，不输出凭据；`--apply` 更新仓库简介 / topics。

主流程提供的 `node research/agents-live.mjs` 会新建临时目录和自己的 runtime，再并行启动真实 Codex / Claude，生成 `<临时目录>/report.json`。它与上面的外部 runtime smoke 是不同生命周期。可用 `AGENT_TERMINAL_CODEX` 指定 Codex 可执行文件、`AGENT_TERMINAL_CLAUDE_ENTRY` 指定 Claude Node 入口；需先检查当前脚本及已安装 CLI 版本。

该专用研究脚本使用放宽审批/沙箱与 hook trust 的 CLI 参数，Claude 子进程设置上述 workaround 环境变量；这仅描述该研究进程，不是产品默认，也不修改全局配置。它的退出成功判断主要检查两个 Agent 的任务存在，不能单凭脚本 exit 0 就认定 strict 已通过；必须同时读 tasks 的状态/退出码、observations 的原生工具事件及模型输出中的 deny 原因。已确认结果见 [证据记录](../docs/research.md)。

## 安装器生成用户级配置的真实验证

构建后运行 `node research/installer-live.mjs`。脚本动态创建临时 runtime home、CODEX_HOME、CLAUDE_CONFIG_DIR，从已有本机目录复制必要配置/认证，由安装器安装 strict 集成，启动真实 Codex 与 Claude，最后卸载并比较复制前保存的 Codex config.toml / Claude settings.json 原文。无需硬编码临时目录，可执行文件覆盖变量与 agents-live 相同。

主流程本次执行已通过：两个 Agent 经安装器生成的用户级 MCP 运行成功、原生 Bash 被拒绝，任务 cwd 为正确临时项目目录，卸载后 `restored=true`。报告目录自动输出，每次不同。认证配置正文不打印，但临时目录含认证副本，Agent 输出/报告也可能含敏感信息；不要将该目录纳入版本控制。脚本使用研究所需的放宽权限参数和子进程 workaround 环境，不更改原用户配置，也不证明遥测根因。

本次遗留目录 `%TEMP%/agentterminal-installer-live-3tEa1k` 含认证副本与备份，需测试进程结束后由用户手工清理。自动审批拒绝了目录及显式文件删除（`blocked by policy`），未再重试；该限制属于测试环境，不是产品缺陷。目录未纳入 Git。
