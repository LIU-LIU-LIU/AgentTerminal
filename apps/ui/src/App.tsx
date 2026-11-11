import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Activity, ArrowUpRight, Check, ChevronRight, Circle, Command, Cpu, Download, KeyRound, Layers, LoaderCircle, Plug, RefreshCw, Search, Settings2, ShieldCheck, SquareTerminal, X, Zap } from 'lucide-react';
import { Api, active, connect, enabled, type Agent, type Config, type Mode, type Stats, type Task } from './api';
import { Terminal } from './Terminal';

type Page = 'config' | 'monitor';
const names = { codex: 'Codex', claude: 'Claude Code' };
const statusNames: Record<string, string> = { running: '运行中', pending: '等待中', queued: '排队中', completed: '已完成', ok: '已完成', abnormal: '异常退出', exited: '已退出', failed: '失败', killed: '已终止', cancelled: '已取消' };
const modes: Record<Mode, [string, string]> = { prefer: ['优先使用', '通过 MCP 和 Skill 引导 Agent 使用统一终端。'], audit: ['审计增强', '增加 Hooks，记录受支持的原生工具调用。'], strict: ['严格接入', '通过受支持的 Hooks 拦截原生命令工具。'] };
const format = (value: unknown) => typeof value === 'number' ? value.toLocaleString('zh-CN') : '—';

