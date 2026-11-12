import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, renameSync, appendFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as TOML from '@iarna/toml';

export type Agent = 'codex' | 'claude';
export type Mode = 'prefer' | 'audit' | 'strict';
type Json = Record<string, any>;
type Change = { path: string; before: string | null; after: string | null };
type Managed = { path: string; kind: 'json' | 'array' | 'text' | 'file'; key?: string[]; before: any; after: any };
type State = { mode?: Mode; agents: Partial<Record<Agent, { mode: Mode; entries: Managed[]; snapshots?: Change[] }>> };

const start = '<!-- agentterminal:start -->';
const end = '<!-- agentterminal:end -->';
const instructions = `${start}\nUse AgentTerminal MCP tools for shell commands, with Git Bash by default. Select PowerShell or CMD explicitly. If MCP tools are deferred, discover agentterminal run/start/read/status with ToolSearch before executing commands. Use native Read/Grep/Glob/Edit tools for file operations; those are not terminal tasks. For long-running commands, poll the existing task ID and incremental output; do not start duplicate commands. Never treat timeout or disconnection as success. Report MCP failures and follow the configured fallback policy.\n${end}`;
const skill = '---\nname: agentterminal\ndescription: Execute and observe shell commands through AgentTerminal MCP.\n---\n\n' + instructions + '\n';

function agentName(agent: Agent): void {
  if (agent !== 'codex' && agent !== 'claude') throw new Error('Unsupported agent');
}
function modeName(mode: Mode): void {
  if (!['prefer', 'audit', 'strict'].includes(mode)) throw new Error('Unsupported integration mode');
}
function storage(): string { return resolve(process.env.AGENT_TERMINAL_HOME || join(homedir(), '.agentterminal')); }
function home(agent: Agent): string {
  agentName(agent);
  return resolve(agent === 'codex' ? process.env.CODEX_HOME || join(homedir(), '.codex') : process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'));
}
function mcpPath(agent: Agent): string {
  return agent === 'codex' ? join(home(agent), 'config.toml') : process.env.CLAUDE_CONFIG_DIR ? join(home(agent), '.claude.json') : join(homedir(), '.claude.json');
}
function read(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; }
}
function json(text: string | null): Json {
  if (text === null) return {};
  try {
    const doc = JSON.parse(text);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error();
    return doc;
  } catch { throw new Error('Invalid JSON configuration'); }
}
function toml(text: string): Json {
  try { return TOML.parse(text) as Json; }
  catch { throw new Error('Invalid TOML configuration'); }
}
function format(value: unknown): string { return JSON.stringify(value, null, 2) + '\n'; }
function equal(a: any, b: any): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function state(): State { return { agents: {}, ...json(read(join(storage(), 'installer.json'))) }; }
function write(path: string, content: string | null): void {
  if (read(path) === content) return;
  if (existsSync(path)) {
    const dir = join(storage(), 'backups');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const backup = join(dir, `${Date.now()}-${randomUUID()}.bak`);
    copyFileSync(path, backup);
    chmodSync(backup, 0o600);
    appendFileSync(join(dir, 'index.jsonl'), JSON.stringify({ path, backup, created_at: new Date().toISOString() }) + '\n', { mode: 0o600 });
  }
  if (content === null) { if (existsSync(path)) unlinkSync(path); return; }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
function at(value: Json, key: string[]): any { return key.reduce((v, k) => v?.[k], value); }
function put(value: Json, key: string[], next: any): void {
  let target = value;
  for (const k of key.slice(0, -1)) {
    if (target[k] === undefined) target[k] = {};
    if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) throw new Error('Invalid configuration structure');
    target = target[k];
  }
  const last = key[key.length - 1]!;
  if (next === undefined) {
    delete target[last];
    for (let i = key.length - 1; i > 0; i--) {
      const parent = at(value, key.slice(0, i));
      if (parent && Object.keys(parent).length === 0) delete at(value, key.slice(0, i - 1))[key[i - 1]!];
      else break;
    }
  } else target[last] = next;
}

