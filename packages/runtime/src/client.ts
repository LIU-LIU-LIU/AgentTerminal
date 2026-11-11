import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function dataHome() { return process.env.AGENT_TERMINAL_HOME || path.join(os.homedir(), '.agentterminal'); }
export function connection() {
  const info=JSON.parse(readFileSync(path.join(dataHome(), 'connection.json'), 'utf8')) as { url: string; token: string; pid: number };
  const url=new URL(info.url);
  if(url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.username || url.password || !info.token) throw new Error('Invalid runtime connection');
  return info;
}
export async function request(route: string, body?: unknown) {
  const info = connection();
  const response = await fetch(info.url + route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${info.token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || response.statusText);
  return result;
}
