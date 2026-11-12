# 当前完成状态（2026-11-11）

## 2026-11-12 CI 修订

修复 macOS node-pty 发布包辅助程序缺少执行权限、Unix 暂停读取时末尾输出丢失；新增权限 / 突发输出 / IPC 积压回归与 PTY 冒烟步骤。CI 禁用矩阵 fail-fast，Windows 和 Ubuntu 不再因其他平台失败连带取消。Windows 与 Ubuntu WSL 本地构建和测试通过，macOS 专用回归须推送后由 Actions 确认。详细根因与验证数字见 research.md 的 2026-11-12 记录。历史“Linux 尚无实测”由本轮 Runtime / Web UI 的 WSL 实测补充；这不代表 Linux 桌面打包或所有发行版已验收。

## 服务管理修订

README 改为用户文档，移除研发过程、代码归属解释和内部调研导航。`pnpm start` 改为后台启动 / 健康实例复用，不再因正常已有实例而报错；新增 `pnpm stop` 与 `pnpm run restart`。使用 run restart 避免 pnpm 快捷生命周期额外执行 stop / start。

界面顶部新增“重启服务”和“完全退出”。重启保留历史与当前连接地址，取消当前任务；完全退出停止任务与后台服务，桌面端随后退出，浏览器显示服务已停止。已有任务时提示确认。关闭窗口仍默认保留后台执行。桌面调用当前安装目录的服务管理脚本，支持从旧版升级；旧服务兼容停止只在查询确认无运行任务时执行。

HTTP 关闭流程读取控制请求正文，结束任务、关闭 SQLite 后关闭剩余连接，避免未结束请求导致进程残留。失联但锁 PID 仍存在时报告失败，不将断连视为停止成功。

验证：完整后端 29/29、UI 4/4 通过；增加失联 PID 与未结束 HTTP 连接回归后，服务测试 2/2、双 MCP 集成 1/1 再次通过。浏览器实测重启后重连、完全退出无 alert，终端卸载，runtime.lock / connection.json 均删除。Windows release 构建成功，包内服务 start / restart / stop 实测成功。桌面按钮的原生点击未单独自动验收；Rust 命令已编译，服务脚本链路已测试。

本机旧服务已升级到源码构建版并运行。最新便携目录：`artifacts/AgentTerminal-1794398931135-win-x64/`。下文较早包编号和行为说明为上一轮记录，以本节为准。

## 本轮交付

- 移除本地 Provider 表单、读写 API 和安装器功能。接入安装 / 卸载回归确认不会改动现有 Provider 配置。模型、密钥、Provider 和 Codex Cloud 远程环境交给外部工具。
- Tauri 配置只声明一个 main 窗口，移除独立开窗入口与创建窗口权限；监控和配置切换 Tab，默认监控。
- 配置中心新增默认 Shell、各可执行文件绝对路径、自动检测结果。默认本机 Git Bash，pwsh 优先 PowerShell 7、缺失时回退 Windows PowerShell；MCP 的显式 shell 参数优先，不自动转换命令。
- 每任务显示输入 / 输出终端文本 Token 估算并持久化。输入包含命令与后续写入；输出按脱敏保留日志估算，英文约 4 字符 / token、CJK 约 1 字符 / token，尽力移除 ANSI。不是模型 tokenizer、上下文用量或账单，终端响应 / 回显 / 折行和跨块 ANSI 会影响估计。旧任务输入缺失时为未知，不是 0。
- PTY IPC 串行发送，积压时暂停读取，排空后恢复；EAGAIN / ENOBUFS 重试，致命错误不伪报成功。UI 对已结束任务停止输入，容忍任务结束与输入并发的状态竞态。
- README、架构、使用文档和第三方声明更新；添加 Apache-2.0 LICENSE / NOTICE，便携包附项目及 Node.js 许可文本。
- GitHub 简介与 topics 更新成功，凭据权限见 github.md。没有执行 git push。

## 已有核心能力及聚合边界

共享 Runtime 接收多个 Agent 的 MCP 任务，独立 PTY 执行、输出分页、交互输入、退出码、取消、异常状态、SQLite 历史、Hooks 记录 / 受支持原生工具拦截、配置安装 / 卸载与 JSONL 任务导出均已实现。使用本机 Git Bash 的实际 bash.exe，不是 WSL PATH 别名。

这是一组任务终端的聚合展示，不是一个在所有任务间共享 cwd / 环境变量的 Shell，也不是自动接管其他 Agent 客户端的原生终端。Hooks 不会将原生命令静默转发到 Runtime。Agent / session 标签为任务元数据；重启保留历史，不恢复活动 PTY。

Node / TypeScript + React 保持主要业务同一语言，利于 AI 辅助实现和维护；node-pty / xterm.js 复用成熟核心，Tauri 只做桌面外壳。性能稳定性通过 PTY helper 隔离、背压、日志上限和回归测试保障，不宣称无限吞吐或长期无故障。每任务 Node helper 有资源开销，原生模块 ABI 与平台打包仍需维护。Windows x64 已测试，Linux / macOS 尚未验收。

## 本轮验证

- 后端 28/28 通过，约 65 秒；覆盖真实 ConPTY 大输出（35 MiB 输入压力 / 32 MiB 日志上限）、Unicode 分页、并发隔离、失败退出、取消进程树、交互、异常恢复、脱敏、安装卸载、Hooks、IPC 压力与重试、Shell 默认 / 覆盖、统计持久化。
- 增补 usage HTTP 和已移除 Provider endpoint 回归后，双 MCP 集成测试再次 1/1 通过。
- UI API 4/4 通过；TypeScript、Vite 和 Windows Tauri release 构建成功。
- 隔离浏览器实测：默认监控展示输入 9 / 输出 7 的示例文本估算；配置保存 pwsh，刷新后仍保持；Provider 表单不存在；对结束终端按键后无 alert。
- 隔离原生 exe 启动成功，MainWindowTitle 为 Agent Terminal，包内 Runtime health=true、默认 gitbash；包内 Node / CLI 实际执行 Git Bash echo，退出 0。
- 原生 UI 自动化服务连续返回 native pipe 不可用（os error 2），重置后仍失败。未完成原生窗口数量与截图的 UI 自动验收，不能将单窗口配置检查说成原生 UI 验收。
- 本轮没有重新触发付费模型调用；真实 Codex / Claude 双 Agent MCP 与 strict hook 的历史实测见 research.md。本轮回归使用两个独立 SDK MCP 客户端。

## 新版便携目录与升级

本轮最后生成：`artifacts/AgentTerminal-1794397807970-win-x64/AgentTerminal.exe`。保留整个目录；尚未发布 GitHub Release。最后一次打包补充前端依赖许可证副本，执行代码与已完成包内 CLI 验证的版本一致。

检测到用户旧版 Runtime 仍从早期便携包运行；本轮未终止或修改该服务。新版可复用旧 Runtime，因此仅重开 UI 不保证后端更新；新版配置页会提示缺少 Shell 能力。等待任务结束、停止旧 Runtime，再从新版目录启动。现有接入配置如引用旧目录，需要从新版重新预览 / 安装。历史数据在相同 runtime home 保留；先备份再迁移。

## 仍待后续完成

真实模型 token_usage 接入、多平台 CI、长时间压力、原生 UI 自动验收及视觉优化、正式版本 Release 与全历史分页仍未完成。当前 UI 只显示估算，不把模型用量标成已实现。
