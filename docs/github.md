# GitHub 设置与许可

2026-11-11：使用现有 Git credential helper 非交互核实权限，未打印或保存凭据。GitHub 报告 OAuth scopes 为 `gist, repo, workflow`；当前账号对本仓库拥有 admin / maintain / push / triage / pull 权限。repo 可按账号权限读写和管理仓库，workflow 可更新工作流，gist 可管理 gist；这些 scope 不代表可以访问任意组织或他人的仓库。

已通过 GitHub API 更新仓库简介和 topics，两项均 HTTP 200；保留已有 topics。仓库为 public，默认分支 main。未创建 Pages、Release，也未通过此操作推送源码。

仓库首页 About 右侧齿轮可编辑简介、网站和 topics。Settings → General 管理仓库功能。需要下载入口时创建版本 tag 和 Release，上传完整便携目录的 zip。文档网站可另做站点再启用 Settings → Pages；当前 React UI 依赖认证后的本机 Runtime，不适合作为公共 Pages 应用。

选择 Apache-2.0：允许自由使用、修改、转载和商用，要求分发时保留 LICENSE、适用 NOTICE 和版权声明，并依许可标注修改；提供明确专利授权，不强制商业用户公开源码。第三方许可单独适用。LICENSE 推送到默认分支后 GitHub 才会识别该仓库许可。

复现权限检查：`node research/github-repository.mjs`；加 `--apply` 更新简介和 topics。脚本只输出权限元数据。源码发布仍是独立步骤，本轮没有执行 git push。
