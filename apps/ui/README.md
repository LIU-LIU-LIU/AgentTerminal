# Agent Terminal UI

React + TypeScript + Vite、xterm.js 和 Tauri v2。桌面启动时打开配置、监控两个窗口；关闭窗口不会终止独立 Runtime。浏览器用 `?window=config` 或 `?window=monitor` 选择页面，也可以通过侧栏切换。

在仓库根目录完成依赖安装和后端构建后：

```sh
pnpm --dir apps/ui dev
pnpm --dir apps/ui test
pnpm --dir apps/ui build
pnpm --dir apps/ui desktop:dev
```

浏览器打开 `http://localhost:1420/#token=<URL编码的runtime token>`。API 使用当前 origin，开发代理在启动时从连接文件发现 Runtime URL，也可用 `AGENT_TERMINAL_RUNTIME_URL` 指定；均未设置时回退到 `http://127.0.0.1:4317`。先启动 Runtime，再启动 Vite。生产 Web 部署需由 Runtime 或反向代理在同一 origin 提供 UI 和 API。令牌仅保存在内存与 URL fragment，不发送至查询串或持久化存储。所有 API 请求携带 Bearer token；任务与统计每 2.5 秒刷新，终端通过 offset 顺序轮询输出，输入顺序提交，ResizeObserver 同步 PTY 尺寸。

桌面端调用 Rust `connection`，读取 `$AGENT_TERMINAL_HOME/connection.json`（默认 `~/.agentterminal/connection.json`），格式 `{ "url": "http://127.0.0.1:4317", "token": "…", "pid": 123 }`。只接受本机 HTTP 地址；连接仍在监听时直接复用。未连接时，通过 PATH 中的外部 `node` 启动后端，Windows 使用 detached process。可设置 `AGENT_TERMINAL_NODE` 指定 Node 可执行文件，`AGENT_TERMINAL_RUNTIME_ENTRY` 指定后端入口。开发默认从仓库根查找 `dist/runtime/index.js`、`dist/packages/runtime/src/index.js`。启动日志位于连接目录 `desktop-runtime.log`。

## 当前分发范围

`desktop:build` 构建桌面程序，`bundle.active=false`，不产生 MSI/NSIS 安装器。构建需要 Rust、Windows C++ 构建工具；运行需要 WebView2。便携包由仓库根工具另行组装，UI 构建不会自动复制 Node 或后端。便携包目录约定如下：

```text
AgentTerminal/
  AgentTerminal.exe
  runtime/
    node.exe
    dist/packages/runtime/src/index.js
    node_modules/...
```

Runtime 查找顺序为 `AGENT_TERMINAL_RUNTIME_ENTRY`、exe 相邻的 `runtime/dist/packages/runtime/src/index.js`、编译时源码根的两个开发入口。Node 查找顺序为 `AGENT_TERMINAL_NODE`、exe 相邻 `runtime/node.exe`、PATH 中的 `node`。便携包必须包含完整后端编译产物、架构匹配的 Node 和完整运行依赖，尤其 node-pty 与 SQLite 原生模块；复制单个 exe 无法独立运行。环境变量显式指定的入口不存在时会报错，不静默改用其他后端。

监控页支持 JSONL 任务导出；原生桌面监控页提供窗口置顶，浏览器没有原生置顶按钮。Hook 事件目前展示累计计数。应用图标由 `build.rs` 在构建时生成，无需下载图片。

配置页支持接入安装/卸载、模式应用、按所选模式预览、Codex / Claude Code 本地 Provider 保存和各 Agent Skill 切换。Provider 从 `providers[agent]` 读取，兼容旧 `provider` 作为 Codex 配置，提交时携带 `agent`；空密钥表示保留已有密钥。本地设置不修改远程 Cloud 环境。MCP 与 Hooks 状态由安装接口统一管理，UI 不宣称存在独立切换 API。严格模式的实际能力取决于 Runtime 和各 Agent 支持的 Hook 事件。
