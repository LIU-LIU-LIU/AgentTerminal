import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'dist/packages/mcp/src/index.js');
const home = path.resolve(process.env.AGENT_TERMINAL_HOME || path.join(homedir(), '.agentterminal'));
const clients = [], owned = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string'));
env.AGENT_TERMINAL_HOME = home;
async function tool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `MCP ${name}: ${JSON.stringify(result.content)}`);
  return JSON.parse(result.content.find(item => item.type === 'text').text);
}
async function finished(client, id) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const task = await tool(client, 'status', { task_id: id });
    if (task.status !== 'running') return task;
    await delay(100);
  }
  throw new Error(`Task deadline exceeded: ${id}`);
}
async function output(client, id) {
  let offset = 0, text = '';
  for (let pages = 0; pages < 100; pages++) {
    const part = await tool(client, 'read', { task_id: id, offset });
    text += part.output;
    assert.ok(part.offset >= offset);
    offset = part.offset;
    if (!part.more) return { text, offset };
  }
  throw new Error('Output page limit exceeded');
}
try {
  assert.ok(existsSync(entry), 'Build first: pnpm build');
  assert.ok(existsSync(path.join(home, 'connection.json')), 'Start runtime first: pnpm start (same AGENT_TERMINAL_HOME)');
  const connection = JSON.parse(readFileSync(path.join(home, 'connection.json'), 'utf8'));
  const url = new URL(connection.url);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1');
  const http = (route, authenticated = true) => fetch(new URL(route, url), { headers: authenticated ? { Authorization: `Bearer ${connection.token}` } : {}, signal: AbortSignal.timeout(5000) });
  assert.equal((await http('/api/health', false)).status, 401);
  const health = await http('/api/health');
  assert.equal(health.status, 200); assert.equal((await health.json()).ok, true);
  for (let i = 0; i < 2; i++) {
    const client = new Client({ name: `agentterminal-research-${i}`, version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entry, '--agent', 'research'], cwd: root, env });
    clients.push({ client, transport });
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(item => item.name);
    for (const name of ['run', 'start', 'read', 'status', 'write', 'kill', 'list']) assert.ok(names.includes(name), name);
  }
  const [a, b] = clients.map(item => item.client);
  async function start(client, command) {
    const task = await tool(client, 'start', { command, cwd: root, shell: 'gitbash' });
    owned.add(task.task_id); assert.equal(task.agent, 'research'); return task;
  }
  const [first, second] = await Promise.all([
    start(a, "printf '你好 research-a\\n'; sleep 1; printf 'research-a-done\\n'"),
    start(b, "printf 'research-b\\n'; exit 7"),
  ]);
  assert.notEqual(first.task_id, second.task_id);
  const [success, failure] = await Promise.all([finished(a, first.task_id), finished(b, second.task_id)]);
  assert.equal(success.status, 'ok'); assert.equal(success.exit_code, 0);
  assert.equal(failure.status, 'failed'); assert.equal(failure.exit_code, 7);
  const read = await output(b, first.task_id);
  assert.match(read.text, /你好 research-a/); assert.match(read.text, /research-a-done/);
  assert.doesNotMatch(read.text, /research-b/);
  assert.equal((await tool(a, 'read', { task_id: first.task_id, offset: read.offset })).output, '');
  const slow = await start(a, 'sleep 30');
  await tool(b, 'kill', { task_id: slow.task_id });
  assert.equal((await finished(a, slow.task_id)).status, 'cancelled');
  const listed = await tool(b, 'list');
  for (const id of owned) assert.ok(listed.some(task => task.task_id === id));
  const tasksResponse = await http('/api/tasks'); assert.equal(tasksResponse.status, 200);
  const tasks = await tasksResponse.json();
  for (const id of owned) assert.ok(tasks.some(task => task.task_id === id && task.agent === 'research'));
  const statsResponse = await http('/api/stats'); assert.equal(statsResponse.status, 200);
  assert.ok((await statsResponse.json()).groups.some(group => group.agent === 'research'));
  console.log(JSON.stringify({ result: 'PASS', at: new Date().toISOString(), platform: process.platform, node: process.version, checks: ['HTTP auth/health/tasks/stats', 'two independent MCP clients', 'Git Bash Unicode/output offsets', 'exit 0/7', 'cross-client cancellation/list'], task_ids: [...owned] }, null, 2));
} catch (error) {
  console.error(`FAIL: ${error.message}`); process.exitCode = 1;
} finally {
  const client = clients[0]?.client;
  if (client) for (const id of owned) {
    try { if ((await tool(client, 'status', { task_id: id })).status === 'running') await tool(client, 'kill', { task_id: id }); } catch {}
  }
  for (const { client, transport } of clients) {
    try { await client.close(); } catch {}
    try { await transport.close(); } catch {}
  }
}
