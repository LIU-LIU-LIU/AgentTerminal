import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, openSync, closeSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Engine } from './engine.js';
import { dataHome } from './client.js';
import { getConfiguration, previewIntegration, installIntegration, uninstallIntegration, toggleSkill } from '../../installer/src/index.js';
import { shellConfiguration, saveShellSettings } from './settings.js';

export async function startRuntime(home = dataHome(), options: { port?: number; token?: string; onStopped?: ()=>void } = {}) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const lockPath = path.join(home, 'runtime.lock');
  try { const lock = openSync(lockPath, 'wx', 0o600); writeFileSync(lock, String(process.pid)); closeSync(lock); }
  catch {
    const pid = Number(readFileSync(lockPath, 'utf8'));
    try { process.kill(pid, 0); throw new Error(`Runtime already running (PID ${pid})`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    unlinkSync(lockPath);
    const lock = openSync(lockPath, 'wx', 0o600); writeFileSync(lock, String(process.pid)); closeSync(lock);
  }
  const engine = new Engine(home);
  const token = options.token || randomBytes(32).toString('hex');
  let controlling: 'stop' | 'restart' | undefined;
  const streams = new Set<http.ServerResponse>();
  const builtUi = fileURLToPath(new URL('../../../../apps/ui/dist/', import.meta.url));
  const uiRoot = existsSync(builtUi) ? builtUi : fileURLToPath(new URL('../../../apps/ui/dist/', import.meta.url));
  async function body(request: http.IncomingMessage) {
    let content = '';
    for await (const chunk of request) { content += chunk; if (content.length > 1024 * 1024) throw new Error('Request too large'); }
    return content ? JSON.parse(content) : {};
  }
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const send = (result: unknown, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(result)); };
    if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (!url.pathname.startsWith('/api/')) {
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const file = path.resolve(uiRoot, relative);
      if (!file.startsWith(path.resolve(uiRoot) + path.sep) || !existsSync(file) || !statSync(file).isFile()) return send({ error: 'Not found. Build UI first.' }, 404);
      const mime: Record<string,string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Referrer-Policy': 'no-referrer' });
      response.end(readFileSync(file)); return;
    }
    const origin = request.headers.origin;
    if (origin && !(origin === `http://${request.headers.host}` || origin === 'http://localhost:1420' || origin === 'http://127.0.0.1:1420' || origin === 'http://tauri.localhost' || origin === 'tauri://localhost')) return send({error:'Origin rejected'},403);
    if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
    if (request.method === 'OPTIONS') { response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type'); response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); response.writeHead(204); response.end(); return; }
    if (request.headers.authorization !== `Bearer ${token}`) return send({ error: 'Unauthorized' }, 401);
    try {
      const method = request.method;
      const route = url.pathname;
      if (route === '/api/health') return send({ ok: true, version: '0.1.0', lifecycle: true, stopping: Boolean(controlling), pid: process.pid });
      if (route === '/api/control/stop' && method === 'POST') {
        await body(request);
        if(controlling==='stop')return send({error:'Runtime 正在停止'},409);
        controlling='stop';
        response.once('finish',()=>{void close().then(()=>options.onStopped?.()).catch(error=>console.error(error));});
        return send({ok:true});
      }
      if (route === '/api/control/restart' && method === 'POST') {
        await body(request);
        if(controlling)return send({error:'Runtime 正在重启'},409);
        controlling='restart';
        const child=spawn(process.execPath,[fileURLToPath(new URL('./service.js',import.meta.url)),'restart'],{env:{...process.env,AGENT_TERMINAL_HOME:home},detached:true,windowsHide:true,stdio:'ignore'});
        child.on('error',error=>{controlling=undefined;console.error(error);});
        child.unref();
        return send({ok:true});
      }
      if(controlling && method==='POST' && route!=='/api/hooks')return send({error:'Runtime 正在停止或重启'},409);
      if (route === '/api/tasks' && method === 'GET') return send(engine.list());
      if (route === '/api/tasks' && method === 'POST') return send(engine.start(await body(request)), 201);
      const task = route.match(/^\/api\/tasks\/([^/]+)(?:\/(output|input|kill|resize|usage))?$/);
      if (task) {
        const [, id, action] = task;
        if (!action && method === 'GET') return send(engine.get(id));
        if (action === 'usage' && method === 'GET') return send(engine.usage(id));
        if (action === 'output' && method === 'GET') return send(engine.output(id, Number(url.searchParams.get('offset') || 0)));
        if (method !== 'POST') return send({error:'Method not allowed'},405);
        const payload = await body(request);
        if (action === 'input') engine.input(id, payload.input);
        else if (action === 'kill') engine.kill(id);
        else if (action === 'resize') engine.resize(id, payload.cols, payload.rows);
        else return send({error:'Not found'},404);
        return send({ ok: true });
      }
      if (route === '/api/stats') return send(engine.stats());
      if (route === '/api/export') { response.writeHead(200, {'Content-Type':'application/x-ndjson', 'Content-Disposition':'attachment; filename="agentterminal.jsonl"'}); response.end(engine.export()); return; }
      if (route === '/api/hooks' && method === 'POST') { engine.hook(await body(request)); return send({ok:true}); }
      if (route === '/api/hooks' && method === 'GET') return send(engine.db.prepare('SELECT id,created_at,event FROM hooks ORDER BY id DESC LIMIT 200').all().map((row:any)=>({...row,event:JSON.parse(row.event)})));
      if (route === '/api/config' && method === 'GET') return send({...getConfiguration(),shell:shellConfiguration(home)});
      if (route === '/api/config/shell' && method === 'POST') return send(saveShellSettings(home,await body(request)));
      if (route === '/api/config/preview' && method === 'GET') return send(previewIntegration(url.searchParams.get('agent') as 'codex'|'claude', url.searchParams.get('mode') as 'prefer'|'audit'|'strict' || 'audit'));
      if (route === '/api/config/integration' && method === 'POST') {
        const payload = await body(request);
        if (!['codex','claude'].includes(payload.agent) || !['install','uninstall'].includes(payload.action)) throw new Error('Invalid integration');
        return send(payload.action === 'install' ? installIntegration(payload.agent, payload.mode || 'audit') : uninstallIntegration(payload.agent));
      }
      if (route === '/api/config/skill' && method === 'POST') { const payload = await body(request); return send(toggleSkill(payload.agent, payload.enabled)); }
      if (route === '/api/events') {
        response.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
        response.write(': connected\n\n'); streams.add(response); request.on('close',()=>streams.delete(response)); return;
      }
      send({ error: 'Not found' }, 404);
    } catch (error) { send({ error: (error as Error).message }, 400); }
  });
  engine.on('event', event => { for (const stream of streams) { if (stream.writableLength > 1024 * 1024) { stream.end(); streams.delete(stream); } else stream.write(`data: ${JSON.stringify(event)}\n\n`); } });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, '127.0.0.1', resolve); });
  const address = server.address() as import('node:net').AddressInfo;
  const info = { url: `http://127.0.0.1:${address.port}`, token, pid: process.pid };
  writeFileSync(path.join(home, 'connection.json'), JSON.stringify(info), {mode:0o600});
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    for (const stream of streams) stream.end();
    const stopped = new Promise<void>(resolve => server.close(()=>resolve()));
    await engine.close();
    server.closeAllConnections();
    await stopped;
    engine.db.close();
    if (existsSync(lockPath)) unlinkSync(lockPath);
    if (existsSync(path.join(home,'connection.json'))) unlinkSync(path.join(home,'connection.json'));
  })();
  return { engine, info, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime = await startRuntime(dataHome(), {port:Number(process.env.AGENT_TERMINAL_RESTART_PORT)||undefined,token:process.env.AGENT_TERMINAL_RESTART_TOKEN||undefined,onStopped:()=>process.exit(0)});
  delete process.env.AGENT_TERMINAL_RESTART_TOKEN;
  delete process.env.AGENT_TERMINAL_RESTART_PORT;
  console.log(`AgentTerminal ready: ${runtime.info.url}/#token=${runtime.info.token}`);
  for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => { void runtime.close().then(()=>process.exit(0)); });
}
