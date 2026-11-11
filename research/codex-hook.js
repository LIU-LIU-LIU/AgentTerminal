// Research-only hook. Wire explicitly into a disposable project; never installs itself.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const home = path.resolve(process.env.AGENT_TERMINAL_HOME || path.join(homedir(), '.agentterminal'));
const input = readFileSync(0, 'utf8');
mkdirSync(home, { recursive: true });
appendFileSync(path.join(home, 'research-hook.jsonl'), input + '\n', { mode: 0o600 });
let event = {};
try { event = JSON.parse(input); } catch {}
if (['Bash', 'shell', 'exec_command'].includes(event.tool_name)) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Use AgentTerminal MCP run/start instead' } }));
}