function tableRange(text: string): { start: number; end: number } | undefined {
  const headers = [...text.matchAll(/^[ \t]*\[\[?([^\]\r\n]+)\]\]?[^\r\n]*(?:\r?\n|$)/gm)];
  const normalize = (header: string) => header.replace(/["'\s]/g, '');
  const index = headers.findIndex(m => normalize(m[1]!) === 'mcp_servers.agentterminal');
  if (index < 0) return undefined;
  const first = headers[index]!;
  let next = index + 1;
  while (next < headers.length && normalize(headers[next]![1]!).startsWith('mcp_servers.agentterminal.')) next++;
  return { start: first.index!, end: headers[next]?.index ?? text.length };
}
function textPart(text: string, key?: string[]): string | null {
  if (key?.[0] === 'toml') { const range = tableRange(text); return range ? text.slice(range.start, range.end) : null; }
  const a = text.indexOf(start), b = text.indexOf(end, a);
  if (a < 0) return null;
  if (b < 0) throw new Error('Incomplete AgentTerminal managed section');
  return text.slice(a, b + end.length);
}
function replacePart(text: string, key: string[] | undefined, next: string | null): string {
  const current = textPart(text, key);
  if (current !== null) return text.replace(current, next || '');
  if (!next) return text;
  return text + (text && !text.endsWith('\n') ? '\n' : '') + next + (next.endsWith('\n') ? '' : '\n');
}
function redact(text: string | null): string | null {
  if (text === null) return null;
  try {
    const scrub = (v: any): any => {
      if (Array.isArray(v)) return v.map(scrub);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /key|token|secret|password|authorization|credential/i.test(k) ? '[REDACTED]' : scrub(x)]));
      return typeof v === 'string' ? scrubText(v) : v;
    };
    return format(scrub(JSON.parse(text)));
  } catch { return scrubText(text); }
}
function scrubText(text: string): string {
  return text.replace(/^(\s*[^\r\n=]*(?:key|token|secret|password|authorization|credential)[^\r\n=]*\s*=\s*)(?:'''[\s\S]*?'''|"""[\s\S]*?"""|[^\r\n]*)/gim, '$1"[REDACTED]"')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:api_?key|token|secret|password)=)[^&\s"']*/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-[a-z0-9_-]+|Bearer\s+[^\s"']+)/gi, '[REDACTED]');
}

