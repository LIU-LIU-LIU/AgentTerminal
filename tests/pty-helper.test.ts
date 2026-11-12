import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, statSync, mkdtempSync } from 'node:fs';
import { preparePtyHelper } from '../packages/runtime/src/pty-helper.js';
import { Engine } from '../packages/runtime/src/engine.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('macOS repairs packaged spawn-helper permissions and executes a task', {skip:process.platform!=='darwin'}, async t => {
  const helper=preparePtyHelper()!;
  const original=statSync(helper).mode;
  t.after(()=>chmodSync(helper,original));
  chmodSync(helper,0o644);
  const home=mkdtempSync(join(tmpdir(),'agentterminal-pty-helper-'));
  const engine=new Engine(home);
  t.after(async()=>{await engine.close();engine.db.close();});
  const task=engine.start({command:'echo repaired-helper; exit 7'});
  const deadline=Date.now()+15000;
  while(engine.get(task.task_id).status==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
  const state=engine.get(task.task_id);
  assert.equal(state.status,'failed',engine.output(task.task_id).output);
  assert.equal(state.exit_code,7);
  assert.match(engine.output(task.task_id).output,/repaired-helper/);
  assert.equal(statSync(helper).mode&0o111,0o111);
  assert.equal(preparePtyHelper(),helper);
});

test('other platforms do not modify node-pty helper permissions', {skip:process.platform==='darwin'},()=>{
  assert.equal(preparePtyHelper(),undefined);
});
