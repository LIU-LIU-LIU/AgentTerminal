# 运行与接入指南

本文按当前源码说明。Windows 已有实机验证；Linux / macOS 支持仍需 CI，不视为已交付平台。

## 构建、启动与停止

在仓库根目录运行 `pnpm install`、`pnpm build`、`pnpm start`。`pnpm build` 同时编译 backend 与 UI；只调试 backend 可用 `pnpm build:backend`，但浏览器 UI 仍需要单独构建。Node 建议使用已实测的 22 系列；pnpm 版本由根 package.json 指定。node-pty 与 better-sqlite3 为原生模块，更换 Node 后应重新安装/构建原生依赖。

`pnpm start` 在后台启动 runtime，重复执行会复用健康实例并显示带 `#token=…` 的地址。CLI、Hooks 和 MCP 需要事先运行 runtime；Tauri 桌面外壳也可自动启动。CLI 入口为 `dist/packages/runtime/src/cli.js`，根目录可通过 `pnpm cli` 调用。

runtime 监听 `127.0.0.1`，首次启动生成随机端口和 token，保存于 `connection.json`。`pnpm stop` 停止并取消任务；`pnpm run restart` 重启并保留连接地址及历史，供界面恢复连接。完全停止后再次启动会生成新连接。服务在后台运行，启动命令退出或 Ctrl+C 不停止它。界面顶部提供“重启服务”和“完全退出”；有活动任务时提示确认。桌面完全退出会关闭自身窗口，浏览器显示已停止。

## 数据与 Shell

| 设置 | 当前行为 |
|---|---|
| `AGENT_TERMINAL_HOME` | runtime、MCP、Hooks 共用的数据目录；默认 `~/.agentterminal`，建议显式绝对路径 |
| `AGENT_TERMINAL_BASH` | 显式指定 Git for Windows 的 `bin/bash.exe`；不应使用 PATH 上可能指向 WSL 的 bash |
| `CODEX_HOME` | Codex 用户目录，默认 `~/.codex` |
| `CLAUDE_CONFIG_DIR` | Claude 配置目录，默认 `~/.claude`；该变量设置时 MCP 文件为该目录下 `.claude.json`，未设置时为 `~/.claude.json` |

例如隔离运行（第二个终端也设置相同值）：

```powershell
$env:AGENT_TERMINAL_HOME = Join-Path $env:TEMP 'agentterminal-manual'
$env:AGENT_TERMINAL_BASH = 'C:\Program Files\Git\bin\bash.exe'
pnpm start
```

默认 `shell=gitbash`，显式支持 `pwsh` 和 Windows `cmd`，不按命令内容自动转换语法。pwsh 优先 PowerShell 7，缺失时回退 Windows PowerShell。Git Bash 使用 `--noprofile --norc`，普通任务另加 `-c`；不继承用户 shell 初始化脚本。runtime 设置 pager 为 cat、UTF-8 与 `MSYS_NO_PATHCONV=1`。Git Bash 不等于完整 Linux 环境。

MCP 的 `cwd` 未填写时由 MCP 进程的 `process.cwd()` 传给 runtime，即通常为启动该 MCP 的 Agent 工作目录；显式 `cwd` 优先。直接 HTTP 提交未设置 cwd 时则用 runtime 的工作目录。最新隔离用户级安装器实测中，两款真实 Agent 的任务 cwd 均为临时项目目录，已确认该默认行为。

## CLI 提交与查询

先完成构建并在另一终端运行 `pnpm start`，两边使用相同的 `AGENT_TERMINAL_HOME`。在仓库根目录运行：

```powershell
pnpm cli run "echo cli-ok"
pnpm cli start "sleep 30" --shell gitbash --agent manual
pnpm cli list
pnpm cli stats
pnpm cli status TASK_ID
pnpm cli read TASK_ID
pnpm cli read TASK_ID RETURNED_OFFSET
pnpm cli write TASK_ID "hello"
pnpm cli kill TASK_ID
```

将 TASK_ID 与 RETURNED_OFFSET 换成实际返回值。`run` 持续打印输出直至任务结束，成功返回 0，非零退出/异常或请求错误返回非零；`start` 立即返回任务 JSON。run/start 支持 `--cwd`、`--shell`、`--agent`、`--session`，默认 cwd 为 CLI 当前目录。`read` 等查询返回 JSON，始终复用返回的 offset。`write` 不自动加换行，PowerShell 提交一行可用下例。Ctrl+C 退出 CLI 不等于已取消 runtime 中的任务，取消应显式调用 kill。主流程已实测 `run "echo cli-ok"` 输出正确、exit 0。

