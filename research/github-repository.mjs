import { spawnSync } from 'node:child_process';

const repository = 'LIU-LIU-LIU/AgentTerminal';
const credential = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding:'utf8', windowsHide:true, timeout:20000,
  env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},
});
const password = credential.stdout?.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
if (!password) { console.log(JSON.stringify({authenticated:false,reason:'No non-interactive GitHub credential available'})); process.exitCode=1; }
else {
  const request = async (route,method='GET',body) => {
    const response = await fetch(`https://api.github.com${route}`,{method,headers:{Authorization:`Bearer ${password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AgentTerminal-repository-setup',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const data=await response.json();
    return {status:response.status,scopes:response.headers.get('x-oauth-scopes'),data};
  };
  const repo=await request(`/repos/${repository}`);
  console.log(JSON.stringify({repository,status:repo.status,scopes:repo.scopes,permissions:repo.data.permissions,visibility:repo.data.visibility,default_branch:repo.data.default_branch,license:repo.data.license?.spdx_id}));
  if(process.argv.includes('--apply')) {
    if(!repo.data.permissions?.admin) throw new Error('Repository administration permission not confirmed');
    const metadata=await request(`/repos/${repository}`,'PATCH',{description:'Local command execution and terminal monitoring for AI coding agents. MCP, Hooks, Git Bash, React + Tauri.'});
    console.log(JSON.stringify({action:'description',status:metadata.status,description:metadata.data.description}));
    const topics=await request(`/repos/${repository}/topics`,'PUT',{names:[...new Set([...(repo.data.topics||[]),'ai-agents','terminal','mcp','codex','claude-code','git-bash','tauri','typescript'])]});
    console.log(JSON.stringify({action:'topics',status:topics.status,topics:topics.data.names}));
  }
}
