export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
timeout 120 claude -p "$(cat prompt.txt)" --mcp-config mcp.json --settings claude-hooks.json --permission-mode bypassPermissions </dev/null 2>&1 | tail -8
echo ---; cut -c1-300 hook.log
