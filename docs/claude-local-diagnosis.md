# Claude Code 本机接入排查（2026-11-12）

## VS Code 扩展专项复测

系统 CLI 为 1.0.84，VS Code 安装的扩展为 2.1.322，使用自己的 `resources/native-binary/claude.exe`，不能互相代替测试。VS Code 日志已确认 agentterminal stdio 连接成功、具有 tools 能力，且 PreToolUse / PostToolUse 正常执行。观察到的 Read/Grep/Edit 都是文件工具；不会产生终端任务，这不是终端接管失败的证据。

`node research/claude-vscode-probe.mjs` 使用扩展自带程序、当前用户配置以及 user/project/local 设置来源实测成功：原生 Bash 执行 `printf VSCODE_NATIVE_PROBE` 被 strict 拒绝；接着 ToolSearch 发现 MCP 工具，`mcp__agentterminal__run` 执行 `printf VSCODE_MCP_PROBE_OK`，task `e4d61cc4-4507-424b-bdb8-3e257e99eaaf`，status ok / exit_code 0，模型进程 exit 0。没有改 Provider、禁用权限或修改项目文件。

本轮补充管理指令与 Hook 拒绝提示：延迟加载的工具应先通过 ToolSearch 发现；文件读写仍走原生文件工具。此前补齐的 PowerShell 工具名拦截有单元回归，不能将 Bash 的真实通过扩大为 PowerShell 真实模型验收。

安装器与 Hook 回归 12/12 通过，后端 TypeScript 构建通过。已备份并更新本机现用便携包的安装器 / Hook 文件，再以该包重新安装 Claude strict 接入；保留已有 Provider 配置及接入绝对路径，不停止运行中的任务。更新后重跑扩展内核探针再次通过：Bash deny、ToolSearch、MCP 输出、进程 exit 0。

更新接入后，应 Reload Window 并新建 Claude 对话，避免旧会话缓存。该复测是扩展自带内核的真实 MCP/Hook 闭环；未完成 VS Code 面板的输入、审批、流式显示端到端验收，也未验证 Cursor。若在新会话执行明确的 MCP 终端命令仍无任务，需继续结合该次 VS Code Claude 输出日志定位，不能仅凭文件工具日志断言终端失败。

## 结果

本机 Claude Code 1.0.84 的 MCP 和 Hook 均可用。`claude mcp list` 显示 agentterminal Connected；真实 `claude -p` 会话通过 MCP 执行 `printf AGENTTERMINAL_CLAUDE_PROBE` 返回退出码 0，同时 runtime 记录对应 MCP 的 PreToolUse 和 PostToolUse。

原配置是 audit 模式，原生终端只产生审计事件，不会被接管，也不会变成具有实时 PTY 输出的任务卡片。历史事件证明 Claude 还使用了名为 PowerShell 的原生工具；旧 strict 规则未覆盖该工具名。这是“Hook 不拦截”的另一个缺口，已补充 PowerShell、powershell、pwsh、CMD、cmd，并保留 MCP 工具放行、runtime 不可达时放行并记录未审计的规则。

隔离 settings 的严格模式真实验证：原生 Bash 被拒绝，原因是要求使用 AgentTerminal MCP；同一会话随后通过 MCP 执行 `printf CLAUDE_STRICT_MCP_OK` 并得到成功输出。PowerShell 名称的拦截另有 Hook 回归测试覆盖。

## 本机处理

通过新版便携包的安装器将 Claude 接入重新安装为 strict；保留 Provider 环境配置，写入前按现有安装器机制备份至 `~/.agentterminal/backups/`。新 MCP 和 Hook 路径指向 `artifacts/AgentTerminal-1794471643044-win-x64/`，再次检查 MCP 连接成功。不要删除或移动该目录；如要移动，请先卸载接入再安装。

已经打开的 Claude 会话不会自动热加载全部设置，需退出后重新启动。strict 只能拦截 Agent 实际支持且触发的 Hook，不会注入或接管任意外部终端窗口。audit 仍然保留为可选模式，配置页已明确说明“不拦截、不接管原生输出”。未改动 Provider 或升级本机 Claude。

重装后的全局配置复测成功（会话 `37a56d53-bdb4-4f0b-8ee0-cb4a95adb8ba`）：本机 CLI 没有暴露 PowerShell 工具，转而尝试原生 Bash，被 Hook 拒绝，随后 MCP 返回 `CLAUDE_REPAIRED_OK`、退出码 0。这次使用的是已安装的用户级配置，无需临时 settings。

## 悬浮窗与验证

当前源码使用 20 × 60 逻辑像素折叠区域（早先已打包验证的版本为 30 × 60）；优先最新运行命令，完成后回到后台任务。浏览器 fixtures 验证尺寸和切换成功，17 项前端测试通过；5 项 Hook 测试通过，Windows 编译和便携打包成功。桌面程序需启动新包后才使用新尺寸，运行中的旧程序未被终止。
