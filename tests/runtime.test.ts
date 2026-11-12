import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../packages/runtime/src/engine.js';
import { redact } from '../packages/runtime/src/redact.js';
import { resolveShell } from '../packages/runtime/src/shell.js';

async function finished(engine: Engine, id: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (engine.get(id).status === 'running' && Date.now() < deadline) await new Promise(resolve=>setTimeout(resolve,40));
  assert.notEqual(engine.get(id).status,'running'); return engine.get(id);
}
test('Git Bash resolves explicitly and does not select PATH WSL alias',()=> {
  const shell=resolveShell(); assert.ok(path.isAbsolute(shell.file));
  if(process.platform==='win32') assert.match(shell.file,/Git[\\/]bin[\\/]bash.exe/i);
});
test('parallel agents, failure, incremental Unicode output, cancellation, persistence',async()=> {
  const home=mkdtempSync(path.join(os.tmpdir(),'agentterminal-test-'));
  const engine=new Engine(home);
  const first=engine.start({command:"printf '你好\\n'; sleep 0.3; echo done",agent:'codex'});
  const second=engine.start({command:'echo second; exit 7',agent:'claude'});
  assert.equal((await finished(engine,second.task_id)).exit_code,7);
  assert.equal((await finished(engine,first.task_id)).status,'ok');
  const read=engine.output(first.task_id);
  assert.match(read.output,/你好/); assert.match(read.output,/done/); assert.doesNotMatch(read.output,/second/);
  assert.equal(engine.output(first.task_id,read.offset).output,'');
  const slow=engine.start({command:'sleep 30'}); engine.kill(slow.task_id);
  assert.equal((await finished(engine,slow.task_id)).status,'cancelled');
  assert.throws(()=>engine.output('../invalid'));
  const count=engine.list().length;
  engine.db.close();
  const reopened=new Engine(home); assert.equal(reopened.list().length,count); reopened.db.close();
});
test('secrets are removed from recorded commands and output',()=> {
  assert.equal(redact('TOKEN=supersecretvalue'),'TOKEN=[REDACTED]');
  assert.doesNotMatch(redact('sk-abcdefghijklmnopqrstuvwxyz'),/abcdefghijklmnopqrstuvwxyz/);
});

async function until(check: () => boolean | Promise<boolean>, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail('Timed out waiting for runtime state');
}

function fixture(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'agentterminal-regression-'));
  const engine = new Engine(home);
  t.after(async () => { await engine.close(); engine.db.close(); });
  return { engine, home };
}

function drain(engine: Engine, id: string) {
  let offset = 0, output = '', pages = 0;
  for (;;) {
    const result = engine.output(id, offset);
    assert.equal(result.offset, offset + result.output.length);
    assert.ok(Buffer.byteLength(result.output) <= 65536);
    output += result.output;
    pages++;
    if (!result.more) return { output, offset: result.offset, pages };
    assert.ok(result.offset > offset);
    offset = result.offset;
  }
}

test('streams partial ConPTY prompts and split secrets with stable cursors before exit', async t => {
  const { engine, home } = fixture(t);
  const task = engine.start({ command: "stty -echo; printf 'Enter value: '; read -r first; printf 'TOKEN=super'; sleep 1; printf 'secretvalue\\n'; printf 'ready: '; read -r third" });
  let offset = 0, output = '';
  const poll = () => {
    const result = engine.output(task.task_id, offset);
    assert.equal(result.offset, offset + result.output.length);
    offset = result.offset; output += result.output;
    assert.doesNotMatch(output, /super|secretvalue/);
    return output;
  };
  await until(() => poll().includes('Enter value: '));
  assert.equal(engine.get(task.task_id).status, 'running');
  engine.input(task.task_id, '\n');
  await until(() => poll().includes('TOKEN='));
  for (let n = 0; n < 5; n++) { poll(); await new Promise(resolve => setTimeout(resolve, 40)); }
  await until(() => poll().includes('ready: '));
  assert.match(output, /TOKEN=\[REDACTED\]/);
  engine.input(task.task_id, '\n');
  await finished(engine, task.task_id); poll();
  assert.equal(output, readFileSync(path.join(home, 'logs', `${task.task_id}.log`), 'utf8'));
});