```powershell
pnpm cli write TASK_ID "hello`n"
```

## 桌面窗口与界面

配置中心：选择 prefer / audit / strict 后点击“一键接入”或“应用模式”，管理 MCP、Hooks、全局说明与 Skill；可以预览配置、卸载接入、设置默认 Shell 与路径。Provider 不在管理范围。

监控与统计：展示近期任务、按 Agent/运行状态过滤及命令/目录/ID 搜索；xterm.js 显示终端输出，运行中可输入、调整终端大小、终止任务；显示累计任务、运行中数量、失败、Hook 数量以及 Agent / Shell 分组耗时统计。

桌面主窗口为 main，配置与监控通过 Tab 切换；侧栏底部的按钮管理服务生命周期。点击主窗口的关闭按钮只是把它收到系统托盘：后台服务、正在运行的任务和悬浮窗都保持不变。单击托盘图标重新打开主窗口；右键菜单有“打开主窗口”和“完全退出”，后者与侧栏的完全退出相同，有运行中的任务时先确认，再停止服务并退出程序。

悬浮窗：监控页右上角的“悬浮窗”按钮或配置中心“界面”开关控制，默认开启。桌面端是一个置顶的透明小窗口（label 为 float），默认出现在屏幕右下角，每个正在工作的 Agent 一张卡片，最多三张。每个 Agent 优先显示最早启动且仍在运行的任务，避免后来完成的短命令遮住后台长任务；全部运行中任务可在主窗口查看。标题显示 Agent、Shell 和该任务的实时耗时，超过一小时也显示秒数；第一栏是命令，下方是该任务的只读流式输出。计时表示任务运行时长，不是本次输出块的耗时。

没有运行中的任务约 10 秒后自动折叠，无需先贴边；鼠标移上窄条展开预览、移开再次收起，新任务出现时自动展开。终端输出会以流式动画逐帧显示，命令输入也会有短暂的逐字展示；记录内容和主终端保持一致。结束任务只短暂保留约 12 秒供预览，之后显示等待状态，不再一直展示旧任务。按住拖动，靠近屏幕边缘自动吸附且不会移出工作区；多张卡片向屏幕内侧排开（贴右侧时新卡片出现在左边）。双击卡片打开主窗口（已收到托盘时会重新显示），定位到卡片所显示任务的终端，同时清除筛选和搜索。位置保存在本机。浏览器弹出小窗也支持内容折叠和自动展开，但不具备原生窗口置顶、吸附或自动改变系统窗口尺寸。

终端外观：配置中心“终端外观”选择配色方案、字号、光标样式和字体，对监控终端和悬浮窗立即生效。默认“跟随 IDE”：桌面端读取最近使用的 VS Code 系编辑器（VS Code、Cursor、Windsurf、VS Code Insiders、VSCodium、Trae）用户 settings.json 中的 `workbench.colorTheme`、`workbench.colorCustomizations` 的 `terminal.*` 颜色以及终端字体与字号，主题名映射到最接近的内置配色；浏览器模式或未找到 IDE 配置时使用与界面深浅一致的 Dark Modern / Light Modern。界面主题（深色 / 浅色 / 跟随系统）、终端外观和悬浮窗开关保存在界面本地存储，不写入 Runtime。

浏览器使用 runtime 自带静态资源最直接。`pnpm dev:ui` 仅启动 Vite，不启动 backend；先启动 runtime，再启动 Vite，使用 `http://localhost:1420/#token=实际token`。Vite 在启动时读取相同 home 的 connection.json 作为 `/api` 代理目标，也可设置 `AGENT_TERMINAL_RUNTIME_URL`，缺省兜底为端口 4317；runtime 换端口后需重启 Vite。

桌面开发用 `pnpm desktop`，先完成 backend 构建，建议先 `pnpm start`，并继承相同 home。Tauri 默认打开一个窗口，内含配置与监控 Tab，先读取连接；未发现可用连接时会尝试启动独立 Node runtime。可用 `AGENT_TERMINAL_NODE` / `AGENT_TERMINAL_RUNTIME_ENTRY` 指定 Node 与编译入口，启动日志为 `<home>/desktop-runtime.log`。便携目录优先查找旁边 `runtime/node.exe` 和 backend。Windows release 编译成功，UIA 已确认两个原生窗口均显示 Runtime 已连接，包内 Node runtime 自动启动已确认。原生截图因当前 CUA 环境的窗口激活与坐标获取限制仍未完成视觉验收；浏览器截图已验证。

