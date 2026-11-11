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

## ADR-003：配置窗口与监控窗口共用 runtime

React UI 提供配置中心和监控/统计两个角色，通过 URL 参数选页，浏览器或 Tauri 均能另开窗口。xterm.js 负责 ANSI 渲染、输入和 resize，执行不由 UI 所在进程承担。关闭 UI 不等于停止 runtime；多个窗口/Agent 可观察同一个 task_id。

配置修改经 runtime 安装器执行，先备份、管理指定区块并支持卸载。provider 分别写本机 Codex TOML 与 Claude Code settings，隔离 installer/hooks 的 14 项测试已通过；Cloud 环境与远端 secrets 不在此架构范围内。浏览器配置安装/卸载、中文终端和统计已验证；Windows release 编译及便携目录生成成功，UIA 已确认两个原生窗口均显示 Runtime 已连接，包内 Node runtime 自动启动已确认。原生截图受工具环境限制，视觉验收仍待补。桌面可发现或启动独立 runtime，CLI / MCP 仍依赖事先运行的 runtime。
