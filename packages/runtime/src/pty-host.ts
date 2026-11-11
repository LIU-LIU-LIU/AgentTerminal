import * as pty from 'node-pty';
import { killProcessTree } from './shell.js';
import { ReliableChannel } from './ipc.js';

let terminal: pty.IPty | undefined;
let stopping: Promise<void> | undefined;
const channel=new ReliableChannel((message,callback)=>{
  if(!process.connected){callback(Object.assign(new Error('IPC disconnected'),{code:'ERR_IPC_CHANNEL_CLOSED'}));return;}
  process.send!(message,callback);
},()=>{try{terminal?.pause();}catch{}},()=>{try{terminal?.resume();}catch{}},()=>{void stop(null,1);});
process.on('error',error=>{if(!['EAGAIN','ENOBUFS'].includes((error as NodeJS.ErrnoException).code||''))void stop(null,1);});

function send(message: object) {
  if (!process.connected) return;
  channel.push(message);
}

function stop(exitCode: number | null, signal?: number, natural = false) {
  if (stopping) return stopping;
  stopping = (async () => {
    if (terminal && (!natural || process.platform !== 'win32')) {
      await killProcessTree(terminal.pid);
      if (!natural) { try { terminal.kill(); } catch {} }
    }
    if (process.connected) { channel.push({type:'exit',exitCode,signal}); await channel.idle(); process.exit(0); }
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
