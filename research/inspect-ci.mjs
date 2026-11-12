import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
const token=credential.stdout?.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);
const headers={Accept:'application/vnd.github+json','User-Agent':'AgentTerminal-CI-inspection',...(token?{Authorization:`Bearer ${token}`}:{})};
const base='https://api.github.com/repos/LIU-LIU-LIU/AgentTerminal';
async function json(route) {
  const response=await fetch(base+route,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`GitHub API ${response.status}`);
  return response.json();
}
const runs=await json('/actions/runs?per_page=5');
console.log(JSON.stringify(runs.workflow_runs.map(run=>({id:run.id,sha:run.head_sha,conclusion:run.conclusion,url:run.html_url}))));
const run=process.argv[2]||runs.workflow_runs.find(run=>run.conclusion==='failure')?.id;
if(!run)throw new Error('No failed run found');
const jobs=await json(`/actions/runs/${run}/jobs`);
const directory=mkdtempSync(join(tmpdir(),'agentterminal-ci-'));
for(const job of jobs.jobs) {
  console.log(JSON.stringify({id:job.id,name:job.name,conclusion:job.conclusion,steps:job.steps.map(step=>({name:step.name,conclusion:step.conclusion}))}));
  const response=await fetch(base+`/actions/jobs/${job.id}/logs`,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok){console.log(`Log unavailable: ${response.status}`);continue;}
  const log=await response.text();
  writeFileSync(join(directory,`${job.id}.log`),log);
  const lines=log.split('\n');
  for(let index=0;index<lines.length;index++)if(/not ok|error:|Error:|signal:|spawn.*failed|posix_spawn|Operation.*cancel|fail-fast/i.test(lines[index]))console.log(lines.slice(Math.max(0,index-2),index+12).join('\n'));
}
console.log(`Logs: ${directory}`);
