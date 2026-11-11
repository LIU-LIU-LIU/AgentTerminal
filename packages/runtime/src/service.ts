import { spawn } from 'node:child_process';
import { existsSync, openSync, closeSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connection, dataHome } from './client.js';

const pause = () => new Promise(resolve => setTimeout(resolve, 100));
export async function running() {
  if (!existsSync(path.join(dataHome(), 'connection.json'))) return undefined;
  const info = connection();
  try {
    const response = await fetch(info.url+'/api/health', {headers:{Authorization:`Bearer ${info.token}`},signal:AbortSignal.timeout(2000)});
    if(response.ok && (await response.json() as {ok:boolean}).ok) return info;
  } catch {}
  return undefined;
}

export async function stopService() {
  const info=await running();
  if(!info) {
    const lockPath=path.join(dataHome(),'runtime.lock');
    if(existsSync(lockPath)) {
      const pid=Number(readFileSync(lockPath,'utf8'));
      if(!Number.isSafeInteger(pid)||pid<=0)throw new Error('Runtime 锁文件无效，请核对服务状态');
      let alive=true;
      try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false;else throw error;}
      if(alive)throw new Error('无法连接 Runtime，但进程仍存在；未将断连当作停止成功');
    }
    return;
  }
  const headers={Authorization:`Bearer ${info.token}`,'Content-Type':'application/json'};
  const response=await fetch(info.url+'/api/control/stop',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(5000)});
  if(response.status===404) {
    const tasks=await fetch(info.url+'/api/tasks',{headers,signal:AbortSignal.timeout(5000)});
    if(!tasks.ok) throw new Error('Cannot verify legacy Runtime tasks');
    if((await tasks.json() as {status:string}[]).some(task=>task.status==='running')) throw new Error('旧版 Runtime 仍有运行任务，请等待任务结束后重试');
    const lock=Number(readFileSync(path.join(dataHome(),'runtime.lock'),'utf8'));
    if(lock!==info.pid || !Number.isSafeInteger(lock) || lock<=0) throw new Error('Runtime PID verification failed');
    process.kill(info.pid);
  } else if(!response.ok) throw new Error('Runtime 拒绝停止请求');
  const deadline=Date.now()+25000;
  while(Date.now()<deadline) {
    try { process.kill(info.pid,0); } catch(error) { if((error as NodeJS.ErrnoException).code==='ESRCH')return; throw error; }
    await pause();
  }
  throw new Error('等待 Runtime 退出超时，未启动重复实例');
}

export async function startService(reuse?: {url:string;token:string}) {
  const current=await running();
  if(current)return current;
  const home=dataHome();
  const {mkdirSync}=await import('node:fs');
  mkdirSync(home,{recursive:true});
  const log=openSync(path.join(home,'service.log'),'a',0o600);
  const child=spawn(process.execPath,[fileURLToPath(new URL('./index.js',import.meta.url))],{
    detached:true,windowsHide:true,stdio:['ignore',log,log],
    env:{...process.env,AGENT_TERMINAL_HOME:home,AGENT_TERMINAL_RESTART_PORT:reuse?new URL(reuse.url).port:'',AGENT_TERMINAL_RESTART_TOKEN:reuse?.token||''},
  });
  closeSync(log);
  let error:Error|undefined;
  child.on('error',value=>{error=value;});
  child.unref();
  const deadline=Date.now()+20000;
  while(Date.now()<deadline) {
    if(error)throw error;
    const info=await running();
    if(info)return info;
    if(child.exitCode!==null)throw new Error(`Runtime 启动失败 (${child.exitCode})，请查看 ${path.join(home,'service.log')}`);
    await pause();
  }
  throw new Error(`Runtime 启动超时，请查看 ${path.join(home,'service.log')}`);
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const action=process.argv[2]||'start';
    if(!['start','stop','restart'].includes(action))throw new Error('Usage: service start|stop|restart');
    const previous=await running();
    if(action==='stop'||action==='restart')await stopService();
    if(action==='stop')console.log('AgentTerminal 后台服务已停止。');
    else {
      const info=await startService(action==='restart'?previous:undefined);
      console.log(`AgentTerminal ${action==='start'&&previous?'已在运行':'已启动'} (PID ${info.pid})`);
      console.log(`打开界面：${info.url}/#token=${info.token}`);
      console.log('停止：pnpm stop  |  重启：pnpm run restart');
    }
  } catch(error) { console.error((error as Error).message); process.exitCode=1; }
}
