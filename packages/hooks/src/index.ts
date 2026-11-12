import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { redact } from '../../runtime/src/redact.js';

export type HookOptions = { agent: 'codex' | 'claude'; mode: 'prefer' | 'audit' | 'strict'; home?: string };
export type HookEvent = Record<string, unknown>;
export type HookResult = { hookSpecificOutput?: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string } };

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /key|token|secret|password|authorization|credential/i.test(key) ? '[REDACTED]' : sanitize(entry)]));
  }
  if (typeof value === 'string') return redact(value.replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]'));
  return value;
}

export async function handleHook(event: HookEvent, options: HookOptions): Promise<HookResult> {
  const home = resolve(options.home || process.env.AGENT_TERMINAL_HOME || join(homedir(), '.agentterminal'));
  try {
    const connection = JSON.parse(readFileSync(join(home, 'connection.json'), 'utf8'));
    const base = connection.base_url ?? connection.url ?? (connection.port ? `http://127.0.0.1:${connection.port}` : undefined);
    const url = new URL('/api/hooks', base);
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Invalid runtime connection');
    const token = connection.token;
    if (typeof token !== 'string' || !token) throw new Error('Missing runtime authentication');
    const response = await fetch(url, {
      method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...event, agent: options.agent, mode: options.mode }),
      signal: AbortSignal.timeout(2000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Runtime did not record hook');
  } catch {
    try {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      appendFileSync(join(home, 'unobserved.jsonl'), JSON.stringify(sanitize({ ...event, timestamp: new Date().toISOString(), agent: options.agent, mode: options.mode, observed: false })) + '\n', { mode: 0o600 });
    } catch {}
    process.stderr.write('AgentTerminal: hook unobserved; runtime unavailable. Allowing tool execution.\n');
    return {};
  }
  const tool = event.tool_name;
  if (options.mode === 'strict' && event.hook_event_name === 'PreToolUse' && typeof tool === 'string' && ['Bash', 'PowerShell', 'powershell', 'pwsh', 'CMD', 'cmd', 'shell', 'exec_command'].includes(tool)) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Use AgentTerminal MCP tools to execute shell commands. If tools are deferred, use ToolSearch to discover agentterminal run/start/read/status, then retry through MCP. Native file tools such as Read/Grep/Edit remain available.' } };
  }
  return {};
}

export function parseArguments(args: string[]): HookOptions {
  let agent: HookOptions['agent'] = 'codex';
  let mode: HookOptions['mode'] = 'audit';
  let home: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (flag === '--agent' && (value === 'codex' || value === 'claude')) agent = value;
    else if (flag === '--mode' && (value === 'prefer' || value === 'audit' || value === 'strict')) mode = value;
    else if (flag === '--home' && value) home = resolve(value);
    else throw new Error('Invalid hook arguments');
  }
  return { agent, mode, ...(home ? { home } : {}) };
}
