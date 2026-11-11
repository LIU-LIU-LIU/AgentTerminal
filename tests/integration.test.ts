import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startRuntime } from '../packages/runtime/src/index.js';

test('authenticated HTTP + two independent MCP clients share one runtime; hooks and export',async()=> {
  const home=mkdtempSync(path.join(os.tmpdir(),'agentterminal-api-'));
  const runtime=await startRuntime(home);
  const headers={Authorization:`Bearer ${runtime.info.token}`,'Content-Type':'application/json'};
  const clients: Client[]=[];
  try {
    assert.equal((await fetch(runtime.info.url+'/api/tasks')).status,401);
    assert.equal((await fetch(runtime.info.url+'/api/tasks',{headers:{...headers,Origin:'https://attacker.invalid'}})).status,403);
    for(const agent of ['codex','claude']) {
      const client=new Client({name:agent,version:'1'});
      await client.connect(new StdioClientTransport({command:process.execPath,args:['dist/packages/mcp/src/index.js','--agent',agent],env:{...Object.fromEntries(Object.entries(process.env).filter(([,value])=>value!==undefined)) as Record<string,string>,AGENT_TERMINAL_HOME:home}}));
      clients.push(client);
    }
    const results=await Promise.all(clients.map((client,index)=>client.callTool({name:'run',arguments:{command:`echo agent${index}; sleep 0.2; exit ${index}`}})));
    for(let index=0;index<results.length;index++) {
      const payload=JSON.parse((results[index].content as any[])[0].text);
      assert.equal(payload.task.exit_code,index);
      assert.match(payload.output,new RegExp(`agent${index}`));
    }
    const response=await fetch(runtime.info.url+'/api/tasks',{headers});
    const tasks=await response.json() as any[];
    assert.deepEqual(new Set(tasks.map(task=>task.agent)),new Set(['codex','claude']));
    assert.equal((await fetch(runtime.info.url+'/api/hooks',{method:'POST',headers,body:JSON.stringify({tool_name:'Bash',hook_event_name:'PreToolUse'})})).status,200);
    assert.equal((await fetch(runtime.info.url+'/api/export',{headers})).status,200);
    const stats=await (await fetch(runtime.info.url+'/api/stats',{headers})).json() as any;
    assert.equal(stats.total,2); assert.equal(stats.hooks.count,1);
  } finally { await Promise.all(clients.map(client=>client.close())); await runtime.close(); }
});
