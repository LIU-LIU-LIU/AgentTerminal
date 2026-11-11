import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home=mkdtempSync(join(tmpdir(),'agentterminal-ui-smoke-'));
process.env.AGENT_TERMINAL_HOME=home;
process.env.CODEX_HOME=join(home,'codex');
process.env.CLAUDE_CONFIG_DIR=join(home,'claude');
mkdirSync(process.env.CODEX_HOME); mkdirSync(process.env.CLAUDE_CONFIG_DIR);
const {startRuntime}=await import('../dist/packages/runtime/src/index.js');
const runtime=await startRuntime(home);
runtime.engine.start({command:"printf 'ui-token-smoke 你好\\n'",agent:'codex'});
console.log(`${runtime.info.url}/#token=${runtime.info.token}`);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void runtime.close().then(()=>process.exit(0)));