便携打包可执行 `pnpm desktop:build` 后 `pnpm package:portable`，对应 `node scripts/package-portable.mjs`。最终目录为 `artifacts/AgentTerminal-1794393818214-win-x64/`，大小 180.3 MiB，含 `AgentTerminal.exe`、`runtime/node.exe`、编译后的 runtime/UI 与生产依赖（含原生模块）。运行 `AgentTerminal.exe` 即可使用包内 Node 自动启动 runtime；已实测包内 CLI 输出 `portable-runtime-ok`、`uname` 返回 MINGW、exit 0。Git for Windows 与 WebView2 仍是外部前提。

打包脚本从本机已安装模块读取直接生产依赖的精确版本，再用 npm 安装；这不代表每次重新解析传递依赖都逐字节一致。模块自带 LICENSE 文件保留在 `runtime/node_modules` 中。集成会记录包内绝对路径，移动/删除前应先卸载接入，放到稳定位置再重新安装。当前 Tauri `bundle.active=false`，不是 MSI/NSIS 安装包。单独运行包内 CLI 时，仍须使用运行中 runtime 的相同 home，例如在仓库根目录：

```powershell
& './artifacts/AgentTerminal-1794393818214-win-x64/runtime/node.exe' './artifacts/AgentTerminal-1794393818214-win-x64/runtime/dist/packages/runtime/src/cli.js' run 'echo portable-runtime-ok; uname -s'
```

## 接入模式与配置文件

| 模式 | 当前行为 |
|---|---|
| prefer | 安装 MCP、托管说明区块和 Skill，引导优先使用 |
| audit | 同上，追加 PreToolUse / PostToolUse Hooks 记录支持的事件 |
| strict | 同上；成功记录 PreToolUse 后，对精确工具名 `Bash`、`shell`、`exec_command` 返回 deny |

Hooks 不转发原生命令去 runtime，也不获取其逐字节 PTY 输出。runtime 不可用或输入无效时采用 fail-open：允许执行，尽力写入 `unobserved.jsonl` 并输出 stderr；strict 并非安全沙箱或不可绕过的系统策略。配置状态只表示配置存在，不证明 Agent 已加载或 hooks 生效；重启 Agent 后用真实调用核对。

安装器管理 Codex `config.toml` 中的 `mcp_servers.agentterminal`、`hooks.json`、`AGENTS.md` 托管区块与 `skills/agentterminal/SKILL.md`；Claude 对应 `.claude.json` 中 MCP、`settings.json` hooks、`CLAUDE.md` 托管区块与同名 Skill。它保留无关配置。preview API 支持 `?agent=codex&mode=strict`，UI 按所选模式预览与提交安装。

Windows 实测 Codex hook 通过 PowerShell 调用，需要 `& "绝对路径/node.exe" "绝对路径/cli.js" …`；Claude hook 通过 Bash 调用，使用 `"绝对路径/node.exe" "绝对路径/cli.js" …`。不能将同一条命令字符串不加区分地用于两者。以最终安装器生成结果和真实调用为准。

## Shell、终端 Token 与能力边界

配置中心的“执行 Shell”提供默认 Shell 与各可执行文件绝对路径；留空自动检测。新任务继承默认值，MCP shell 参数可显式覆盖。默认本机 Git Bash；pwsh 优先 PowerShell 7，不存在则回退 Windows PowerShell。不会自动改写不同 Shell 的命令语法。

Provider / 模型 / 密钥管理已移除，交给 cc-switch 等工具；已有 Provider 配置保留。本项目不配置 Codex Cloud 远程环境。

监控所选任务显示终端文本输入 / 输出 Token 估算。输入含初始命令及后续终端写入，输出按保留日志；英文等约 4 字符 / token，CJK 约 1 字符 / token，尽力忽略 ANSI。按脱敏文本估算，不是模型 tokenizer 或实际 API usage；ANSI 跨输出块、终端协议响应、PTY 回显、折行与截断会影响结果。旧任务没有完整输入记录时显示未知，不伪造 0。估算写入 SQLite，重启保留。

桌面改为单个 main 窗口，监控和配置在同一窗口切换；历史双窗口验收记录仅描述旧版行为。

## 备份、卸载与恢复

