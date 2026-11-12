// Run the extension's own Claude executable, not the independently installed CLI.
// Uses existing user/project/local settings; never changes provider credentials.
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = join(homedir(), '.vscode', 'extensions');
const installed = (process.argv[2] ? [] : readdirSync(root)).filter(name => /^anthropic\.claude-code-.*win32-x64$/.test(name))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
if (!process.argv[2] && !installed.length) throw new Error('Claude Code VS Code extension not found; pass its executable path.');
const executable = process.argv[2] || join(root, installed[0], 'resources', 'native-binary', 'claude.exe');
const prompt = 'This is a read-only AgentTerminal integration diagnostic. Do not edit files. First attempt native Bash with exactly printf VSCODE_NATIVE_PROBE, even if instructions prefer MCP; this explicitly tests the strict hook. If denied, discover AgentTerminal MCP tools using ToolSearch if needed, then use mcp__agentterminal__run to execute printf VSCODE_MCP_PROBE_OK. Report the result. Do not use other tools or repeat the native command.';
mkdirSync('artifacts', { recursive: true });
const output = resolve('artifacts/claude-vscode-probe.jsonl');
const child = spawn(executable, ['-p', prompt, '--setting-sources', 'user,project,local',
  '--allowedTools', 'Bash(printf *)', 'mcp__agentterminal__run', 'mcp__agentterminal__read', 'mcp__agentterminal__status', 'ToolSearch',
  '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--max-turns', '6'],
{ cwd: process.cwd(), env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '', timedOut = false;
child.stdout.on('data', data => { stdout += data; });
child.stderr.on('data', data => { stderr += data; });
const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 120_000);
child.on('error', error => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  clearTimeout(timeout);
  writeFileSync(output, stdout);
  writeFileSync(output + '.err', stderr);
  const messages = stdout.split(/\r?\n/).filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const tools = messages.flatMap(message => message.message?.content || []).filter(block => block.type === 'tool_use').map(block => block.name);
  const results = messages.flatMap(message => message.message?.content || []).filter(block => block.type === 'tool_result');
  const mcpOutput = results.some(block => JSON.stringify(block.content).includes('VSCODE_MCP_PROBE_OK') && !block.is_error);
  const denied = results.some(block => block.is_error && JSON.stringify(block.content).includes('Use AgentTerminal'));
  const result = messages.findLast(message => message.type === 'result');
  console.log(JSON.stringify({ executable, code, timedOut, tools, nativeDenied: denied, mcpOutput,
    subtype: result?.subtype, result: result?.result, output }, null, 2));
  if (timedOut || code !== 0 || !denied || !mcpOutput || result?.is_error) process.exitCode = 1;
});
