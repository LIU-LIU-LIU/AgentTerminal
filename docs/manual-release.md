# 手动发布 Windows v0.1.1

更新：2026-11-12 最新排队运行 `43178853093` 的 package 和 publish 均成功，v0.1.1 已在 https://github.com/LIU-LIU-LIU/AgentTerminal/releases/tag/v0.1.1 发布，包含 ZIP 和 SHA256SUMS.txt。无需重复手动发布，以下步骤保留为后续应急参考。

本机已验证 Windows 构建和测试，完整便携包为 `artifacts/AgentTerminal-v0.1.1-windows-x64.zip`，校验文件为同目录 `SHA256SUMS.txt`。请上传完整 ZIP，不要只上传 exe。解压后运行目录中的 AgentTerminal.exe。

1. 打开 https://github.com/LIU-LIU-LIU/AgentTerminal/releases/new 。
2. 先检查是否已有 v0.1.1：若自动流程已发布，不要重复创建，直接使用该版本。
3. 若尚未发布，选择或新建标签 `v0.1.1`，Target 选择 `main`。
4. 标题填写 `AgentTerminal v0.1.1`；更新说明可点 Generate release notes，或使用下文。
5. 上传完整 ZIP 和 SHA256SUMS.txt。
6. 点击 Publish release。首次发布不会有上一个版本可供生成详细比较说明，可手动填写。

建议说明：

```markdown
Windows x64 便携版。解压完整目录后运行 AgentTerminal.exe，需要安装 Git for Windows 和 WebView2。

- Codex、Claude Code 终端执行、监控与历史。
- 悬浮窗流式预览、运行耗时、10 秒空闲折叠和灰阶图标。
- 折叠区域缩小至 28 × 64 逻辑像素。
- 监控与配置两个 Tab，支持终端接入安装、卸载及 Shell 配置。

目前仅发布 Windows；Linux 输出尾部完整性问题仍在排查。终端 Token 为文本估算，并非模型账单。
```

## 2026-11-12 CI 调查

- 最新 Verify 的 Windows、macOS 任务成功，Ubuntu 的 `POSIX retains the entire final output burst across repeated tasks` 失败：3000 行只收到 2995 行。
- 本机 WSL 重复运行可复现丢行；独立调用 node-pty 也可复现，说明不是仅测试时限或 MCP 分页问题。Linux 根因及修复仍需验证，未跳过断言。
- 首次 Windows Release 的编译、测试、打包、产物上传均成功；最后的原子推送因 README 后续提交使 main 前移，被拒绝为 `fetch first`，所以发布作业跳过。
- 工作流已调整为旧构建检测 main 前移时跳过写回和发布，由最新排队构建继续，防止连续提交使过期构建报错。本地修改尚需线上验证。
- 手工创建标签也会触发标签构建；如果手动发布先完成，该构建的发布阶段可能遇到版本已存在。不要同时重复操作；优先等待正在运行的最新 Windows 发布流程结束，再决定是否手动发布。