export function App() {
  const [page, setPage] = useState<Page>(new URLSearchParams(location.search).get('window') === 'monitor' ? 'monitor' : 'config');
  const [api, setApi] = useState<Api>();
  const [config, setConfig] = useState<Config>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pinned, setPinned] = useState(false);
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  useEffect(() => { let cancelled = false; setError(''); setApi(undefined); connect().then(c => { if (!cancelled) setApi(new Api(c)); }).catch(e => { if (!cancelled) report(e); }); return () => { cancelled = true; }; }, [attempt, report]);
  const refresh = useCallback(async () => {
    if (!api) return;
    const [c, t, s] = await Promise.all([api.request<Config>('/api/config'), api.tasks(), api.request<Stats>('/api/stats')]);
    setConfig(c); setTasks(t); setStats(s); setOnline(true);
  }, [api]);
  useEffect(() => { let stopped = false; let timer: ReturnType<typeof setTimeout>; async function poll() { try { await refresh(); } catch (e) { if (!stopped) { setOnline(false); report(e); } } if (!stopped) timer = setTimeout(poll, 2500); } if (api) void poll(); return () => { stopped = true; clearTimeout(timer); }; }, [api, refresh, report]);
  async function action(key: string, path: string, body: unknown) {
    if (!api || busy) return;
    setBusy(key); setError(''); setNotice('');
    try { await api.request(path, body); setNotice('设置已保存，状态已更新'); await refresh(); } catch (e) { report(e); } finally { setBusy(''); }
  }
  async function open(next: Page) {
    if (!isTauri()) { const url = new URL(location.href); url.searchParams.set('window', next); window.open(url, `agentterminal-${next}`); return; }
    try {
      const existing = await WebviewWindow.getByLabel(next);
      if (existing) { await existing.show(); await existing.setFocus(); }
      else { const win = new WebviewWindow(next, { url: `index.html?window=${next}`, title: next === 'monitor' ? 'Agent Terminal · 实时监控' : 'Agent Terminal · 配置中心', width: 1280, height: 850, minWidth: 900, minHeight: 640 }); win.once('tauri://error', e => report(e.payload)); }
    } catch (e) { report(e); }
  }
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-icon"><SquareTerminal size={23}/></span><span>Agent Terminal<small>统一执行 · 全程可见</small></span></a>
      <div className="nav-label">工作空间</div><nav><button className={page === 'monitor' ? 'selected' : ''} onClick={() => setPage('monitor')}><Activity size={18}/>实时监控<span className="nav-count">{tasks.filter(active).length}</span></button><button className={page === 'config' ? 'selected' : ''} onClick={() => setPage('config')}><Settings2 size={18}/>配置中心</button></nav>
      <div className="sidebar-note"><div className="tiny-icon"><Layers size={18}/></div><strong>让每次执行都有迹可循</strong><p>连接你的 Coding Agent，<br/>在同一个地方掌握命令与输出。</p></div>
      <div className="runtime"><span className={`dot ${online ? 'green' : ''}`}/><div><strong>{online ? 'Runtime 已连接' : '等待 Runtime'}</strong><small>{online ? '本地服务 · 自动同步' : '检查连接与令牌'}</small></div><span className="version">v0.1</span></div>
    </aside>
    <main><header className="topbar"><span>工作空间 <ChevronRight size={14}/> <b>{page === 'config' ? '配置中心' : '实时监控'}</b></span><button className="text-button" onClick={() => void open(page === 'config' ? 'monitor' : 'config')}>独立打开{page === 'config' ? '监控' : '配置'}窗口 <ArrowUpRight size={15}/></button></header>
      <div className="content"><div className="page-heading"><div><div className="eyebrow">{page === 'config' ? 'WORKSPACE SETTINGS' : 'LIVE OBSERVABILITY'}</div><h1>{page === 'config' ? '配置你的 Agent 工作流' : '每一条命令，尽在眼前'}</h1><p>{page === 'config' ? '接入 Agent、配置模型，让命令在统一环境中执行。' : '实时查看执行状态、终端输出与跨 Agent 的运行统计。'}</p></div><div className="heading-actions">{page === 'monitor' && isTauri() && <button className={`button ${pinned ? 'primary' : ''}`} aria-pressed={pinned} onClick={() => { void getCurrentWindow().setAlwaysOnTop(!pinned).then(() => setPinned(!pinned)).catch(report); }}>{pinned ? '取消置顶' : '窗口置顶'}</button>}<button className="button" onClick={() => { if (api) void refresh().catch(report); else setAttempt(v => v + 1); }}><RefreshCw size={15}/>刷新状态</button></div></div>
      {error && <div className="alert" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><X size={16}/></button></div>}
      {notice && <div className="notice" role="status"><Check size={16}/>{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}><X size={16}/></button></div>}
      {!config || !api ? <div className="empty panel"><Plug size={32}/><h2>{error ? '暂时无法连接' : '正在连接本地工作空间'}</h2><p>桌面端自动发现 Runtime；浏览器请使用带连接令牌的地址。</p><button className="button" onClick={() => setAttempt(v => v + 1)}>重新连接</button></div> : page === 'config' ? <ConfigPage api={api} config={config} busy={busy} action={action} report={report}/> : <Monitor api={api} tasks={tasks} stats={stats} busy={busy} action={action} report={report}/>}
      <footer><span><ShieldCheck size={13}/>本地工作空间 · 令牌认证</span><span>Agent Terminal / {page === 'config' ? 'Configuration' : 'Monitor'}</span></footer></div>
    </main>
  </div>;
}

