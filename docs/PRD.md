# AI Agent 专用终端：竞品调研与产品方案

> 历史方案，保留用于追踪产品目标，不作为当前实现或验收清单。现已选择独立 Node.js / TypeScript runtime、React + xterm.js、Tauri 桌面外壳，不再优先推进 Tabby Fork。下文结构化进程执行器、持久会话、全历史搜索、一键恢复等属于需求，不能据此认定已实现。当前行为、架构和证据见 [usage.md](usage.md)、[architecture.md](architecture.md)、[research.md](research.md)。Windows 实测、根测试 26/26 与浏览器视觉通过；原生窗口连接已由 UIA 确认，原生截图受工具限制。Linux / macOS 仅有待 CI 的可移植架构。

我的初步结论是：这个项目值得做，但不值得从零开发终端模拟器。

你的需求实际上不是再造一个 Windows Terminal，而是开发一个专门为 AI Agent 服务的 统一命令执行、实时监控与审计平台。

它需要解决三个核心问题：

1. 统一执行环境：Windows 默认使用 Git Bash，减少 Codex、Claude Code 反复尝试 CMD、PowerShell、Bash 语法的问题。
2. 执行过程透明：AI 每执行一条命令，都能看到命令内容、实时输出、运行时长、退出码以及所属 Agent。
3. 自动接入 Agent：安装后能够为 Codex 和 Claude Code 配置使用说明及工具接口，让它们优先通过你的软件执行命令，而不是各自调用不可见的终端工具。

这里有一个关键的技术区别：

AI 在终端窗口里运行，与 AI 将命令交给你的终端软件运行，是两回事。

如果只 Fork 一个现有终端，Codex 和 Claude Code 仍可能直接通过自身的 Shell 工具执行命令，你的终端窗口根本看不到。

所以这个产品真正需要构建的是：

终端界面 + 命令执行服务 + Agent 接入层。

其中，命令执行服务是核心，终端界面只是其中一个客户端。

## 一、现有产品调查

查到几个非常接近你需求的开源项目，尤其值得关注 Tabby MCP Server、Wave Terminal 和 ccdeck。

