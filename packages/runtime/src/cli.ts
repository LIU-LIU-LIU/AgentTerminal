import { request } from './client.js';

const [action,...args]=process.argv.slice(2);
try {
  let result: unknown;
  if(action==='list') result=await request('/api/tasks');
  else if(action==='stats') result=await request('/api/stats');
  else if(action==='run'||action==='start') {
    const command=args.shift();
    if(!command) throw new Error('Usage: cli run "command" [--cwd directory] [--shell gitbash|pwsh|cmd] [--agent name]');
    const options:Record<string,string>={command};
    for(let index=0;index<args.length;index+=2) {
      const flag=args[index].replace(/^--/,'');
      if(!['cwd','shell','agent','session'].includes(flag)||!args[index+1]) throw new Error('Invalid option');
      options[flag]=args[index+1];
    }
    options.cwd ||= process.cwd();
    const task=await request('/api/tasks',options);
    if(action==='start') result=task;
    else {
      let offset=0;
      while(true) {
        const output=await request(`/api/tasks/${task.task_id}/output?offset=${offset}`);
        process.stdout.write(output.output); offset=output.offset;
        if(output.done&&!output.more) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      const state=await request(`/api/tasks/${task.task_id}`);
      process.exitCode=state.status==='ok'?0:state.exit_code||1;
    }
  } else if(['status','read','write','kill'].includes(action)) {
    const id=encodeURIComponent(args[0]||'');
    if(!id) throw new Error('task_id required');
    if(action==='read') result=await request(`/api/tasks/${id}/output?offset=${Number(args[1]||0)}`);
    else if(action==='write') result=await request(`/api/tasks/${id}/input`,{input:args[1]||''});
    else if(action==='kill') result=await request(`/api/tasks/${id}/kill`,{});
    else result=await request(`/api/tasks/${id}`);
  } else throw new Error('Commands: run, start, list, stats, status, read, write, kill');
  if(result!==undefined) console.log(JSON.stringify(result,null,2));
} catch(error) { console.error((error as Error).message); process.exitCode=1; }
