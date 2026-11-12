import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReliableChannel } from '../packages/runtime/src/ipc.js';
import { tokenWeight } from '../packages/runtime/src/usage.js';
import { saveShellSettings, loadShellSettings } from '../packages/runtime/src/settings.js';
import { Engine } from '../packages/runtime/src/engine.js';

test('IPC retries transient pressure in order and resumes after backlog', async () => {
  const sent: number[] = [];
  let transient = true, paused = 0, resumed = 0;
  const channel = new ReliableChannel((message, callback) => {
    setImmediate(() => {
      if (transient) { transient = false; callback(Object.assign(new Error('pressure'), { code: 'EAGAIN' })); }
      else { sent.push((message as {n:number}).n); callback(); }
    });
  }, () => paused++, () => resumed++, error => assert.fail(error.message));
  for(let n=0;n<100;n++) channel.push({n});
  await channel.idle();
  assert.deepEqual(sent,Array.from({length:100},(_,n)=>n));
  assert.equal(paused,1); assert.equal(resumed,1);
});

test('fatal IPC failure settles pending drain and stops sending', async () => {
  let failed = 0;
  const channel = new ReliableChannel((message, callback) => setImmediate(() => callback(new Error('closed'))),()=>{},()=>{},()=>failed++);
  channel.push({n:1});
  await channel.idle();
  channel.push({n:2});
  await channel.idle();
  assert.equal(failed,1);
});

test('IPC backlog is bounded and overflow fails explicitly', async () => {
  let failure: Error | undefined;
  let complete: ((error?: NodeJS.ErrnoException | null)=>void) | undefined;
  const channel=new ReliableChannel((_message,callback)=>{complete=callback;},()=>{},()=>{},error=>{failure=error;});
  channel.push({data:'pending'});
  const drained=channel.idle();
  for(let index=0;index<65;index++)channel.push({data:'x'.repeat(1024*1024)});
  await drained;
  assert.match(failure!.message,/backlog exceeded 64 MiB/);
  complete!();
  await channel.idle();
});

test('text estimates ignore ANSI and distinguish CJK from Latin', () => {
  assert.equal(tokenWeight('\u001b[31mhello world\u001b[0m'),2.75);
  assert.equal(tokenWeight('你好世界'),4);
});

test('task list retains old running tasks when recent history exceeds 500', async t => {
  const engine = new Engine(mkdtempSync(join(tmpdir(), 'agentterminal-list-')));
  t.after(async () => { await engine.close(); engine.db.close(); });
  const insert = engine.db.prepare('INSERT INTO tasks (task_id, agent, session, cwd, shell, command, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insert.run('background', 'codex', '', '.', 'gitbash', 'long command', 'running', '2026-01-01T00:00:00Z');
  engine.db.transaction(() => {
    for (let i = 0; i < 501; i++) insert.run(`short-${i}`, 'codex', '', '.', 'gitbash', 'echo done', 'ok', '2026-01-01T01:00:00Z');
  })();
  const tasks = engine.list();
  assert.equal(tasks.length, 500);
  assert.equal(tasks[0].task_id, 'background');
  assert.equal(tasks.filter(task => task.status === 'running').length, 1);
});

test('saved shell default executes locally, explicit override wins, usage survives restart', async t => {
  const home=mkdtempSync(join(tmpdir(),'agentterminal-settings-'));
  assert.equal(loadShellSettings(home).default_shell,'gitbash');
  assert.throws(()=>saveShellSettings(home,{default_shell:'gitbash',paths:{gitbash:home}}));
  const preferred=process.platform==='win32'?'pwsh':'gitbash';
  saveShellSettings(home,{default_shell:preferred,paths:{}});
  const engine=new Engine(home);
  t.after(async()=>{await engine.close();engine.db.close();});
  const task=engine.start({command:preferred==='pwsh'?"Write-Output 'shell-ok'":"echo shell-ok"});
  const override=engine.start({command:'echo bash-ok',shell:'gitbash'});
  const deadline=Date.now()+20000;
  while(engine.list().some(t=>t.status==='running')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(engine.get(task.task_id).status,'ok',engine.output(task.task_id).output);
  assert.equal(engine.get(task.task_id).shell,preferred);
  assert.equal(engine.get(override.task_id).shell,'gitbash');
  assert.equal(engine.get(override.task_id).status,'ok',engine.output(override.task_id).output);
  assert.match(engine.output(task.task_id).output,/shell-ok/);
  const usage=engine.usage(task.task_id);
  assert(usage.input_tokens!>0); assert(usage.output_tokens>0); assert.equal(usage.estimated,true);
  const second=new Engine(home);
  assert.deepEqual(second.usage(task.task_id),usage);
  second.db.prepare('DELETE FROM terminal_usage WHERE task_id=?').run(task.task_id);
  assert.equal(second.usage(task.task_id).input_tokens,null);
  assert.equal(second.usage(task.task_id).input_complete,false);
  second.db.close();
});
