import { invoke, isTauri } from '@tauri-apps/api/core';

export type Agent = 'codex' | 'claude';
export type Mode = 'prefer' | 'audit' | 'strict';
export interface Connection { endpoint: string; token: string }
export interface AgentConfig { installed: boolean; home: string; mcp: unknown; hook: unknown; skill: unknown }
export interface ProviderConfig { base_url: string; model: string; has_key: boolean }
export interface Config { agents: Record<Agent, AgentConfig>; provider: ProviderConfig; providers?: Record<Agent, ProviderConfig>; mode: Mode }
export interface Task { id: string; command?: string; agent?: string; status?: string; cwd?: string; shell?: string; startedAt?: string; started_at?: string; exitCode?: number | null; exit_code?: number | null; [key: string]: unknown }
export type Stats = Record<string, unknown>;

export function browserConnection(location: Pick<Location, 'hash' | 'origin'>): Connection {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = hash.get('token');
  if (!token) throw new Error('缺少连接令牌。请使用 runtime 提供的带 #token=… 的界面地址。');
  return { endpoint: location.origin, token };
}
export async function connect(): Promise<Connection> {
  return isTauri() ? invoke<Connection>('connection') : browserConnection(window.location);
}
export class Api {
  constructor(readonly connection: Connection) {}
  async request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.connection.endpoint.replace(/\/$/, '')}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${this.connection.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('连接令牌无效或已过期，请重新打开 runtime 提供的界面地址。');
      throw new Error(`请求失败 (${response.status})：${(await response.text()).slice(0, 300)}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  async tasks(signal?: AbortSignal): Promise<Task[]> {
    const data = await this.request<Task[] | { tasks: Task[] }>('/api/tasks', undefined, signal);
    return (Array.isArray(data) ? data : data.tasks).map(task => ({ ...task, id: String(task.task_id ?? task.id) }));
  }
}
export const active = (task: Task) => ['running', 'pending', 'queued', 'starting'].includes(task.status ?? '');
export function enabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object') {
    const state = value as Record<string, unknown>;
    return Boolean(state.enabled ?? state.installed ?? state.configured);
  }
  return Boolean(value);
}