test('paginates more than 64 KiB of Unicode without lost bytes', async t => {
  const { engine } = fixture(t);
  const task = engine.start({ command: "for ((i=0;i<3000;i++)); do printf '你好🙂abcdefghijklmnopqrstuvwxyz0123456789\\n'; done" });
  assert.equal((await finished(engine, task.task_id)).status, 'ok');
  const result = drain(engine, task.task_id);
  assert.ok(result.pages >= 3, `pages=${result.pages}, bytes=${Buffer.byteLength(result.output)}, matches=${(result.output.match(/你好🙂abcdefghijklmnopqrstuvwxyz0123456789/g) || []).length}`);
  assert.equal((result.output.match(/你好🙂abcdefghijklmnopqrstuvwxyz0123456789/g) || []).length, 3000);
  assert.doesNotMatch(result.output, /\uFFFD/);
  assert.equal(engine.output(task.task_id, result.offset).output, '');
  assert.throws(() => engine.output(task.task_id, result.offset + 1), /Invalid offset/);
  assert.throws(() => engine.output(task.task_id, -1), /Invalid offset/);
});

test('POSIX retains the entire final output burst across repeated tasks', {skip:process.platform==='win32'}, async t => {
  const { engine } = fixture(t);
  for(let attempt=0;attempt<10;attempt++) {
    const task=engine.start({command:"for ((i=0;i<3000;i++)); do printf '你好🙂abcdefghijklmnopqrstuvwxyz0123456789\\n'; done"});
    assert.equal((await finished(engine,task.task_id)).status,'ok');
    const output=drain(engine,task.task_id).output;
    assert.equal((output.match(/你好🙂abcdefghijklmnopqrstuvwxyz0123456789/g)||[]).length,3000,`output lost in burst ${attempt}`);
  }
});

test('caps logs and withholds overlong unterminated secrets', async t => {
  const { engine, home } = fixture(t);
  const huge = engine.start({ command: "printf 'TOKEN='; head -c 100000 /dev/zero | tr '\\0' x; printf '\\nfinished\\n'" });
  await finished(engine, huge.task_id);
  const hugeOutput = drain(engine, huge.task_id).output;
  assert.doesNotMatch(hugeOutput, /x{16}/);
  assert.match(hugeOutput, /Overlong output line omitted/);
  assert.match(hugeOutput, /finished/);
  const script = path.join(home, 'bulk.cjs');
  writeFileSync(script, "const fs = require('node:fs'); const chunk = 'x'.repeat(1000) + '\\n'; for (let i=0;i<35000;i++) fs.writeSync(1, chunk);");
  const task = engine.start({ command: `'${process.execPath.replace(/\\/g, '/')}' '${script.replace(/\\/g, '/')}'` });
  await finished(engine, task.task_id, 120000);
  const file = path.join(home, 'logs', `${task.task_id}.log`);
  assert.ok(statSync(file).size <= 32 * 1024 * 1024);
  const result = drain(engine, task.task_id);
  assert.equal((result.output.match(/Output truncated/g) || []).length, 1);
});

