import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startRuntime } from '../dist/packages/runtime/src/index.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const work=mkdtempSync(path.join(tmpdir(),'agentterminal-live-'));
process.env.AGENT_TERMINAL_HOME=path.join(work,'runtime');
const runtime=await startRuntime();
const mcp=path.join(root,'dist/packages/mcp/src/index.js');
const hook=path.join(root,'dist/packages/hooks/src/cli.js');
const quote=value=>'"'+value.replace(/\\/g,'/')+'"';
const hookCommand=agent=>[(agent==='codex' && process.platform==='win32' ? '& ' : '')+quote(process.execPath),quote(hook),'--agent',agent,'--mode strict','--home',quote(process.env.AGENT_TERMINAL_HOME)].join(' ');
const codexDir=path.join(work,'codex'); mkdirSync(path.join(codexDir,'.codex'),{recursive:true});
writeFileSync(path.join(codexDir,'.codex/hooks.json'),JSON.stringify({hooks:{PreToolUse:[{matcher:'.*',hooks:[{type:'command',command:hookCommand('codex'),timeout:3}]}]}}));
const claudeDir=path.join(work,'claude'); mkdirSync(claudeDir,{recursive:true});
writeFileSync(path.join(claudeDir,'mcp.json'),JSON.stringify({mcpServers:{agentterminal:{command:process.execPath,args:[mcp,'--agent','claude'],env:{AGENT_TERMINAL_HOME:process.env.AGENT_TERMINAL_HOME}}}}));
writeFileSync(path.join(claudeDir,'hooks.json'),JSON.stringify({hooks:{PreToolUse:[{matcher:'.*',hooks:[{type:'command',command:hookCommand('claude'),timeout:3}]}]}}));
const prompt='Use agentterminal MCP run tool to execute command "echo AgentTerminal-live; uname -s". Then try native Bash or exec shell tool for "echo native-live" exactly once. If denied, report denial without bypassing it. Report MCP output and denial.';
function execute(file,args,cwd,extra={}) {
  return new Promise(resolve=>{
    const child=spawn(file,args,{cwd,env:{...process.env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';
    child.stdout.on('data',chunk=>output+=chunk); child.stderr.on('data',chunk=>output+=chunk);
    const timer=setTimeout(()=>child.kill(),120000);
    child.on('error',error=>{clearTimeout(timer);resolve({error:error.message});});
    child.on('close',code=>{clearTimeout(timer);resolve({code,output:output.slice(-5000)});});
  });
}
try {
  const codexPath=process.env.AGENT_TERMINAL_CODEX || 'codex';
  const nodeGlobal=path.dirname(process.execPath);
  const claudeEntry=process.env.AGENT_TERMINAL_CLAUDE_ENTRY || path.join(nodeGlobal,'node_modules/@anthropic-ai/claude-code/cli.js');
  const codexArgs=['exec','--skip-git-repo-check','--dangerously-bypass-approvals-and-sandbox','--dangerously-bypass-hook-trust','-c',`mcp_servers.agentterminal.command=${JSON.stringify(process.execPath)}`,'-c',`mcp_servers.agentterminal.args=${JSON.stringify([mcp,'--agent','codex'])}`,'-c',`mcp_servers.agentterminal.env.AGENT_TERMINAL_HOME=${JSON.stringify(process.env.AGENT_TERMINAL_HOME)}`,prompt];
  const results=await Promise.all([execute(codexPath,codexArgs,codexDir),execute(process.execPath,[claudeEntry,'-p',prompt,'--mcp-config','mcp.json','--settings','hooks.json','--permission-mode','bypassPermissions'],claudeDir,{CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'})]);
  const tasks=runtime.engine.list();
  const observations=runtime.engine.db.prepare('SELECT event FROM hooks').all().map(row=>{const event=JSON.parse(row.event);return {agent:event.agent,tool:event.tool_name,event:event.hook_event_name};});
  const report={created_at:new Date().toISOString(),results,tasks,observations};
  writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  console.log('Report saved:',path.join(work,'report.json'));
  if(!tasks.some(task=>task.agent==='codex')||!tasks.some(task=>task.agent==='claude')) process.exitCode=1;
} finally {await runtime.close();}
