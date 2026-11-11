import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.AGENT_TERMINAL_HOME || !path.isAbsolute(process.env.AGENT_TERMINAL_HOME)) throw new Error('Set AGENT_TERMINAL_HOME to an absolute disposable runtime home; start runtime with the same value first.');
const home = process.env.AGENT_TERMINAL_HOME;
mkdirSync(home, { recursive: true });
const quote = value => '"' + (process.platform === 'win32' ? value.replace(/"/g, '\\"') : value.replace(/(["$`\\])/g, '\\$1')) + '"';
const configs = {
  'research-mcp.json': { mcpServers: { agentterminal: { command: process.execPath, args: [path.join(root, 'dist/packages/mcp/src/index.js'), '--agent', 'research'], env: { AGENT_TERMINAL_HOME: home } } } },
  'research-claude-hooks.json': { hooks: { PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: `${quote(process.execPath)} ${quote(path.join(root, 'research/codex-hook.js'))}`, timeout: 3 }] }] } },
};
for (const [name, config] of Object.entries(configs)) writeFileSync(path.join(home, name), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
console.log('Wrote research MCP/hooks configuration in the explicitly selected runtime home.');
