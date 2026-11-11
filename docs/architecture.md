# 架构决策记录

状态：按当前源码记录；平台验收与测试结果见 [research.md](research.md)。

## ADR-001：Node.js / TypeScript 执行核心

采用独立 Node.js runtime，MCP / Hooks / 安装器同用 TypeScript，React + xterm.js 显示终端，Tauri 2 提供桌面外壳。SQLite 存任务与 hook 元数据，文件存 PTY 输出；MCP stdio 客户端通过 home 中的连接文件访问认证后的 loopback HTTP API，多 Agent 共享同一 runtime。

选择理由：MCP 官方 SDK、node-pty、better-sqlite3 与前端语言栈可直接复用，便于先交付可观测的完整链路。没有测得 Rust 或 Go 在本项目更快/更慢的对比结果。Rust / Go 可实现独立核心，但当前会增加 PTY、MCP 与数据层重写和跨语言集成成本，因此暂不采用。Tauri 内存在 Rust 代码不代表 backend 已迁移 Rust。

代价：Node 和原生模块 ABI、平台预编译包与 Windows 构建工具需要维护；桌面外壳并不自动把 Node runtime 打包为可独立安装的产品。Linux/macOS 是设计上的移植方向，须各平台 CI 验证原生模块、Shell、退出/取消及桌面依赖。

## ADR-002：将每个 PTY 放进独立 helper 子进程

Windows 调试中观察到 node-pty / ConPTY worker 在退出阶段挂住，影响同进程任务退出与生命周期管理。当前修复使用 `child_process.fork` 启动 `pty-host`，通过 IPC 传递 start / input / resize / kill、data / exit 等消息，使 worker 生命周期与 runtime 主进程隔离。

helper 使用 Windows ConPTY，取消时对 PTY PID 调用系统 `taskkill.exe /PID <pid> /T /F` 并设退出兜底；非 Windows 采用进程组信号方案。主 runtime 记录 cancelled / abnormal 等状态，重启后不伪造原任务成功。

这是根据观察采用的工程修复，不宣称证明 node-pty 内部所有挂死根因或彻底解决所有退出竞态。代价是每任务一个 Node helper 的内存与启动开销；Windows 进程树、断连、异常退出以及其他平台都需持续回归。PTY helper 不是权限隔离或安全沙箱。

## ADR-003：单窗口、两种工作视图

单个 Tauri main 窗口内切换监控与配置 Tab。xterm.js 负责渲染和交互；关闭 UI 不终止独立 Runtime。安装器只负责 AgentTerminal 的 MCP / Hooks / Skill 托管内容，模型和 Provider 交给外部工具。

## ADR-004：背压与统计边界

PTY helper 的 IPC 消息串行发送，高水位暂停 PTY 读取、低水位恢复；EAGAIN / ENOBUFS 延迟重试，致命失败结束任务。避免无限并发写 IPC。每任务存终端文本 Token 估算，明确不等于模型上下文或计费用量。Shell 默认值与路径持久化到 runtime home 的 shell.json，显式 MCP 参数优先。