function plan(agent: Agent, mode: Mode, uninstall = false): { files: Change[]; next: State } {
  agentName(agent); modeName(mode);
  const next = state();
  const files = new Map<string, Change>();
  const get = (path: string): string | null => {
    if (!files.has(path)) { const before = read(path); files.set(path, { path, before, after: before }); }
    return files.get(path)!.after;
  };
  const set = (path: string, after: string | null) => { get(path); files.get(path)!.after = after; };
  const restored = new Set<string>();
  for (const snapshot of next.agents[agent]?.snapshots || []) {
    if (get(snapshot.path) === snapshot.after) { set(snapshot.path, snapshot.before); restored.add(snapshot.path); }
  }
  for (const entry of next.agents[agent]?.entries || []) {
    if (restored.has(entry.path)) continue;
    const content = get(entry.path);
    if (entry.kind === 'file') { if (content === entry.after) set(entry.path, entry.before); }
    else if (entry.kind === 'text') {
      const current = textPart(content || '', entry.key);
      const unchanged = current === entry.after || (entry.key?.[0] === 'toml' && current !== null && equal(toml(current), toml(entry.after)));
      if (unchanged) set(entry.path, replacePart(content || '', entry.key, entry.before));
    } else {
      const doc = json(content);
      const current = at(doc, entry.key!);
      if (entry.kind === 'array') {
        if (Array.isArray(current)) {
          const remaining = current.filter(item => !equal(item, entry.after));
          if (remaining.length !== current.length) { put(doc, entry.key!, remaining.length ? remaining : entry.before); set(entry.path, format(doc)); }
        }
      } else if (equal(current, entry.after)) { put(doc, entry.key!, entry.before); set(entry.path, format(doc)); }
    }
  }
  if (uninstall) {
    delete next.agents[agent];
    next.mode = Object.values(next.agents).at(-1)?.mode || 'prefer';
  }
  else {
    const originals = new Map<string, string | null>();
    for (const file of files.values()) originals.set(file.path, file.after);
    const entries: Managed[] = [];
    const add = (entry: Managed) => { entries.push(entry); };
    const node = process.execPath;
    const mcp = fileURLToPath(new URL('../../mcp/src/index.js', import.meta.url));
    const hooks = fileURLToPath(new URL('../../hooks/src/cli.js', import.meta.url));
    const server = { command: node, args: [mcp, '--agent', agent], env: { AGENT_TERMINAL_HOME: storage() } };
    const path = mcpPath(agent);
    if (agent === 'codex') {
      const content = get(path) || '';
      const parsed = toml(content);
      if (parsed.mcp_servers?.agentterminal && !tableRange(content)) throw new Error('AgentTerminal MCP must use a TOML table before it can be managed');
      const after = '[mcp_servers.agentterminal]\ncommand = ' + JSON.stringify(node) + '\nargs = ' + JSON.stringify(server.args) + '\n[mcp_servers.agentterminal.env]\nAGENT_TERMINAL_HOME = ' + JSON.stringify(storage()) + '\n';
      add({ path, kind: 'text', key: ['toml'], before: textPart(content, ['toml']), after });
      set(path, replacePart(content, ['toml'], after));
    } else {
      const doc = json(get(path)), key = ['mcpServers', 'agentterminal'];
      add({ path, kind: 'json', key, before: at(doc, key), after: server });
      put(doc, key, server); set(path, format(doc));
    }
    if (mode !== 'prefer') {
      const path = join(home(agent), agent === 'codex' ? 'hooks.json' : 'settings.json');
      const doc = json(get(path));
      for (const event of ['PreToolUse', 'PostToolUse']) {
        const key = ['hooks', event];
        const current = at(doc, key);
        if (current !== undefined && !Array.isArray(current)) throw new Error('Hook configuration must be an array');
        const quote = (arg: string) => '"' + (process.platform === 'win32' ? arg.replace(/"/g, '\\"') : arg.replace(/(["$`\\])/g, '\\$1')) + '"';
        const command = (process.platform === 'win32' && agent === 'codex' ? '& ' : '') + [quote(node), quote(hooks), '--mode', mode, '--agent', agent, '--home', quote(storage())].join(' ');
        const group = { matcher: '.*', hooks: [{ type: 'command', command, timeout: 3 }] };
        add({ path, kind: 'array', key, before: current === undefined ? undefined : [], after: group });
        put(doc, key, [...(current || []), group]);
      }
      set(path, format(doc));
    }
    const guide = join(home(agent), agent === 'codex' ? 'AGENTS.md' : 'CLAUDE.md');
    const content = get(guide) || '';
    add({ path: guide, kind: 'text', before: textPart(content), after: instructions });
    set(guide, replacePart(content, undefined, instructions));
    const skillPath = join(home(agent), 'skills', 'agentterminal', 'SKILL.md');
    const existing = get(skillPath);
    if (existing === null || existing === skill) {
      add({ path: skillPath, kind: 'file', before: existing, after: skill });
      set(skillPath, skill);
    }
    next.agents[agent] = { mode, entries, snapshots: [...files.values()].map(file => ({ ...file, before: originals.has(file.path) ? originals.get(file.path)! : file.before })) };
    next.mode = mode;
  }
  return { files: [...files.values()].filter(f => f.before !== f.after), next };
}

export function previewIntegration(agent: Agent, mode: Mode): { files: Change[] } {
  return { files: plan(agent, mode).files.map(f => ({ ...f, before: redact(f.before), after: redact(f.after) })) };
}
export function installIntegration(agent: Agent, mode: Mode) {
  const result = plan(agent, mode);
  for (const file of result.files) write(file.path, file.after);
  write(join(storage(), 'installer.json'), format(result.next));
  return getConfiguration();
}
export function uninstallIntegration(agent: Agent) {
  agentName(agent);
  const result = plan(agent, state().agents[agent]?.mode || 'prefer', true);
  for (const file of result.files) write(file.path, file.after);
  write(join(storage(), 'installer.json'), format(result.next));
  return getConfiguration();
}

export function toggleSkill(agent: Agent, enabled: boolean) {
  agentName(agent);
  if (typeof enabled !== 'boolean') throw new Error('Skill enabled must be a boolean');
  const path = join(home(agent), 'skills', 'agentterminal', 'SKILL.md');
  const before = read(path);
  if (enabled && before !== null && before !== skill) throw new Error('An unmanaged AgentTerminal skill already exists');
  if (enabled) write(path, skill);
  else if (before === skill) write(path, null);
  return getConfiguration();
}
export function getConfiguration() {
  const saved = state();
  const agents = Object.fromEntries((['codex', 'claude'] as Agent[]).map(agent => {
    const path = mcpPath(agent);
    const doc = agent === 'codex' ? toml(read(path) || '') : json(read(path));
    const hookDoc = json(read(join(home(agent), agent === 'codex' ? 'hooks.json' : 'settings.json')));
    const mcp = Boolean(agent === 'codex' ? doc.mcp_servers?.agentterminal : doc.mcpServers?.agentterminal);
    const hook = Object.values(hookDoc.hooks || {}).some((groups: any) => Array.isArray(groups) && groups.some(g => g.hooks?.some((h: any) => typeof h.command === 'string' && h.command.includes(fileURLToPath(new URL('../../hooks/src/cli.js', import.meta.url))))));
    const hasSkill = read(join(home(agent), 'skills', 'agentterminal', 'SKILL.md')) === skill;
    return [agent, { installed: Boolean(saved.agents[agent]) && mcp, home: home(agent), mcp, hook, skill: hasSkill }];
  })) as Record<Agent, { installed: boolean; home: string; mcp: boolean; hook: boolean; skill: boolean }>;
  return { agents, mode: saved.mode || 'prefer' as Mode };
}
