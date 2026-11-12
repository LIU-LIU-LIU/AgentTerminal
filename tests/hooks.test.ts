import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleHook, parseArguments } from '../packages/hooks/src/index.js';

function sandbox(t: any) {
  const previous = process.env.AGENT_TERMINAL_HOME;
  const home = mkdtempSync(join(tmpdir(), 'agentterminal-hooks-'));
  process.env.AGENT_TERMINAL_HOME = home;
  t.after(() => { if (previous === undefined) delete process.env.AGENT_TERMINAL_HOME; else process.env.AGENT_TERMINAL_HOME = previous; });
  return home;
}

test('records authenticated events before strict local decisions; MCP and post hooks always pass', async t => {
  const home = sandbox(t);
  const received: any[] = [];
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/api/hooks');
    assert.equal(req.headers.authorization, 'Bearer test-token');
    let body = ''; for await (const chunk of req) body += chunk;
    received.push(JSON.parse(body));
    res.writeHead(204); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  writeFileSync(join(home, 'connection.json'), JSON.stringify({ url: `http://127.0.0.1:${(server.address() as any).port}`, token: 'test-token' }));
  for (const tool_name of ['Bash', 'PowerShell', 'powershell', 'pwsh', 'CMD', 'cmd', 'shell', 'exec_command']) {
    const result = await handleHook({ tool_name, hook_event_name: 'PreToolUse' }, { agent: 'codex', mode: 'strict' });
    assert.equal(result.hookSpecificOutput?.permissionDecision, 'deny');
    assert.match(result.hookSpecificOutput!.permissionDecisionReason, /ToolSearch.*agentterminal/);
  }
  for (const tool_name of ['mcp__agentterminal__run', 'mcp__other__exec_command', 'Read', 'shell_command']) assert.deepEqual(await handleHook({ tool_name, hook_event_name: 'PreToolUse' }, { agent: 'claude', mode: 'strict' }), {});
  assert.deepEqual(await handleHook({ tool_name: 'Bash', hook_event_name: 'PostToolUse' }, { agent: 'claude', mode: 'strict' }), {});
  assert.deepEqual(await handleHook({ tool_name: 'Bash', hook_event_name: 'PreToolUse' }, { agent: 'codex', mode: 'audit' }), {});
  assert.equal(received.length, 14);
  assert.equal(received[0].agent, 'codex');
});

test('runtime errors and 2-second timeouts fail open with unobserved JSONL', async t => {
  const home = sandbox(t);
  const server = createServer((req, res) => { if (req.headers.authorization === 'Bearer rejected') { res.writeHead(401); res.end(); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  for (const token of ['rejected', 'hang']) {
    writeFileSync(join(home, 'connection.json'), JSON.stringify({ url, token }));
    const start = Date.now();
    assert.deepEqual(await handleHook({ tool_name: 'Bash', hook_event_name: 'PreToolUse' }, { agent: 'codex', mode: 'strict' }), {});
    assert(Date.now() - start < 3500);
  }
  const rows = readFileSync(join(home, 'unobserved.jsonl'), 'utf8').trim().split('\n').map(row => JSON.parse(row));
  assert.equal(rows.length, 2);
  assert(rows.every(row => row.observed === false && row.tool_name === 'Bash'));
  assert(!JSON.stringify(rows).includes('rejected'));
});

test('CLI consumes stdin, fails open on malformed input, and validates arguments', async t => {
  sandbox(t);
  assert.deepEqual(parseArguments(['--mode', 'strict', '--agent', 'claude']), { mode: 'strict', agent: 'claude' });
  assert.throws(() => parseArguments(['--mode', 'invalid']));
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../packages/hooks/src/cli.ts', import.meta.url)), '--mode', 'strict', '--agent', 'codex'], { env: process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end('not-json');
  });
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), {});
  assert(result.stderr.includes('allowing'));
});

test('missing connection also records an unobserved event and fails open', async t => {
  const home = sandbox(t);
  assert.deepEqual(await handleHook({ hook_event_name: 'PreToolUse', tool_name: 'exec_command' }, { agent: 'codex', mode: 'strict' }), {});
  assert.equal(JSON.parse(readFileSync(join(home, 'unobserved.jsonl'), 'utf8')).observed, false);
});

test('unobserved events recursively redact credentials and secrets in command and output text', async t => {
  const home = sandbox(t);
  const previous = process.env.AGENT_TERMINAL_TEST_SECRET;
  process.env.AGENT_TERMINAL_TEST_SECRET = 'private-environment-value';
  t.after(() => { if (previous === undefined) delete process.env.AGENT_TERMINAL_TEST_SECRET; else process.env.AGENT_TERMINAL_TEST_SECRET = previous; });
  const event = {
    tool_name: 'Bash', hook_event_name: 'PreToolUse',
    tool_input: { command: 'curl -H "Authorization: Bearer private-bearer-value" --data api_key=private-command-key', env: { API_KEY: 'private-nested-key', credentials: { arbitrary: 'private-credential-value' } } },
    tool_response: { output: 'token=private-output-token private-environment-value sk-abcdefghijklmnopqrstuvwxyz', nested: [{ password: 'private-array-password', text: 'secret=private-text-secret' }] },
  };
  assert.deepEqual(await handleHook(event, { agent: 'claude', mode: 'strict' }), {});
  const text = readFileSync(join(home, 'unobserved.jsonl'), 'utf8');
  for (const secret of ['private-bearer-value', 'private-command-key', 'private-nested-key', 'private-credential-value', 'private-output-token', 'private-environment-value', 'sk-abcdefghijklmnopqrstuvwxyz', 'private-array-password', 'private-text-secret']) assert(!text.includes(secret), secret);
  const row = JSON.parse(text);
  assert.equal(row.tool_name, 'Bash');
  assert.equal(row.observed, false);
  assert.equal(row.tool_input.env.API_KEY, '[REDACTED]');
  assert.equal(row.tool_response.nested[0].password, '[REDACTED]');
  assert.equal(event.tool_input.env.API_KEY, 'private-nested-key');
});
