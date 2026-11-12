# 调研与实测证据（2026-11-11）

## 2026-11-12：首次三平台 CI 失败排查

读取 [Actions run 43018188715](https://github.com/LIU-LIU-LIU/AgentTerminal/actions/runs/43018188715) 的全部平台日志，提交为 `02ce0fa`。macOS job 有 10 个失败，多个任务输出包含 `posix_spawnp failed.`；Windows、Ubuntu 的结论为 cancelled，是矩阵默认 fail-fast 在 macOS 失败后取消其他任务，并非 Windows 日志已证明卡死。

直接下载 npm 的 node-pty 1.1.0 发布 tarball 检查：`prebuilds/darwin-arm64/spawn-helper` 和 `prebuilds/darwin-x64/spawn-helper` 均为 mode 0644。macOS 的 node-pty 原生模块通过 posix_spawn 执行该辅助程序，缺少执行位会在 Shell 启动前失败。Runtime 现在查找实际加载二进制的配套 helper 并补齐执行位；专用 macOS 测试模拟 0644 后执行任务，验证输出和 exit 7。补权限失败会报告具体路径，不伪造任务成功。此 macOS 回归仍需远端 runner 执行，本机 Windows / Linux 不代替 macOS 验收。

Linux WSL 隔离安装后又复现间歇性末尾输出丢失：3000 行 Unicode 有时仅保留 2722 / 2729 行。对照直接 node-pty 持续读取为 3000 行；禁用 Unix socket pause 后连续 20 次检查通过。Unix 现在持续读取，IPC 队列保持串行和 64 MiB 序列化大小上限，超过上限明确失败；Windows 保留 pause / resume。上限容纳 32 MiB 保留日志规模的突发和消息开销，不代表 RSS 上限。额外 POSIX 回归连续执行 10 个突发任务验证末尾不丢失。

验证记录：Windows 完整后端 32 通过 / 1 macOS 专用项跳过，UI 4/4；最后调整队列上限后受影响的 helper / IPC / Shell 测试 6 通过 / 1 跳过。Ubuntu 22.04 WSL（独立 Linux Node 22.17.0、pnpm 10.33.0、全新原生依赖）完整构建通过，后端 32 通过 / 1 macOS 专用项跳过，UI 4/4；新增 POSIX 十次突发回归单独通过。保留原 3000 行完整性断言，没有通过减少输出或放宽断言规避失败。

工作流增加 `fail-fast: false`、15 分钟 job 上限与独立真实 PTY 冒烟步骤，让平台各自给出完整结果。复现工具见 research/README.md；WSL 只在 /var/tmp 创建隔离目录，未改系统 Node 或 Windows node_modules。本轮没有推送或重新触发远端 CI，不宣称 Actions 已全绿。

后续修改以 [current-status.md](current-status.md) 为准：Provider 功能已移除，桌面改为单窗口 Tab，新增 Shell 配置与终端 Token 估算；本轮后端回归 28/28。下文双窗口与 Provider 是历史记录，不代表当前产品范围。

本页区分源码事实、历史研究、真实 Agent 报告与验证边界。根测试 26/26、runtime reviewer 11/11、生产构建均通过。UIA 已确认两个原生桌面窗口均显示 Runtime 已连接，包内 Node runtime 自动启动及 GUI 退出后重连已确认；浏览器视觉通过，原生截图受工具环境限制。

## Windows 环境与早期观察

Windows 11，Git Bash 5.2.37，Codex 0.167 系列（真实报告显示 `0.167.0-alpha.4.1`），早期 Claude Code 1.0.84。PATH 上的 bash 曾指向 WSL；产品定位 Git for Windows 的实际 bash.exe。PowerShell 策略可能阻止 npm / pnpm / claude 的 `.ps1`，可用 `.cmd` 或已确认的 Node CLI 入口。

早期 smart-terminal-mcp 研究已观察到 Git Bash 流式输出、exit 3 与 Agent MCP 调用；它不是本仓库实现的验收。Tabby + MCP 未实机验证，因宿主耦合和独立窗口需求未采用。当前选择及替代方案理由见 [ADR](architecture.md)。

Claude 无头请求曾超时，而网关直连返回 200；在部分运行中设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 后约 3–5 秒返回。这只能支持 workaround 的相关性，不能证明 telemetry / 非必要流量是精确根因，也不能排除网络、版本、重试或其他因素。产品不应自动更改全局环境或 settings；研究对照应显式记录子进程环境。

Windows 调试中还观察到 node-pty / ConPTY worker 退出挂住；当前实现已采用独立 PTY helper 子进程和 Windows `taskkill /T /F` 取消修复。该工程修复与 Claude 请求超时是两个独立观察，不混为同一根因。

## 本仓库真实双 Agent：通过

已读取主流程生成的 `%TEMP%/agentterminal-live-IcPOrV/report.json`，时间 `2026-11-11T10:24:45.532Z`，来自 `node research/agents-live.mjs`。临时路径只是本次证据位置，不是复现所需路径；重新运行会生成新目录。

| 项目 | 报告证据 |
|---|---|
| Codex → 自有 MCP → Git Bash | Agent 进程 exit 0；task `b496529f-874c-445d-bb2a-47f7a15bca63`，status ok / exit_code 0；输出 `AgentTerminal-live`、`MINGW64_NT-10.0-26200` |
| Claude → 自有 MCP → Git Bash | Agent 进程 exit 0；task `bb604e20-9c76-4afc-a4d9-fa20dad61b96`，status ok / exit_code 0；相同 Git Bash 标识 |
| Codex strict 原生工具拦截 | observations 收到 `tool=Bash`、PreToolUse；日志明确 `Command blocked by PreToolUse hook`，模型报告未绕过 |
| Claude strict 原生工具拦截 | observations 收到 `tool=Bash`、PreToolUse；输出明确 native Bash denied，原因是使用 AgentTerminal MCP |
| MCP 与原生调用区分 | 两者均记录 `mcp__agentterminal__run` 与独立原生 `Bash` 事件 |

本次早期报告使用临时项目 hook 与研究进程的 CLI 参数，并沿用已有 provider / 认证。用户级安装器与 cwd 的后续实测已通过，见下节；所有工具名、PostToolUse、所有版本和完整 UI 仍不在此报告的证明范围。原始报告含本机路径、模型和 CLI 日志，不整份复制进仓库。

Windows hook 的关键经验：Codex 调用由 PowerShell 解析，绝对路径可执行文件前需要 `&`；Claude 使用 Bash 的引号命令形式。安装器已修复并经后续真实用户级配置实测。MCP 将未显式设置的 cwd 默认传为 MCP 的 `process.cwd()`；后续报告已确认任务落在正确临时项目目录。

## 安装器生成用户级配置：真实双 Agent 通过

主流程 `node research/installer-live.mjs` 返回 exit 0，报告 `%TEMP%/agentterminal-installer-live-3tEa1k/report.json` 已核对。脚本为 Codex 与 Claude 使用一次性的隔离 home，将所需已有认证/本机配置复制到临时目录，不打印认证配置正文；由真实安装器生成 strict 用户级 MCP / hooks，再启动两款真实 Agent。

两者均发现 MCP，执行 `echo installer-live; pwd`，任务 status ok / exit_code 0；两者原生 Bash 均被 strict 拒绝。任务 cwd 为临时项目路径，证明这次构建的 MCP 默认 cwd 传递生效。卸载后报告 `restored=true`，脚本对复制前记录的 Codex config.toml 与 Claude settings.json 原文作精确比较通过；不把这项断言扩大为所有可能配置文件/编辑冲突的恢复证明。

此次使用一次性配置目录，未更改原用户 home；临时认证副本与研究报告仍可能含敏感内容，不应提交仓库。相关 CLI 噪声与插件同步警告不作为产品失败证据，也不复制进本页。研究脚本的权限放宽和 workaround 环境仅作用于本次子进程，不代表产品默认或精确 telemetry 根因。

本次 `%TEMP%/agentterminal-installer-live-3tEa1k` 仍含测试复制的认证配置及安装器备份，未纳入 Git。自动审批以 `blocked by policy` 拒绝删除该临时目录，即使改为显式文件列表仍被拒绝；未继续重试。请在测试进程结束后手工核对并清理该目录（可在资源管理器地址栏输入上述路径）。这是本次测试环境的清理限制，不是产品运行问题。用户按实体 Escape 停止 GUI 自动化后未恢复操作。

## 最终验证与范围

- 根 `pnpm test` 26/26 通过，覆盖真实 ConPTY 并发、Unicode、非零退出、取消、历史持久化，以及 HTTP 与两个独立 MCP 客户端集成。
- 新增 `node research/runtime-mcp-smoke.mjs` 使用 SDK 启动 `dist/packages/mcp/src/index.js --agent research`，依赖已运行的 runtime 与相同 connection home，测试 HTTP / 双客户端 / Unicode / exit / cancel。运行方法见 [research/README.md](../research/README.md)。本次普通 Node 启动器下执行通过，详情如下。
- 主流程已确认浏览器在临时 Codex home 的接入安装/卸载、监控中文终端日志和统计截图；UI API 4 项测试通过。另已读取终端 prompt，通过 POST input 输入后读到 `received:hello-ui`，确认输入到任务输出的交互链路。该 HTTP 验证不等同于桌面键盘输入或桌面视觉验收。
- 主流程确认 Windows 桌面 release 编译成功，用时 1 分 32 秒。最终便携产物为 `artifacts/AgentTerminal-1794393818214-win-x64/`，180.3 MiB，含 AgentTerminal.exe、node.exe、runtime/UI 与生产依赖及模块自带许可证。已核对目录与固定直接依赖版本；主流程确认最新版 exe 自动启动包内 runtime、连接 home 为 `agentterminal-final-d69ef…`，health ready。包内 CLI 输出 `portable-runtime-ok`，`uname` 返回 MINGW、exit 0。
- UIA 已确认配置、监控两个原生窗口均显示 Runtime 已连接。CUA 截图只显示壁纸，窗口激活失败且无法取得坐标几何信息，属于当前工具环境限制，不记为原生截图视觉验收通过。用户通过实体 Escape 停止 Computer Use 后未继续 UI 操作；浏览器截图验证已通过，不能将其扩大为原生 UI 控制验收。
- 主流程确认隔离目录下 installer/hooks 共 14 项测试通过，包含 Codex、Claude Code 本机 provider 配置。新 backend 的浏览器 Claude provider 保存验证成功，模型、URL、has_key 正确且无 alert。本机配置写入通过不等同于新增 provider 的真实推理验证，也不涉及远端 Cloud secrets。
- CLI `pnpm cli run "echo cli-ok"` 已由主流程实测，输出 cli-ok、exit 0；支持 run/start/list/stats/status/read/write/kill，使用已运行 runtime 的 connection home。
- 主流程最终 `pnpm test` 为 26/26 PASS，用时 86 秒，包含实际 35 MiB ConPTY 输出测试；生产构建通过。runtime reviewer 单独 11/11 PASS，覆盖 32 MiB 输出上限、流式秘密、prompt、Unicode 分页、子进程取消、崩溃与交互。UI API 最终重跑 4/4 PASS。
- 公开输出 offset 最终保持 UTF-16 code units，内部使用有界字节索引读取日志。未完成尾部 token 会延迟发布，超过 65536 字符的行省略；脱敏模式并非完整保密保证，PTY 换行可能影响匹配。通过压力测试不扩大为无限输出、所有秘密或所有平台均受保证。
- 桌面生命周期已实测：停止第一个桌面 exe 后，同一包内 runtime health 仍返回 200；再次启动 GUI 成功重新连接。最终包的直接生产依赖固定为本机已安装版本，模块 LICENSE 文件随生产依赖保留；不扩大为传递依赖完全可重复解析或全面许可证审计的结论。
- Linux / macOS 当前只具备架构上的移植路线，尚无本项目对应平台实测或 CI 通过证据。

官方 Codex 配置参考已于本次文档更新时读取：<https://developers.openai.com/codex/config-reference/>。它说明本机 `model_provider` / `model_providers` 与 hooks 配置，但本机 provider 编辑不代表配置 Codex Cloud 的远端 secrets；CLI hooks 的实际兼容性仍按上述版本与事件证据陈述。

## SDK smoke 本次执行证据

时间 `2026-11-11T10:29:55.426Z`，Windows `win32`、Node `v22.17.0`，结果 `PASS`。使用独立临时 runtime，home 为系统临时目录动态生成；不修改用户 Agent 配置。SDK 启动两个独立的本仓库 stdio MCP，agent 均为 research。

检查通过：HTTP 无 token 返回 401、认证后 health/tasks/stats 可读；两客户端发现全部工具、并发 Git Bash 任务不混输出、中文保留、成功 exit 0 / 失败 exit 7、返回 offset 后增量读取为空、另一客户端可取消任务并查询同一任务列表。

任务 ID：`28d5c8ca-21ac-46b3-a117-a066a62e5ed6`、`33544662-aece-4ade-9b22-e81b2b4737c1`、`53365395-ed86-444a-bd8f-5e7820aa124e`。此 smoke 不覆盖真实模型、重启持久化、UI 或所有平台。

首轮辅助启动器使用 `node --input-type=module`，fork helper 继承该启动选项后任务报告 abnormal；改用普通 Node 启动器后上述检查通过。不要在加载文件入口的 fork 测试中继承这种仅适用于 eval/stdin 的启动选项；标准复现仍是先 `pnpm start`，再单独运行 smoke。