| 项目                                                                                                                                                     | 已有能力                                         | 尚未覆盖的需求                            | 适合程度        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------- | ----------- |
| [Tabby](https://github.com/Eugeny/tabby?utm_source=chatgpt.com) + [MCP 插件](https://github.com/thuanpham582002/tabby-mcp-server?utm_source=chatgpt.com) | Windows/Git Bash、AI 通过 MCP 在终端中执行命令、获取输出和退出码 | 统一审计、统计和自动配置仍需扩展                   | 非常高         |
| [Wave Terminal](https://github.com/wavetermdev/waveterm?utm_source=chatgpt.com)                                                                        | Windows/macOS、Git Bash、命令区块、AI 集成、终端输出       | 需要增加独立 Agent 命令执行服务                | 高           |
| [ccdeck](https://ccdeck.dev/?utm_source=chatgpt.com)                                                                                                   | 实时监控 Codex 和 Claude Code、工具调用、耗时、失败统计        | 只监控，不统一执行 Shell                    | 很高，适合参考监控功能 |
| [smart-terminal-mcp](https://github.com/pungggi/smart-terminal-mcp?utm_source=chatgpt.com)                                                             | 跨 Agent 的持久 PTY、交互式命令、长任务输出读取                | 缺少完整的可视化监控前端                       | 高           |
| [Warp](https://www.warp.dev/?utm_source=chatgpt.com)                                                                                                   | Windows/macOS、Git Bash、命令区块、AI 功能            | 不适合作为开源 Fork 基础，外部 Agent 执行链路需另行实现 | 中           |

这些判断基于项目当前公开文档，并非全部经过 Windows 实机验证。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+5



### 最值得优先测试：Tabby + MCP

它已经支持一条非常接近你目标的链路：

Codex / Claude Code

MCP 调用

Tabby MCP Server

Tabby Terminal · Git Bash

真实终端、命令执行、实时显示

输出与退出状态返回 Agent

Tabby MCP 插件已经提供终端会话发现、执行命令、读取缓冲区、长输出分页和退出码解析功能，甚至在 README 中包含 Codex 与 Claude Code 的连接说明。它采用 MIT 许可证。不过插件的本地构建脚本主要针对 macOS，Windows 安装和稳定性仍需验证。

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub+1



这意味着你可能不需要自己实现第一版终端。 直接 Fork Tabby，或者先开发一个 Tabby 插件，都有机会快速验证产品。

另一个重要发现是 ccdeck：它已经能在 Windows 上监控 Codex 和 Claude Code，展示命令、调用耗时及失败次数，但不承担执行命令的职责，也不保存完整命令输出。它非常值得作为审计仪表盘的产品参考。

[image](https://www.google.com/s2/favicons?domain=https://ccdeck.dev\&sz=32)

ccdeck+1



所以我暂时没有发现一个可以确认完全满足所有要求的成熟单品，但 已有开源组件足以覆盖相当大一部分功能。

## 二、建议的产品架构

建议把产品设计为一个本地服务，而不是依赖某个终端窗口存在才能工作。

Codex

MCP / Hooks

Claude Code

MCP / Hooks

统一执行请求

Agent Terminal Core

命令调度与执行

PTY 会话管理

日志与审计

状态和统计 API

Git Bash

默认

PowerShell

按需

CMD

兼容

可视化桌面客户端

实时输出 · 退出码 · 命令历史 · 多 Agent 统计 · 终止任务

技术上的建议：

- 默认通过 Git for Windows 的 `bash.exe` 执行 Bash 命令，但不将 Git Bash 当成完整 Linux。它没有完整的 Linux 系统工具链。
- PowerShell、CMD 通过显式 `shell` 参数选择，不建议通过识别命令内容随意自动切换。
- 普通命令使用可结构化管理的进程执行器，交互式命令使用 PTY。
- 核心服务独立于界面运行，关闭 UI 后，已有任务是否继续运行由用户配置。
- 未来 macOS ARM64 可更换 Shell/PTY 实现，保留 MCP、日志和前端协议。

这套架构还能避免一个常见问题：Agent 发起的长任务不应该因为 MCP 请求超时而直接丢失。 应返回任务 ID，允许 Agent 和 UI 分别查询或订阅输出。

## 三、Codex 和 Claude Code 的自动接入

这部分是产品成败的关键，不能只依赖提示词。

两者目前都有 MCP 和 Hooks 支持，因此可以设计成两种模式：

| 模式     | 实现方法           | 效果                              |
| ------ | -------------- | ------------------------------- |
| 优先使用模式 | MCP + 全局提示词    | AI 优先使用你的终端，但可能绕过               |
| 审计增强模式 | MCP + Hooks    | 对经过支持的原生工具调用也记录事件               |
| 严格模式   | MCP + Hooks 拦截 | 对支持拦截的原生命令执行工具进行阻止，引导 AI 改用 MCP |

尤其要注意，Hooks 可以监控工具调用开始和结束，但通常不能直接取得原生命令执行过程中的逐字节实时输出。真正的实时输出仍应由你的执行服务获取。

[image](https://www.google.com/s2/favicons?domain=https://learn.chatgpt.com\&sz=32)

ChatGPT Learn+2



建议安装器支持以下全局配置路径：

| Agent             | 配置位置                      |
| ----------------- | ------------------------- |
| Codex             | `~/.codex/AGENTS.md`      |
| Codex MCP         | `~/.codex/config.toml`    |
| Codex Hooks       | `~/.codex/hooks.json`     |
| Claude Code       | `~/.claude/CLAUDE.md`     |
| Claude Code Hooks | `~/.claude/settings.json` |
| Claude Code MCP   | 用户级 MCP 配置，通过 CLI 管理      |

这些是默认路径，需要识别 `CODEX_HOME`、`CLAUDE_CONFIG_DIR` 等自定义位置，而不是硬编码。配置时必须保留已有内容、先备份、支持卸载恢复。

[image](https://www.google.com/s2/favicons?domain=https://learn.chatgpt.com\&sz=32)

ChatGPT Learn+2



## 四、简短产品需求文档（可交给其他 Agent）

# Agent Terminal — MVP 产品需求文档

## 1. 产品定位

为 Windows AI Coding Agent 设计的统一终端执行与可观测平台。

目标是不重新实现终端模拟器，而是复用成熟的终端组件，使 Codex 和 Claude Code 能通过同一执行服务运行命令，并让用户实时掌握执行过程。

第一版支持 Windows x64，架构预留 macOS ARM64。

## 2. 核心功能（P0）

**F1. 统一 Shell**

- 默认使用 Git for Windows 的 Git Bash。
- 自动检测 Git Bash 安装位置。
- 支持按需显式调用 PowerShell 和 CMD。
- 统一工作目录、环境变量、路径转换及命令执行接口。
- 不擅自把 Bash 命令改写为 PowerShell 命令。

**F2. AI 命令执行**

- 提供 MCP Server，允许 Codex、Claude Code 调用。
- 提供 CLI 接口，供其他 Agent 或脚本使用。
- 支持普通命令、长任务及持久交互式会话。
- 每项任务分配唯一 ID，支持启动、读取输出、查询状态、发送输入和终止。
- 命令退出时返回实际退出码；异常终止单独标记。

**F3. 实时监控界面**

- 显示 Agent、所属项目、执行命令、Shell、工作目录和启动时间。
- 实时流式展示命令输出。
- 显示运行中、成功、失败、取消等状态。
- 显示运行时长、退出码、进程 ID。
- 支持多个 Agent 同时执行和监控。
- 允许用户主动终止长任务。

**F4. 命令审计与统计**

- 本地 SQLite 存储命令元数据及状态。
- 长输出保存到独立日志文件。
- 提供历史搜索、失败次数、Shell 使用频率、Agent 调用次数、累计耗时和平均耗时。
- 支持 JSON/JSONL 导出。
- 对环境变量、密钥及敏感命令内容提供脱敏机制。

**F5. Agent 自动配置**

- 自动检测 Codex 和 Claude Code。
- 提供用户级 MCP、Hooks 及全局提示词安装功能。
- 安装前备份配置，保留已有设置。
- 提供优先使用、审计增强和严格拦截三种模式。
- 可检查配置是否生效并一键恢复。

## 3. 技术选型

优先验证：Tabby + Tabby MCP Server，以插件或轻量 Fork 的形式开发。

替代方案：Tauri / Electron + xterm.js + node-pty。

核心架构：

- Backend：独立本地命令执行服务
- Shell：Git Bash / PowerShell / CMD 适配层
- Integration：MCP Server + Hooks
- Storage：SQLite + 日志文件
- Frontend：终端视图、任务列表、统计仪表盘
- 通信：本机 IPC 或经过认证的 localhost 接口

界面和执行服务分离。不得假设关闭界面意味着执行服务必须退出。

## 4. Agent 使用规范

安装器向 Codex 的 AGENTS.md 与 Claude Code 的 CLAUDE.md 添加可管理的说明区块：

> 本机提供 Agent Terminal MCP 工具。执行 Shell 命令时，优先使用该工具，并默认选择 Git Bash。
>
> 使用 PowerShell 或 CMD 时必须显式指定 Shell。
>
> 对于长时间运行的任务，使用任务 ID 查询执行状态和增量输出，不要反复启动相同命令。
>
> 不得将命令未完成、超时或连接中断直接解释为执行成功。
>
> MCP 不可用时报告异常，并依据当前配置的回退策略处理。

## 5. 第一版验收标准

1. Codex 和 Claude Code 均可通过 MCP 执行 Git Bash 命令。
2. 两个 Agent 同时执行任务，监控界面可区分并分别显示。
3. 长任务运行时能够持续看到输出，无须等待结束。
4. 能正确记录成功、非零退出码、取消和异常终止。
5. 关闭再打开监控界面，历史记录不丢失。
6. 能发现或拦截支持的原生工具调用，且不把未被监控的执行误报为已审计。
7. 安装和卸载不破坏用户已有的 Agent 配置。

## 6. 暂不实现（P1/P2）

- 自研终端模拟器
- 云端同步和多用户权限
- SSH / Docker / WSL 执行环境
- AI 模型聊天功能
- Linux 桌面版本
- macOS ARM64 发布版本

## 7. 开发顺序

第一阶段：评估 Tabby MCP 插件，在 Windows 上打通 Codex / Claude Code → Git Bash 的执行链路。

第二阶段：实现独立执行服务、实时输出和持久化审计。

第三阶段：实现可视化界面、Agent 自动配置及 Hooks。

只有验证 Tabby 扩展方案无法满足目标后，才考虑独立桌面终端或深度 Fork。

## 五、产品名称建议

我更倾向于体现“Agent 操作透明、可追踪”，而不是强调 AI 对话功能。

TermWitness

终端见证者。突出 AI 执行过程全程可见。

复制

TraceTerm

可追踪终端。简短、技术化，适合开源产品。

复制

ShellLedger

Shell 执行账本。强调命令日志、审计和统计。

复制

AgentTTY

面向 AI Agent 的终端。直接体现目标用户。

复制

TermBeacon

终端信标。强调实时状态、监控和多 Agent 可观测性。

复制

名称只是初步候选，正式发布前仍需检查仓库名、域名及商标冲突。

## 六、最终开发建议

我建议你暂时不要直接 Fork Wave 或从零做 Tauri 终端。

先完成一个关键技术验证：

第一步：Tabby MCP 可行性验证

让 Codex 和 Claude Code 调用同一个 Tabby Git Bash 会话，确认命令、实时输出、退出码都能准确获得。

第二步：验证监控是否完整

重点测试 Agent 是否绕过 MCP，以及 Hooks 能否发现或阻止这些调用。

第三步：决定 Fork 还是插件化

如果 Tabby 插件已经能稳定完成执行和输出捕获，就只开发监控与配置功能；否则再独立实现执行服务。

另外发现一个值得你亲自测试的竞品：[AgentDock](https://agdc.dev/?utm_source=chatgpt.com)。它已经在 Windows 和 macOS 上统一启动 Codex、Claude Code，并展示结构化工具活动与原始终端输出，但产品定位更偏向 AI 编程工作台，不是你设想的通用 Shell 执行审计服务。

[image](https://www.google.com/s2/favicons?domain=https://docs.agdc.dev\&sz=32)

AgentDock Docs+1



最值得做的差异化能力，不是让 AI 能使用终端，而是让不同的 AI Agent 都使用一个可管理、可审计、可实时观察的命令执行系统。

这也是我建议把项目核心定义为 Agent Terminal Runtime，而不是单纯一个 Terminal App 的原因。