type Action = (key: string, path: string, body: unknown) => Promise<void>;
function ConfigPage({ api, config, busy, action, report }: { api: Api; config: Config; busy: string; action: Action; report: (e: unknown) => void }) {
  const [mode, setMode] = useState<Mode>(config.mode || 'prefer');
  const [preview, setPreview] = useState<{ agent: Agent; data: unknown }>();
  const [loading, setLoading] = useState('');
  useEffect(() => setMode(config.mode || 'prefer'), [config.mode]);
  async function showPreview(agent: Agent) { setLoading(agent); try { setPreview({ agent, data: await api.request(`/api/config/preview?agent=${agent}&mode=${mode}`) }); } catch (e) { report(e); } finally { setLoading(''); } }
  return <>
    <div className="section-title"><h2><Plug size={18}/>Agent 接入</h2><span>配置 MCP · Hooks · Skill</span></div>
    <div className="agent-grid">{(['codex', 'claude'] as Agent[]).map(agent => { const c = config.agents[agent]; return <section className="panel agent-card" key={agent}><div className="agent-head"><span className={`agent-logo ${agent}`}>{agent === 'codex' ? <Command size={25}/> : <span>✳</span>}</span><div><h3>{names[agent]}</h3><span>{agent === 'codex' ? 'OpenAI' : 'Anthropic'} · Coding Agent</span></div><span className={`pill ${c.installed ? 'good' : ''}`}>{c.installed ? '已接入' : '未接入'}</span></div><div className="home-path" title={c.home}>{c.home || '尚未检测到配置目录'}</div><div className="integration-bits">{(['mcp', 'hook', 'skill'] as const).map(key => <span key={key}><i className={enabled(c[key]) ? 'on' : ''}>{enabled(c[key]) ? <Check size={12}/> : <Circle size={10}/>}</i>{key === 'hook' ? 'Hooks' : key === 'mcp' ? 'MCP 服务' : 'Skill'}</span>)}</div><div className="agent-actions"><button className={`button ${!c.installed ? 'primary' : ''}`} disabled={!!busy} onClick={() => void action(agent, '/api/config/integration', { agent, action: c.installed ? 'uninstall' : 'install', mode })}>{busy === agent ? <LoaderCircle className="spin" size={15}/> : <Download size={15}/>}{c.installed ? '卸载接入' : '一键接入'}</button>{c.installed && <button className="button" disabled={!!busy} onClick={() => void action(agent, '/api/config/integration', { agent, action: 'install', mode })}>应用模式</button>}<button className="text-button" disabled={loading === agent} onClick={() => void showPreview(agent)}>{loading === agent ? '读取中…' : '查看配置'}<ChevronRight size={14}/></button></div></section>; })}</div>
    <section className="panel mode-panel"><div className="section-title"><h2><ShieldCheck size={18}/>接入模式</h2><span>选择后，点击一键接入或应用模式生效</span></div><div className="mode-grid">{(Object.keys(modes) as Mode[]).map(key => <button className={`mode-option ${mode === key ? 'chosen' : ''}`} key={key} onClick={() => setMode(key)} aria-pressed={mode === key}><span className="radio">{mode === key && <span/>}</span><strong>{modes[key][0]}</strong>{key === 'prefer' && <span className="recommended">推荐</span>}<p>{modes[key][1]}</p></button>)}</div></section>
    <div className="lower-grid"><Provider config={config} busy={busy} action={action}/><section className="panel skill-panel"><div className="section-title"><h2><Zap size={18}/>Agent Skill</h2><span className="subtle">使用指引</span></div><p className="description">为 Agent 安装终端使用说明，帮助它发现并正确使用统一执行工具。</p>{(['codex', 'claude'] as Agent[]).map(agent => <div className="skill-row" key={agent}><div><strong>{names[agent]}</strong><small>{enabled(config.agents[agent].skill) ? 'Skill 已启用' : 'Skill 未启用'}</small></div><button className={`toggle ${enabled(config.agents[agent].skill) ? 'checked' : ''}`} role="switch" aria-label={`${names[agent]} Skill`} aria-checked={enabled(config.agents[agent].skill)} disabled={!!busy} onClick={() => void action(`skill-${agent}`, '/api/config/skill', { agent, enabled: !enabled(config.agents[agent].skill) })}><span/></button></div>)}<div className="info-line"><ShieldCheck size={15}/>配置通过本地 Runtime 写入。</div></section></div>
    {preview && <div className="modal-backdrop" onClick={() => setPreview(undefined)}><section className="modal panel" role="dialog" aria-modal="true" aria-label="配置预览" onClick={e => e.stopPropagation()}><div className="section-title"><h2>{names[preview.agent]} · 配置预览</h2><button className="icon-button" aria-label="关闭配置预览" autoFocus onClick={() => setPreview(undefined)}><X size={20}/></button></div><pre>{typeof preview.data === 'string' ? preview.data : JSON.stringify(preview.data, null, 2)}</pre><button className="button" onClick={() => setPreview(undefined)}>关闭</button></section></div>}
  </>;
}
function Provider({ config, busy, action }: { config: Config; busy: string; action: Action }) {
  const [agent, setAgent] = useState<Agent>('codex');
  const provider = config.providers?.[agent] ?? (agent === 'codex' ? config.provider : { base_url: '', model: '', has_key: false });
  const [base, setBase] = useState(provider.base_url || '');
  const [model, setModel] = useState(provider.model || '');
  const [key, setKey] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) { setBase(provider.base_url || ''); setModel(provider.model || ''); } }, [provider.base_url, provider.model, dirty]);
  function selectAgent(next: Agent) {
    const nextProvider = config.providers?.[next] ?? (next === 'codex' ? config.provider : { base_url: '', model: '' });
    setAgent(next); setBase(nextProvider.base_url || ''); setModel(nextProvider.model || ''); setKey(''); setDirty(false);
  }
  return <section className="panel provider-panel"><div className="section-title"><h2><KeyRound size={18}/>本地 Provider</h2><span className={`pill ${provider.has_key ? 'good' : ''}`}>{provider.has_key ? '密钥已配置' : '未配置密钥'}</span></div><div className="provider-agents" role="group" aria-label="Provider Agent">{(['codex', 'claude'] as Agent[]).map(value => <button type="button" key={value} className={`button ${agent === value ? 'primary' : ''}`} aria-pressed={agent === value} disabled={!!busy} onClick={() => selectAgent(value)}>{names[value]}</button>)}</div><p className="description">配置本机 {names[agent]} 的模型接口。此处修改本地 Agent 配置，远程 Cloud 环境需单独配置。</p><form onSubmit={e => { e.preventDefault(); void action('provider', '/api/config/provider', { agent, base_url: base, model, ...(key ? { api_key: key } : {}) }).then(() => setKey('')); }}><label>API Base URL<input type="url" required value={base} placeholder={agent === 'codex' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'} onChange={e => { setBase(e.target.value); setDirty(true); }}/></label><div className="form-grid"><label>模型名称<input required value={model} placeholder="输入模型 ID" onChange={e => { setModel(e.target.value); setDirty(true); }}/></label><label>API Key<input type="password" autoComplete="new-password" value={key} placeholder={provider.has_key ? '留空保留现有密钥' : '输入 API Key（可选）'} onChange={e => setKey(e.target.value)}/></label></div><div className="form-bottom"><span>密钥仅提交到本地服务</span><button className="button primary" disabled={!!busy} type="submit">{busy === 'provider' ? '保存中…' : `保存 ${names[agent]}`}<Check size={14}/></button></div></form></section>;
}
function Monitor({ api, tasks, stats, busy, action, report }: { api: Api; tasks: Task[]; stats: Stats; busy: string; action: Action; report: (e: unknown) => void }) {
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = tasks.filter(t => (filter === 'all' || (filter === 'running' ? active(t) : t.agent === filter)) && `${t.command} ${t.agent} ${t.id} ${t.cwd}`.toLowerCase().includes(query.toLowerCase()));
  const task = tasks.find(t => t.id === selected) ?? filtered[0];
  const groups = (Array.isArray(stats.groups) ? stats.groups : []) as { agent: string; status: string; count: number; duration_ms: number }[];
  const shells = (Array.isArray(stats.shells) ? stats.shells : []) as { shell: string; count: number }[];
  const hooks = stats.hooks as { count?: number } | undefined;
  const [exporting, setExporting] = useState(false);
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
  const failures = groups.filter(g => g.status === 'failed').reduce((n, g) => n + g.count, 0);
  return <><div className="stats-grid">{[{ name: '累计任务', value: stats.total, icon: SquareTerminal }, { name: '正在运行', value: stats.running, icon: Activity }, { name: '失败任务', value: failures, icon: Cpu }, { name: 'Hook 事件', value: hooks?.count, icon: ShieldCheck }].map(({ name, value, icon: Icon }) => <section className="panel stat-card" key={name}><span>{name}<Icon size={17}/></span><strong>{format(value)}</strong></section>)}</div>
    <div className="monitor-layout"><section className="panel task-panel"><div className="section-title"><h2>执行记录</h2><span>{tasks.length} 个任务</span></div><div className="search"><Search size={16}/><input aria-label="搜索任务" placeholder="搜索命令、目录或 ID…" value={query} onChange={e => setQuery(e.target.value)}/></div><div className="filters">{[['all', '全部'], ['running', '运行中'], ['codex', 'Codex'], ['claude', 'Claude']].map(([value, name]) => <button key={value} className={filter === value ? 'chosen' : ''} onClick={() => setFilter(value)}>{name}</button>)}</div><div className="task-list">{filtered.length ? filtered.map(t => <button key={t.id} className={`task-row ${task?.id === t.id ? 'current' : ''}`} onClick={() => setSelected(t.id)}><div><span className={`dot ${active(t) ? 'green' : ''}`}/><strong>{t.command || t.id}</strong></div><p>{t.agent || '未知 Agent'}<span>{statusNames[t.status ?? ''] || t.status || '未知状态'}</span></p><small>{t.started_at || t.startedAt ? new Date(t.started_at || t.startedAt!).toLocaleString('zh-CN') : t.id}</small></button>) : <div className="empty"><SquareTerminal size={25}/><p>没有匹配的执行记录</p><small>Agent 执行命令后，任务会自动显示在这里。</small></div>}</div></section>
    <section className="terminal-panel">{task ? <><div className="terminal-toolbar"><div><span className="terminal-dot"/><strong>{task.shell || 'Terminal'}</strong><span>{task.agent || 'Agent'} / {task.id.slice(0, 12)}</span></div><button className="button danger" disabled={!active(task) || !!busy} onClick={() => void action('kill', `/api/tasks/${encodeURIComponent(task.id)}/kill`, {})}>{busy === 'kill' ? '终止中…' : '终止任务'}</button></div><div className="terminal-command"><code>{task.command || task.id}</code><small>{task.cwd || '未提供工作目录'}</small></div><Terminal api={api} task={task} onError={report}/><div className="terminal-status"><span><span className={`dot ${active(task) ? 'green' : ''}`}/>{statusNames[task.status ?? ''] || task.status}</span><span>{active(task) ? '点击终端输入 · Ctrl+C 中断' : `退出码：${task.exit_code ?? task.exitCode ?? '—'}`}</span></div></> : <div className="empty"><SquareTerminal size={40}/><h2>等待第一条命令</h2><p>从左侧选择任务，查看输出或进行终端交互。</p></div>}</section></div>
    <div className="export-row"><span className="subtle">导出 Runtime 保存的任务记录</span><button className="button" disabled={exporting} onClick={() => void exportTasks()}><Download size={14}/>{exporting ? '导出中…' : '导出 JSONL'}</button></div>
    <section className="panel breakdown"><div><h2>Agent 执行分布</h2><div className="chips">{groups.length ? groups.map((g, i) => <span className="chip" key={i}>{g.agent} · {statusNames[g.status] || g.status}<b>{g.count}</b><small>{(g.duration_ms / 1000).toFixed(1)} s</small></span>) : <span className="subtle">暂无统计</span>}</div></div><div><h2>Shell 使用</h2><div className="chips">{shells.length ? shells.map(s => <span className="chip" key={s.shell}>{s.shell}<b>{s.count}</b></span>) : <span className="subtle">暂无 Shell 记录</span>}</div></div></section>
  </>;
}
