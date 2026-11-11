import * as pty from 'node-pty';
import { killProcessTree } from './shell.js';

let terminal: pty.IPty | undefined;
let stopping: Promise<void> | undefined;
let queued = 0;
let paused = false;

function send(message: object) {
  if (!process.connected) return;
  queued++;
  process.send?.(message, () => {
    queued--;
    if (paused && queued < 8 && !stopping) { paused = false; terminal?.resume(); }
  });
  if (queued >= 32 && !paused && process.platform !== 'win32') { paused = true; terminal?.pause(); }
}

function stop(exitCode: number | null, signal?: number, natural = false) {
  if (stopping) return stopping;
  stopping = (async () => {
    if (terminal && (!natural || process.platform !== 'win32')) {
      await killProcessTree(terminal.pid);
      if (!natural) { try { terminal.kill(); } catch {} }
    }
    if (process.connected) process.send?.({ type: 'exit', exitCode, signal }, () => process.exit(0));
    else process.exit(0);
  })();
  return stopping;
}

process.on('message', (message: any) => {
  if (message.type === 'start' && !terminal && !stopping) {
    try {
      terminal = pty.spawn(message.file, message.args, { ...message.options, useConptyDll: process.platform === 'win32' });
      send({ type: 'ready', pid: terminal.pid });
      terminal.onData(data => send({ type: 'data', data }));
      terminal.onExit(event => { void stop(event.exitCode, event.signal, true); });
      if (typeof message.initialInput === 'string') terminal.write(message.initialInput);
    } catch (error) { send({ type: 'error', error: (error as Error).message }); void stop(null, 1); }
  }
  if (message.type === 'input' && !stopping) { try { terminal?.write(message.input); } catch {} }
  if (message.type === 'resize') { try { terminal?.resize(message.cols,message.rows); } catch {} }
  if (message.type === 'kill') void stop(null);
});
process.on('disconnect', () => { void stop(null, 1); });
process.on('SIGTERM', () => { void stop(null, 1); });
process.on('SIGINT', () => { void stop(null, 1); });
