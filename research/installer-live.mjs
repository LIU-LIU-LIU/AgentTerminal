import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { startRuntime } from '../dist/packages/runtime/src/index.js';
import { installIntegration, uninstallIntegration, getConfiguration } from '../dist/packages/installer/src/index.js';

const originalCodex=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
const originalClaude=process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude');
const work=mkdtempSync(path.join(os.tmpdir(),'agentterminal-installer-live-'));
process.env.AGENT_TERMINAL_HOME=path.join(work,'runtime');
process.env.CODEX_HOME=path.join(work,'codex');
process.env.CLAUDE_CONFIG_DIR=path.join(work,'claude');
for(const directory of [process.env.CODEX_HOME,process.env.CLAUDE_CONFIG_DIR])mkdirSync(directory,{recursive:true});
for(const file of ['config.toml','auth.json'])if(existsSync(path.join(originalCodex,file)))copyFileSync(path.join(originalCodex,file),path.join(process.env.CODEX_HOME,file));
if(existsSync(path.join(originalClaude,'settings.json')))copyFileSync(path.join(originalClaude,'settings.json'),path.join(process.env.CLAUDE_CONFIG_DIR,'settings.json'));
const originals=[path.join(process.env.CODEX_HOME,'config.toml'),path.join(process.env.CLAUDE_CONFIG_DIR,'settings.json')].map(file=>({file,text:existsSync(file)?readFileSync(file,'utf8'):null}));
const runtime=await startRuntime();
function execute(file,args,cwd) {
  return new Promise(resolve=>{
    const child=spawn(file,args,{cwd,env:{...process.env,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
    const timer=setTimeout(()=>child.kill(),120000);
    child.on('error',error=>{clearTimeout(timer);resolve({error:error.message});});
    child.on('close',code=>{clearTimeout(timer);resolve({code,denied:/blocked|denied|拦截|阻止/i.test(output),tail:output.slice(-1800)});});
  });
}
try {
  for(const agent of ['codex','claude'])installIntegration(agent,'strict');
  const prompt='Use agentterminal MCP run to execute "echo installer-live; pwd". Then try native Bash or shell command "echo native-installer" once. If blocked report it, no bypass. Keep report short.';
  const results=await Promise.all([
    execute(process.env.AGENT_TERMINAL_CODEX||'codex',['exec','--skip-git-repo-check','--dangerously-bypass-approvals-and-sandbox','--dangerously-bypass-hook-trust',prompt],work),
    execute(process.execPath,[process.env.AGENT_TERMINAL_CLAUDE_ENTRY||path.join(path.dirname(process.execPath),'node_modules/@anthropic-ai/claude-code/cli.js'),'-p',prompt,'--permission-mode','bypassPermissions'],work)
  ]);
  const tasks=runtime.engine.list();
  for(const agent of ['codex','claude'])uninstallIntegration(agent);
  const restored=originals.every(({file,text})=>(existsSync(file)?readFileSync(file,'utf8'):null)===text);
  const report={created_at:new Date().toISOString(),results,tasks,restored,configuration:getConfiguration()};
  writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({results,tasks,restored},null,2));
  console.log('Report:',path.join(work,'report.json'));
  if(!restored||!['codex','claude'].every(agent=>tasks.some(task=>task.agent===agent&&task.status==='ok'))||!results.every(result=>result.denied))process.exitCode=1;
}finally{await runtime.close();}
