import * as pty from 'node-pty';
import { statSync } from 'node:fs';
import { preparePtyHelper } from '../dist/packages/runtime/src/pty-helper.js';
import { resolveShell, killProcessTree } from '../dist/packages/runtime/src/shell.js';

const helper=preparePtyHelper();
console.log(JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,helper,mode:helper?(statSync(helper).mode&0o777).toString(8):undefined}));
const shell=resolveShell();
let output='';
const terminal=pty.spawn(shell.file,[...shell.args,'-c',"printf 'pty-smoke-ok\\n'; exit 7"],{cwd:process.cwd(),env:{...process.env,TERM:'xterm-256color'},useConptyDll:process.platform==='win32'});
const timeout=setTimeout(()=>{console.error('PTY smoke timed out');void killProcessTree(terminal.pid).finally(()=>process.exit(1));},15000);
terminal.onData(data=>{output+=data;});
terminal.onExit(event=>{
  clearTimeout(timeout);
  const ok=event.exitCode===7&&output.includes('pty-smoke-ok');
  console.log(JSON.stringify({exitCode:event.exitCode,signal:event.signal,marker:output.includes('pty-smoke-ok'),ok}));
  process.exit(ok?0:1);
});