配置写入前若目标已存在，安装器保存原文到 `<home>/backups/*.bak`，`index.jsonl` 记录原路径、备份路径和时间；写入使用同目录临时文件与 rename。`installer.json` 保存托管状态。新增文件没有旧版本备份，跨多个文件写入不构成数据库式事务。

优先通过配置中心“卸载接入”恢复托管内容。未改动的安装快照可恢复原文；用户后来修改的文件则尽量只移除仍匹配的托管内容，避免覆盖后续编辑。卸载接入不会自动撤销独立的 provider 设置，也不会删除任务历史。必要时手工恢复：

```powershell
$runtimeHome = if ($env:AGENT_TERMINAL_HOME) { $env:AGENT_TERMINAL_HOME } else { Join-Path $HOME '.agentterminal' }
$records = Get-Content (Join-Path $runtimeHome 'backups/index.jsonl') | ForEach-Object { $_ | ConvertFrom-Json }
$records | Select-Object path, backup, created_at
# 核对选中的记录后执行；先为当前目标另存副本，避免覆盖后续编辑。
# Copy-Item -LiteralPath $selected.backup -Destination $selected.path
```

完整数据备份应先停止 runtime、等待任务结束，再复制整个 runtime home 与相关 Agent 配置目录。数据包括 `history.sqlite`（以及可能存在的 WAL/SHM）、`logs/`、`installer.json`、`backups/` 与未观测记录。JSONL export 仅导出任务元数据，不是完整备份。

恢复时保持 runtime 停止，将数据和配置恢复到对应位置；不要复用旧 `connection.json` / `runtime.lock`，确认原 PID 已不再运行后才移走残留连接和锁文件，再启动生成新连接。迁移仓库或 Node 路径后重新预览/安装 MCP 与 hooks，因为配置中记录绝对路径。Windows 的 Unix mode 位不等于完整 ACL 加固；备份与日志须按本机权限妥善保管。

## MCP 工具与剩余限制

`start` 立即返回 task_id；MCP `run` 最多等待约 10 秒，超时后继续使用同一 ID 调用 `status` / `read`，不要重复提交。`read` 的公开 offset 单位为 UTF-16 code units（JavaScript 字符串长度单位），内部用分段字节索引有界读取 UTF-8 日志，每页最多读取 65536 字节并保持字符边界。始终复用返回的 offset；`more=true` 时继续分页，不将字节位置当公开 offset。`write` 输入含换行可提交，`kill` 取消任务，`list` 列出近期任务。交互 Git Bash 使用 `interactive=true`：先执行传入的初始 command，再继续接受后续输入。

- 当前并发上限 32，任务列表最多 500 条，UI 搜索范围为已加载记录；没有全历史分页、保留期限、历史日志轮转或总磁盘配额。单任务输出上限 32 MiB，超过 65536 个字符的行会省略并标记，不能承诺无限完整保留。
- `session` 是元数据标签，不代表跨任务复用同一个 shell。重启只保留历史，不恢复活动 PTY；原 running 记录标记 abnormal。
- 状态有 running / ok / failed / cancelled / abnormal；PTY 输出可能包含 ANSI 控制序列。流式脱敏会延迟未完成的尾部 token，故部分无换行输出可能稍后出现；PTY 自动换行可能影响模式识别。脱敏为尽力匹配，不保证所有秘密均可识别，Hook 离线原始记录也需按敏感数据处理。
- runtime reviewer 11/11、根 `pnpm test` 26/26 均通过，覆盖实际 35 MiB ConPTY 输出及 32 MiB 上限、流式秘密、prompt、Unicode 分页、子进程取消、崩溃与交互；这些结果不等于所有脱敏场景或长期运行无缺陷。
- 终端 prompt 读取、POST input 与 `received:hello-ui` 回显已由主流程验证；这确认 API 输入输出链路，桌面键盘输入与界面视觉验收仍待补。
- runtime 有 SSE API，当前 UI 主要轮询任务与输出；不将其描述为已验证的 WebSocket 流。
- JSONL 导出为任务元数据；审计不涵盖所有外部进程，也不保证不支持 hook 的工具被拦截。
- Windows PTY helper 隔离及 taskkill 的退出/取消修复已通过本轮测试。已验证桌面 exe 退出后同一包内 runtime health 返回 200，GUI 重启后重新连接；关闭 UI 不停止 runtime。两个原生窗口经 UIA 确认已连接，浏览器视觉通过；原生截图受环境工具限制。长期压力、更多崩溃场景及 Linux / macOS CI 尚无验收结论。
