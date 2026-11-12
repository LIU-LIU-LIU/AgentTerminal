import { EventEmitter } from 'node:events';
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killProcessTree, resolveShell } from './shell.js';
import { redact } from './redact.js';
import { loadShellSettings } from './settings.js';
import { tokenWeight } from './usage.js';

export interface Task {
  task_id: string; agent: string; session: string; cwd: string; shell: string; command: string;
  status: 'running' | 'ok' | 'failed' | 'cancelled' | 'abnormal'; exit_code: number | null;
  pid: number | null; started_at: string; ended_at: string | null;
}
export interface StartRequest { command: string; cwd?: string; shell?: string; agent?: string; session?: string; cols?: number; rows?: number; interactive?: boolean; }

const MAX_LOG = 32 * 1024 * 1024;
const TRUNCATED = '\r\n[Output truncated: 32 MiB limit reached]\r\n';
const MAX_LINE = 65536;
interface Stream { raw: string; published: number; dropping: boolean; bytes: number; truncated: boolean; }

export class Engine extends EventEmitter {
  readonly db: Database.Database;
  private sessions = new Map<string, ChildProcess>();
  private pending = new Map<string, Stream>();
  private cancelled = new Set<string>();
  private closing = false;
  private cursors = new Map<string, { units: number; bytes: number }[]>();
  private secretValues = Object.entries(process.env).filter(([name, value]) => /key|token|secret|password/i.test(name) && value && value.length >= 8).map(([, value]) => value!);
  constructor(readonly home: string) {
    super();
    mkdirSync(path.join(home, 'logs'), { recursive: true });
    this.db = new Database(path.join(home, 'history.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY, agent TEXT, session TEXT, cwd TEXT, shell TEXT, command TEXT,
      status TEXT, exit_code INTEGER, pid INTEGER, started_at TEXT, ended_at TEXT);
      CREATE TABLE IF NOT EXISTS hooks (id INTEGER PRIMARY KEY, created_at TEXT, event TEXT);`);
    this.db.exec('CREATE TABLE IF NOT EXISTS terminal_usage (task_id TEXT PRIMARY KEY, input_weight REAL, output_weight REAL NOT NULL DEFAULT 0, input_complete INTEGER NOT NULL DEFAULT 1)');
    this.db.prepare("UPDATE tasks SET status='abnormal', ended_at=? WHERE status='running'").run(new Date().toISOString());
  }
  start(input: StartRequest): Task {
    if (this.closing) throw new Error('Engine is closed');
    if (!input || typeof input !== 'object') throw new Error('Invalid task');
    if (typeof input.command !== 'string' || !input.command.trim()) throw new Error('command is required');
    if (input.command.length > 65536) throw new Error('command too large');
    for (const [name, limit] of [['cwd', 32768], ['shell', 32], ['agent', 256], ['session', 256]] as const) {
      const value = input[name];
      if (value !== undefined && (typeof value !== 'string' || value.length > limit || value.includes('\0'))) throw new Error(`Invalid ${name}`);
    }
    if (input.command.includes('\0')) throw new Error('Invalid command');
    if (input.interactive !== undefined && typeof input.interactive !== 'boolean') throw new Error('Invalid interactive flag');
    const cols = input.cols ?? 100, rows = input.rows ?? 30;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols > 500 || rows > 300) throw new Error('Invalid terminal size');
    if (this.sessions.size >= 32) throw new Error('Concurrent task limit reached (32)');
    const settings=loadShellSettings(this.home);
    const shell = input.shell || settings.default_shell;
    const spec = resolveShell(shell,settings.paths[shell as keyof typeof settings.paths]);
    const cwd = path.resolve(input.cwd || process.cwd());
    if (!statSync(cwd).isDirectory()) throw new Error('cwd must be a directory');
    const task: Task = { task_id: randomUUID(), agent: input.agent || 'manual', session: input.session || '', cwd, shell, command: redact(input.command), status: 'running', exit_code: null, pid: null, started_at: new Date().toISOString(), ended_at: null };
    const env = { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', PAGER: 'cat', GIT_PAGER: 'cat', MSYS_NO_PATHCONV: '1' } as Record<string, string>;
    const args = shell === 'gitbash' ? [...spec.args, ...(input.interactive ? ['-i'] : ['-c', input.command])] : [...spec.args, input.command];
    const compiled = fileURLToPath(new URL('./pty-host.js', import.meta.url));
    const terminal = fork(existsSync(compiled) ? compiled : fileURLToPath(new URL('./pty-host.ts', import.meta.url)), [], { stdio: ['ignore','ignore','pipe','ipc'], windowsHide:true });
    this.db.prepare('INSERT INTO tasks VALUES (@task_id,@agent,@session,@cwd,@shell,@command,@status,@exit_code,@pid,@started_at,@ended_at)').run(task);
    this.db.prepare('INSERT INTO terminal_usage(task_id,input_weight) VALUES (?,?)').run(task.task_id, tokenWeight(task.command));
    writeFileSync(this.logPath(task.task_id), '', { mode: 0o600 });
    this.sessions.set(task.task_id, terminal);
    this.pending.set(task.task_id, { raw: '', published: 0, dropping: false, bytes: 0, truncated: false });
    terminal.stderr?.on('data', data => this.stream(task.task_id, data.toString()));
    let childPid: number | undefined;
    let finishing = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    terminal.on('message', (message: any) => {
      if (finishing) return;
      if (message.type === 'ready') { childPid = message.pid; this.db.prepare('UPDATE tasks SET pid=? WHERE task_id=?').run(message.pid, task.task_id); return; }
      if (message.type === 'error') { this.stream(task.task_id, `${message.error}\n`); return; }
      if (message.type === 'exit') { finish(message.exitCode, message.signal); return; }
      if (message.type !== 'data') return;
      this.stream(task.task_id, message.data);
      this.emit('event', { type: 'output', task_id: task.task_id });
    });
    const finish = async (exitCode: number | null, signal?: number | string | null) => {
      if (!this.sessions.has(task.task_id) || finishing) return;
      finishing = true;
      if (killTimer) clearTimeout(killTimer);
      if (childPid && signal) await killProcessTree(childPid);
      if (terminal.connected) terminal.disconnect();
      if (terminal.exitCode === null && terminal.signalCode === null) {
        const timer = setTimeout(() => { void killProcessTree(terminal.pid!); }, 1000);
        timer.unref();
        terminal.once('exit', () => clearTimeout(timer));
      }
      this.stream(task.task_id, '', true);
      this.pending.delete(task.task_id);
      this.sessions.delete(task.task_id);
      const status = this.cancelled.delete(task.task_id) ? 'cancelled' : signal || exitCode === null ? 'abnormal' : exitCode === 0 ? 'ok' : 'failed';
      this.db.prepare('UPDATE tasks SET status=?,exit_code=?,ended_at=? WHERE task_id=?').run(status, exitCode, new Date().toISOString(), task.task_id);
      this.emit('event', { type: 'task', task: this.get(task.task_id) });
    };
    terminal.on('close', (code, signal) => {
      if (!finishing) this.stream(task.task_id, `\r\n[PTY host exited unexpectedly: ${signal || code}]\r\n`);
      void finish(null, 1);
    });
    terminal.on('error', error => { this.stream(task.task_id, `${error.message}\n`); void finish(null, 1); });
    terminal.on('disconnect', () => {
      killTimer = setTimeout(() => { void finish(null, 1); }, 1000);
      killTimer.unref();
    });
    terminal.send({ type:'start', file:spec.file, args, initialInput: input.interactive && shell === 'gitbash' ? input.command + '\r' : undefined, options:{name:'xterm-256color',cwd,env,cols,rows} }, error => { if (error) void finish(null, 1); });
    this.emit('event', { type: 'task', task });
    return task;
  }
  private logPath(id: string) { this.get(id); return path.join(this.home, 'logs', `${id}.log`); }
  private append(id: string, chunk: string) {
    const state = this.pending.get(id)!;
    if (!chunk || state.truncated) return;
    const buffer = Buffer.from(chunk);
    const remaining = MAX_LOG - Buffer.byteLength(TRUNCATED) - state.bytes;
    let length = Math.min(buffer.length, remaining);
    while (length > 0 && length < buffer.length && (buffer[length] & 0xc0) === 0x80) length--;
    if (length) {
      appendFileSync(path.join(this.home, 'logs', `${id}.log`), buffer.subarray(0, length));
      this.db.prepare('UPDATE terminal_usage SET output_weight=output_weight+? WHERE task_id=?').run(tokenWeight(buffer.subarray(0,length).toString('utf8')),id);
    }
    state.bytes += length;
    if (buffer.length > remaining) {
      appendFileSync(path.join(this.home, 'logs', `${id}.log`), TRUNCATED);
      state.bytes += Buffer.byteLength(TRUNCATED);
      state.truncated = true;
      state.raw = '';
    }
  }
  private stream(id: string, chunk: string, final = false) {
    const state = this.pending.get(id);
    if (!state || state.truncated) return;
    const publish = (complete: boolean) => {
      let end = state.raw.length;
      if (!complete) {
        const token = state.raw.match(/[^\s"';&=:]+$/);
        if (token) end = token.index!;
        if (end > 0 && /[\uD800-\uDBFF]/.test(state.raw[end - 1])) end--;
        for (const value of this.secretValues) {
          let match = state.raw.indexOf(value);
          while (match >= 0) {
            if (match < end && match + value.length > end) end = match;
            match = state.raw.indexOf(value, match + value.length);
          }
          for (let size = Math.min(value.length - 1, state.raw.length); size > 0; size--) {
            if (state.raw.endsWith(value.slice(0, size))) { end = Math.min(end, state.raw.length - size); break; }
          }
        }
      }
      const safe = redact(state.raw.slice(0, end));
      this.append(id, safe.slice(state.published));
      state.published = safe.length;
    };
    if (state.dropping) {
      const boundary = chunk.search(/[\r\n]/);
      if (boundary < 0) return;
      chunk = chunk.slice(boundary + 1);
      state.dropping = false;
    }
    const combined = state.raw + chunk;
    const boundary = Math.max(combined.lastIndexOf('\n'), combined.lastIndexOf('\r'));
    if (boundary >= 0) {
      let complete = combined.slice(0, boundary + 1);
      const firstEnd = complete.search(/[\r\n]/);
      if (firstEnd > MAX_LINE) state.published = 0;
      complete = complete.replace(/[^\r\n]{65537,}/g, '[Overlong output line omitted]');
      this.append(id, redact(complete).slice(state.published));
      state.raw = combined.slice(boundary + 1);
      state.published = 0;
    } else state.raw = combined;
    if (state.raw.length > MAX_LINE) {
      this.append(id, '\r\n[Overlong output line omitted]\r\n');
      state.raw = ''; state.published = 0; state.dropping = true;
    } else if (!state.truncated) publish(false);
    if (final && !state.dropping) publish(true);
  }
  get(id: string): Task {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id=?').get(id) as Task | undefined;
    if (!row) throw new Error('Task not found');
    return row;
  }
  // Keep long-running work visible even after hundreds of newer tasks have finished.
  list() { return this.db.prepare("SELECT * FROM tasks ORDER BY (status = 'running') DESC, started_at DESC LIMIT 500").all() as Task[]; }
  output(id: string, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid offset');
    const task = this.get(id);
    const fd = openSync(this.logPath(id), 'r');
    try {
      const size = fstatSync(fd).size;
      const cursors = this.cursors.get(id) || [{ units: 0, bytes: 0 }];
      this.cursors.set(id, cursors);
      let cursor = cursors[0];
      for (const candidate of cursors) if (candidate.units <= offset && candidate.units > cursor.units) cursor = candidate;
      let position = cursor.bytes, units = cursor.units;
      const read = () => {
        const buffer = Buffer.allocUnsafe(Math.min(65536, size - position));
        let length = readSync(fd, buffer, 0, buffer.length, position);
        if (length && position + length < size) {
          let start = length - 1;
          while (start > 0 && (buffer[start] & 0xc0) === 0x80) start--;
          const lead = buffer[start];
          const width = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4;
          if (length - start < width) length = start;
        }
        return buffer.toString('utf8', 0, length);
      };
      while (units < offset) {
        const text = read();
        if (!text) throw new Error('Invalid offset');
        const count = Math.min(offset - units, text.length);
        if (count < text.length && /[\uD800-\uDBFF]/.test(text[count - 1])) throw new Error('Offset splits a surrogate pair');
        position += Buffer.byteLength(text.slice(0, count)); units += count;
        if (position - cursors[cursors.length - 1].bytes >= 32768) cursors.push({ units, bytes: position });
      }
      const output = read();
      const next = position + Buffer.byteLength(output);
      if (next - cursors[cursors.length - 1].bytes >= 32768) cursors.push({ units: offset + output.length, bytes: next });
      return { output, offset: offset + output.length, done: task.status !== 'running', more: next < size };
    } finally { closeSync(fd); }
  }
  input(id: string, input: string) { const terminal = this.sessions.get(id); if (!terminal?.connected) throw new Error('Task is not running'); if(typeof input !== 'string' || input.length > 65536) throw new Error('input must be text of at most 65536 characters'); terminal.send({type:'input',input}, () => {}); this.db.prepare('UPDATE terminal_usage SET input_weight=input_weight+? WHERE task_id=?').run(tokenWeight(redact(input)),id); }
  usage(id: string) {
    this.get(id);
    let row = this.db.prepare('SELECT * FROM terminal_usage WHERE task_id=?').get(id) as {input_weight:number|null;output_weight:number;input_complete:number}|undefined;
    if (!row) {
      this.db.prepare('INSERT INTO terminal_usage(task_id,input_weight,output_weight,input_complete) VALUES (?,NULL,?,0)').run(id, tokenWeight(readFileSync(this.logPath(id),'utf8')));
      row = this.db.prepare('SELECT * FROM terminal_usage WHERE task_id=?').get(id) as NonNullable<typeof row>;
    }
    return { input_tokens: row.input_weight===null?null:Math.ceil(row.input_weight), output_tokens:Math.ceil(row.output_weight), input_complete:Boolean(row.input_complete), output_truncated:statSync(this.logPath(id)).size>=MAX_LOG-Buffer.byteLength(TRUNCATED), estimated:true, method:'terminal-text-heuristic-v1', basis:'redacted retained terminal text; Latin ~4 characters/token, CJK ~1 character/token; not model usage' };
  }
  resize(id: string, cols: number, rows: number) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols > 500 || rows > 300) throw new Error('Invalid terminal size');
    const terminal = this.sessions.get(id);
    if (terminal?.connected) terminal.send({type:'resize',cols,rows}, () => {});
  }
  kill(id: string) {
    this.get(id);
    const terminal = this.sessions.get(id);
    if (terminal && !this.cancelled.has(id)) {
      this.cancelled.add(id);
      if (terminal.connected) terminal.send({type:'kill'}, () => {});
      const timer = setTimeout(() => { if (this.sessions.has(id)) void killProcessTree(terminal.pid!); }, 7000);
      timer.unref();
      terminal.once('exit', () => clearTimeout(timer));
    }
  }
  hook(event: unknown) {
    const sensitive = /api[_-]?key|token|password|secret|authorization/i;
    const serialized = JSON.stringify(event, (key, value) => sensitive.test(key) ? '[REDACTED]' : typeof value === 'string' ? redact(value) : value);
    if (serialized === undefined || Buffer.byteLength(serialized) > 65536) throw new Error('Invalid hook event');
    this.db.prepare('INSERT INTO hooks(created_at,event) VALUES (?,?)').run(new Date().toISOString(), serialized);
    this.emit('event', { type: 'hook' });
  }
  stats() {
    const groups = this.db.prepare('SELECT agent,status,COUNT(*) AS count, SUM((julianday(COALESCE(ended_at,?))-julianday(started_at))*86400000) AS duration_ms FROM tasks GROUP BY agent,status').all(new Date().toISOString());
    return { groups, total: (this.db.prepare('SELECT COUNT(*) AS count FROM tasks').get() as {count:number}).count, running: this.sessions.size, hooks: this.db.prepare('SELECT COUNT(*) AS count FROM hooks').get(), shells: this.db.prepare('SELECT shell,COUNT(*) AS count FROM tasks GROUP BY shell').all() };
  }
  export() { return this.db.prepare('SELECT * FROM tasks ORDER BY started_at').all().map(row => JSON.stringify(row)).join('\n'); }
  async close() {
    this.closing = true;
    const exits = [...this.sessions.values()].map(terminal => new Promise<void>(resolve => terminal.once('exit', () => resolve())));
    for (const [id] of this.sessions) this.kill(id);
    await Promise.all(exits);
    while (this.sessions.size) await new Promise(resolve => setTimeout(resolve, 10));
  }
}
