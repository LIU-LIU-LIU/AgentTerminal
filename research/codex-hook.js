const fs=require('fs');let s=fs.readFileSync(0,'utf8');fs.appendFileSync('hook.log',s+'\n');
let e={};try{e=JSON.parse(s)}catch{}
if((e.tool_name||'')==='Bash'||/shell|exec/i.test(e.tool_name||'')){process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'Use agentterm MCP terminal_run instead'}}))}
