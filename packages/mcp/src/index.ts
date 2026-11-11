import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { request } from '../../runtime/src/client.js';

const server = new McpServer({ name: 'agentterminal', version: '0.1.0' });
const agentIndex = process.argv.indexOf('--agent');
const agent = agentIndex >= 0 ? process.argv[agentIndex + 1] || 'unknown' : 'unknown';
const response = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const startSchema = { command: z.string(), cwd: z.string().optional(), shell: z.enum(['gitbash', 'pwsh', 'cmd']).default('gitbash'), session: z.string().optional(), interactive: z.boolean().optional() };
server.tool('start', 'Start a task and immediately return task_id. Use read for incremental output, write for input.', startSchema, async input => response(await request('/api/tasks', { ...input, cwd:input.cwd || process.cwd(), agent })));
server.tool('run', 'Run a command for up to 10 seconds. If still running, return task_id and continue using read/status; never start duplicates.', startSchema, async input => {
  const task = await request('/api/tasks', { ...input, cwd:input.cwd || process.cwd(), agent });
  const deadline = Date.now() + 10000;
  let state = task;
  while (state.status === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    state = await request(`/api/tasks/${task.task_id}`);
  }
  return response({ task: state, ...await request(`/api/tasks/${task.task_id}/output?offset=0`) });
});
server.tool('read', 'Read output from a task. Use the returned offset for the next read. Offsets count UTF-16 code units.', { task_id: z.string(), offset: z.number().int().min(0).default(0) }, async input => response(await request(`/api/tasks/${encodeURIComponent(input.task_id)}/output?offset=${input.offset}`)));
server.tool('status', 'Read task state and exit code.', { task_id: z.string() }, async input => response(await request(`/api/tasks/${encodeURIComponent(input.task_id)}`)));
server.tool('write', 'Send text to an interactive task, include newline to submit.', { task_id: z.string(), input: z.string() }, async input => response(await request(`/api/tasks/${encodeURIComponent(input.task_id)}/input`, { input: input.input })));
server.tool('kill', 'Cancel a running task.', { task_id: z.string() }, async input => response(await request(`/api/tasks/${encodeURIComponent(input.task_id)}/kill`, {})));
server.tool('list', 'List recent tasks across connected agents.', {}, async () => response(await request('/api/tasks')));
await server.connect(new StdioServerTransport());