async function alive(pid: number) {
  if (process.platform === 'win32') {
    const result = await new Promise<string>((resolve, reject) => execFile(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tasklist.exe'), ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)));
    return result.includes(`"${pid}"`) || result.includes(`"${pid.toLocaleString('en-US')}"`);
  }
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test('cancellation removes host, shell and child subprocesses', async t => {
  const { engine, home } = fixture(t);
  const childFile = path.join(home, 'child.cjs');
  const pidFile = path.join(home, 'child.pid');
  writeFileSync(childFile, "require('node:fs').writeFileSync(process.argv[2], String(process.pid)); setInterval(() => {}, 1000);");
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const task = engine.start({ command: `${quote(process.execPath.replace(/\\/g, '/'))} ${quote(childFile.replace(/\\/g, '/'))} ${quote(pidFile.replace(/\\/g, '/'))} & wait` });
  await until(() => { try { return Number(readFileSync(pidFile, 'utf8')) > 0; } catch { return false; } });
  const child = Number(readFileSync(pidFile, 'utf8'));
  const shell = engine.get(task.task_id).pid!;
  const host = (engine as any).sessions.get(task.task_id).pid as number;
  assert.equal(await alive(child), true);
  engine.kill(task.task_id);
  assert.equal((await finished(engine, task.task_id)).status, 'cancelled');
  await until(async () => !(await alive(child)) && !(await alive(shell)) && !(await alive(host)));
});

test('host crash is abnormal and restart recovers running history', async t => {
  const { engine, home } = fixture(t);
  const task = engine.start({ command: 'echo started; sleep 30' });
  await until(() => engine.get(task.task_id).pid !== null);
  const pid = engine.get(task.task_id).pid!;
  (engine as any).sessions.get(task.task_id).kill('SIGKILL');
  assert.equal((await finished(engine, task.task_id)).status, 'abnormal');
  await until(async () => !(await alive(pid)));
  engine.db.prepare("UPDATE tasks SET status='running', ended_at=NULL WHERE task_id=?").run(task.task_id);
  const reopened = new Engine(home);
  assert.equal(reopened.get(task.task_id).status, 'abnormal');
  assert.ok(reopened.get(task.task_id).ended_at);
  reopened.db.close();
});

test('validates task and input limits before spawning', async t => {
  const { engine } = fixture(t);
  for (const request of [null, {}, { command: ' ' }, { command: 'x'.repeat(65537) }, { command: 'echo ok', cols: 1 }, { command: 'echo ok', rows: 301 }, { command: 'echo ok', agent: 'x'.repeat(257) }, { command: 'echo ok', cwd: '\0' }, { command: 'echo ok', interactive: 'yes' }]) {
    assert.throws(() => engine.start(request as any));
  }
  assert.equal(engine.list().length, 0);
  const task = engine.start({ command: 'sleep 30' });
  assert.throws(() => engine.input(task.task_id, 'x'.repeat(65537)));
  await engine.close();
  assert.equal(engine.get(task.task_id).status, 'cancelled');
  assert.throws(() => engine.start({ command: 'echo closed' }));
});

test('interactive mode executes the initial command and keeps accepting input', async t => {
  const { engine } = fixture(t);
  const task = engine.start({ command: "printf 'initial-command-ran\\n'", interactive: true });
  await until(() => drain(engine, task.task_id).output.includes('initial-command-ran\r\n'));
  assert.equal(engine.get(task.task_id).status, 'running');
  engine.input(task.task_id, "printf 'followup-ran\\n'\r");
  await until(() => drain(engine, task.task_id).output.includes('followup-ran\r\n'));
  engine.input(task.task_id, 'exit\r');
  assert.equal((await finished(engine, task.task_id)).status, 'ok');
});

test('hook persistence redacts nested sensitive keys and strings', async t => {
  const { engine } = fixture(t);
  engine.hook({ nested: [{ token: 'short', PASSWORD: { raw: 'hidden' }, text: 'TOKEN=secretvalue' }], api_key: 'alsohidden', message: 'visible' });
  const row = engine.db.prepare('SELECT event FROM hooks').get() as { event: string };
  assert.doesNotMatch(row.event, /short|hidden|secretvalue/);
  assert.equal(JSON.parse(row.event).message, 'visible');
  assert.throws(() => engine.hook(undefined), /Invalid hook event/);
});
