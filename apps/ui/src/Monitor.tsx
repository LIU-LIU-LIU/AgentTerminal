import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Copy, Download, Search, Square, SquareTerminal, X } from 'lucide-react';
import { Api, active, type Stats, type Task } from './api';
import type { Action } from './App';
import { Terminal } from './Terminal';
import { agentName, formatAgo, formatDuration, shellName, startedAt, stateOf, statusName, taskDuration, useNow } from './labels';
import { lookVars, useLook } from './themes';

const format = (value: unknown) => typeof value === 'number' ? value.toLocaleString('zh-CN') : '—';

function TokenUsage({ api, task }: { api: Api; task: Task }) {
  const [usage, setUsage] = useState<{ input_tokens: number | null; output_tokens: number; input_complete: boolean; output_truncated: boolean }>();
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setUsage(undefined); setError('');
    async function poll() {
      try { const next = await api.request<NonNullable<typeof usage>>(`/api/tasks/${encodeURIComponent(task.id)}/usage`); if (!stopped) { setUsage(next); setError(''); } }
      catch (e) { if (!stopped) setError(e instanceof Error ? e.message : String(e)); }
      if (!stopped) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, task.id]);
  return <span title="本任务终端文本 Token 估算（非模型计费）">Token ≈ 输入 {usage ? format(usage.input_tokens) : '—'} / 输出 {usage ? format(usage.output_tokens) : '—'}{usage && !usage.input_complete ? ' · 历史输入不完整' : ''}{usage?.output_truncated ? ' · 输出仅含保留日志' : ''}{error ? ` · ${error}` : ''}</span>;
}

const stateIcons = { running: null, ok: Check, failed: X, stopped: Square };
function TaskRow({ task, current, now, onSelect }: { task: Task; current: boolean; now: number; onSelect: () => void }) {
  const state = stateOf(task);
  const Icon = stateIcons[state];
  const exit = task.exit_code ?? task.exitCode;
  return <button className={`task-row ${current ? 'current' : ''}`} data-state={state} onClick={onSelect}>
    <span className="task-state">{Icon ? <Icon size={11} strokeWidth={3}/> : <span className="status-dot live"/>}</span>
    <strong>{task.command || task.id}</strong>
    <span className="task-meta"><span>{agentName(task.agent)}</span><span>{formatAgo(startedAt(task), now)}</span><span className="task-result">{state === 'running' ? formatDuration(taskDuration(task, now)) : state === 'failed' && exit != null ? `退出码 ${exit}` : statusName(task.status)}</span></span>
  </button>;
}

interface Props { api: Api; tasks: Task[]; stats: Stats; busy: string; action: Action; report: (e: unknown) => void; selected: string; onSelect: (id: string) => void; reveal: number }
export function Monitor({ api, tasks, stats, busy, action, report, selected, onSelect, reveal }: Props) {
  const look = useLook();
  const now = useNow(1000);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const matches = (value: string) => (t: Task) => value === 'all' || (value === 'running' ? active(t) : value === 'failed' ? stateOf(t) === 'failed' : t.agent === value);
  const filtered = tasks.filter(t => matches(filter)(t) && `${t.command} ${t.agent} ${t.id} ${t.cwd}`.toLowerCase().includes(query.toLowerCase()));
  const task = tasks.find(t => t.id === selected) ?? filtered[0];
  const groups = (Array.isArray(stats.groups) ? stats.groups : []) as { agent: string; status: string; count: number; duration_ms: number }[];
  const shells = (Array.isArray(stats.shells) ? stats.shells : []) as { shell: string; count: number }[];
  const exit = task?.exit_code ?? task?.exitCode;

  // A task opened from outside (the floating monitor) must be visible whatever the list was filtered to.
  useEffect(() => {
    if (!reveal) return;
    setFilter('all'); setQuery('');
    const frame = requestAnimationFrame(() => list.current?.querySelector('.task-row.current')?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [reveal, task?.id]);

  async function exportTasks() {
    setExporting(true);
    try {
      const response = await fetch(`${api.connection.endpoint}/api/export`, { headers: { Authorization: `Bearer ${api.connection.token}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`导出失败 (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'agentterminal.jsonl'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { report(e); } finally { setExporting(false); }
  }
  function copyCommand() {
    void navigator.clipboard.writeText(task?.command || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(report);
  }

  return <>
    <div className="monitor-layout">
      <section className="task-panel">
        <div className="search"><Search size={14}/><input aria-label="搜索任务" placeholder="搜索命令、目录或 ID" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="清空搜索" onClick={() => setQuery('')}><X size={12}/></button>}</div>
        <div className="filters">{[['all', '全部'], ['running', '运行中'], ['failed', '失败'], ['codex', 'Codex'], ['claude', 'Claude']].map(([value, name]) => <button key={value} className={filter === value ? 'chosen' : ''} onClick={() => setFilter(value)}>{name}<small>{tasks.filter(matches(value)).length}</small></button>)}</div>
        <div className="task-list" ref={list}>{filtered.length ? filtered.map(t => <TaskRow key={t.id} task={t} current={task?.id === t.id} now={now} onSelect={() => onSelect(t.id)}/>) : <div className="empty"><p>没有匹配的执行记录</p><small>Agent 执行命令后，任务会自动显示在这里。</small></div>}</div>
      </section>
      <section className="terminal-panel" data-state={task ? stateOf(task) : 'idle'} style={lookVars(look) as CSSProperties}>{task ? <>
        <div className="terminal-head">
          <span className="prompt">❯</span>
          <div><code>{task.command || task.id}</code><small>{agentName(task.agent)} · {shellName(task.shell)} · {task.cwd || '未提供工作目录'} · {task.id.slice(0, 8)}</small></div>
          <button className="icon-button" title="复制命令" aria-label="复制命令" onClick={copyCommand}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>
          <button className="button danger" disabled={!active(task) || !!busy} onClick={() => void action('kill', `/api/tasks/${encodeURIComponent(task.id)}/kill`, {})}><Square size={10}/>{busy === 'kill' ? '终止中' : '终止'}</button>
        </div>
        <Terminal key={task.id} api={api} task={task} look={look} onError={report}/>
        <div className="terminal-status"><span><span className={`status-dot ${active(task) ? 'live' : ''}`}/>{statusName(task.status)} · {formatDuration(taskDuration(task, now))}</span><TokenUsage api={api} task={task}/><span>{active(task) ? '点击终端输入 · Ctrl+C 中断' : `退出码 ${exit ?? '—'}`}</span></div>
      </> : <div className="empty"><SquareTerminal size={30}/><h2>还没有命令</h2><p>Agent 通过 AgentTerminal 执行命令后，输出会实时显示在这里。</p></div>}</section>
    </div>
    <footer className="statusbar">
      <div className="chips">{groups.length ? groups.map((g, i) => <span className="chip" key={i} data-state={g.status}>{agentName(g.agent)} {statusName(g.status)}<b>{g.count}</b><small>{formatDuration(g.duration_ms)}</small></span>) : <span className="chip">暂无统计</span>}</div>
      <div className="chips">{shells.map(s => <span className="chip" key={s.shell}>{shellName(s.shell)}<b>{s.count}</b></span>)}</div>
      <button className="text-button" disabled={exporting} title="导出 Runtime 保存的任务记录" onClick={() => void exportTasks()}><Download size={13}/>{exporting ? '导出中' : '导出 JSONL'}</button>
    </footer>
  </>;
}
