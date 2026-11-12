import { useEffect, useState } from 'react';
import { active, type Shell, type Task } from './api';

export const agentName = (agent?: string) => ({ codex: 'Codex', claude: 'Claude Code', manual: '手动执行' } as Record<string, string>)[agent || 'manual'] ?? agent!;
export const shellName = (shell?: string) => ({ gitbash: 'Git Bash', pwsh: 'PowerShell', cmd: 'CMD' } as Record<Shell, string>)[shell as Shell] ?? shell ?? 'Terminal';
export const statusNames: Record<string, string> = { running: '运行中', ok: '已完成', failed: '失败', abnormal: '异常退出', cancelled: '已取消' };
export const statusName = (status?: string) => statusNames[status ?? ''] || status || '未知状态';

export type TaskState = 'running' | 'ok' | 'failed' | 'stopped';
export const stateOf = (task: Task): TaskState => active(task) ? 'running' : task.status === 'ok' ? 'ok' : task.status === 'cancelled' ? 'stopped' : 'failed';
export const startedAt = (task: Task) => Date.parse(String(task.started_at ?? task.startedAt ?? ''));

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds < 10 ? (ms / 1000).toFixed(1) : seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分 ${seconds % 60} 秒`;
}
export function formatAgo(time: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
/** How long a task ran; keeps ticking while it is running. */
export function taskDuration(task: Task, now: number): number {
  const end = active(task) ? now : Date.parse(String(task.ended_at ?? ''));
  return end - startedAt(task);
}
/** Current time, refreshed every `interval` ms while `enabled`. */
export function useNow(interval: number, enabled = true): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval, enabled]);
  return now;
}
