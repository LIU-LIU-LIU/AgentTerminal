import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startRuntime } from '../dist/packages/runtime/src/index.js';

const home=mkdtempSync(path.join(os.tmpdir(),'agentterminal-ui-'));
process.env.AGENT_TERMINAL_HOME=home;
process.env.CODEX_HOME=path.join(home,'codex');
process.env.CLAUDE_CONFIG_DIR=path.join(home,'claude');
mkdirSync(process.env.CODEX_HOME,{recursive:true}); mkdirSync(process.env.CLAUDE_CONFIG_DIR,{recursive:true});
const runtime=await startRuntime();
runtime.engine.start({command:'echo "Codex 构建日志"; echo "检查项目依赖…"; echo "✓ build completed"',agent:'codex',session:'build'});
runtime.engine.start({command:'echo "Claude Code · 单元测试"; echo "PASS runtime.test.ts"; echo "FAIL integration.test.ts"; exit 2',agent:'claude',session:'test'});
runtime.engine.start({command:'for n in 1 2 3 4 5; do echo "服务心跳 $n · 等待请求"; sleep 10; done',agent:'codex',session:'server'});
console.log(`${runtime.info.url}/#token=${runtime.info.token}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void runtime.close().then(()=>process.exit(0)));
