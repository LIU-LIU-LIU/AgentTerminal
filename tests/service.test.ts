import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';

const exec = promisify(execFile);
test('unreachable live Runtime is not reported as stopped',async()=>{
  const home=mkdtempSync(join(tmpdir(),'agentterminal-service-unreachable-'));
  writeFileSync(join(home,'runtime.lock'),String(process.pid));
  writeFileSync(join(home,'connection.json'),JSON.stringify({url:'http://127.0.0.1:1',token:'test-token',pid:process.pid}));
  await assert.rejects(exec(process.execPath,[resolve('dist/packages/runtime/src/service.js'),'stop'],{env:{...process.env,AGENT_TERMINAL_HOME:home},timeout:10000}),/无法连接 Runtime/);
});
test('service start is idempotent; restart preserves connection/history; stop cancels tasks and exits', {timeout:90000}, async t => {
  const home=mkdtempSync(join(tmpdir(),'agentterminal-service-'));
  const env={...process.env,AGENT_TERMINAL_HOME:home};
  const service=resolve('dist/packages/runtime/src/service.js');
  const command=(action:string)=>exec(process.execPath,[service,action],{env,timeout:35000,windowsHide:true});
  t.after(async()=>{await command('stop');});
  const connection=()=>JSON.parse(readFileSync(join(home,'connection.json'),'utf8')) as {url:string;token:string;pid:number};
  const request=async(route:string,body?:object)=>{
    const info=connection();
    const response=await fetch(info.url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${info.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
    assert(response.ok,await response.clone().text());
    return response.json() as Promise<any>;
  };
  await command('start');
  const first=connection();
  assert.match((await command('start')).stdout,/已在运行/);
  assert.equal(connection().pid,first.pid);
  const task=await request('/api/tasks',{command:'sleep 60'});
  await command('restart');
  const second=connection();
  assert.notEqual(second.pid,first.pid); assert.equal(second.url,first.url); assert.equal(second.token,first.token);
  assert.equal((await request(`/api/tasks/${task.task_id}`)).status,'cancelled');
  await request('/api/control/restart',{});
  const deadline=Date.now()+30000;
  let restarted=false;
  while(Date.now()<deadline) {
    try {if(connection().pid!==second.pid && !(await request('/api/health')).stopping){restarted=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(restarted,'API restart did not complete');
  const current=connection();
  const unfinished=httpRequest(current.url+'/api/hooks',{method:'POST',headers:{Authorization:`Bearer ${current.token}`,'Content-Length':'1000','Content-Type':'application/json'}});
  unfinished.on('error',()=>{});
  unfinished.write('{');
  t.after(()=>unfinished.destroy());
  await command('stop');
  assert.equal(existsSync(join(home,'runtime.lock')),false);
  assert.equal(existsSync(join(home,'connection.json')),false);
  assert.match((await command('stop')).stdout,/已停止/);
});
