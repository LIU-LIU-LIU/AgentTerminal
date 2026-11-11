#!/usr/bin/env bash
set -euo pipefail
research_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$research_dir/.." && pwd)"
cd -- "$repo_dir"
: "${AGENT_TERMINAL_HOME:?Set an absolute disposable runtime home and start pnpm start there first}"
# Environment workarounds are caller opt-in. No global settings are changed.
node "$research_dir/prepare-config.mjs"
claude -p "$(cat "$research_dir/claude-prompt.txt")" \
  --mcp-config "$AGENT_TERMINAL_HOME/research-mcp.json" \
  --settings "$AGENT_TERMINAL_HOME/research-claude-hooks.json" \
  --permission-mode default </dev/null
