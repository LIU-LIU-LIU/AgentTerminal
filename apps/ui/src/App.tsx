import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Activity, Check, PictureInPicture2, Pin, Plug, Power, RefreshCw, RotateCw, Settings2, SquareTerminal, TriangleAlert, X } from 'lucide-react';
import { Api, active, connect, type Config, type Stats, type Task } from './api';
import { ConfigPage } from './ConfigPage';
import { Monitor } from './Monitor';
import { onAnnounce, savePrefs, useAppearance, usePrefs } from './themes';

type Page = 'config' | 'monitor';
export type Action = (key: string, path: string, body: unknown) => Promise<void>;
const pageNames: Record<Page, string> = { monitor: '实时监控', config: '配置中心' };
const count = (value: unknown) => typeof value === 'number' ? value.toLocaleString('zh-CN') : '—';

export function App() {
  const prefs = usePrefs();
  const appearance = useAppearance();
  const [page, setPage] = useState<Page>('monitor');
  const [api, setApi] = useState<Api>();
  const [config, setConfig] = useState<Config>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [selected, setSelected] = useState('');
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [lifecycle, setLifecycle] = useState('');
  const [stopped, setStopped] = useState(false);
  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  useEffect(() => { let cancelled = false; setError(''); setApi(undefined); connect().then(c => { if (!cancelled) setApi(new Api(c)); }).catch(e => { if (!cancelled) report(e); }); return () => { cancelled = true; }; }, [attempt, report]);
  const refresh = useCallback(async () => {
    if (!api) return;
    const [c, t, s] = await Promise.all([api.request<Config>('/api/config'), api.tasks(), api.request<Stats>('/api/stats')]);
    setConfig(c); setTasks(t); setStats(s); setOnline(true);
  }, [api]);
  useEffect(() => { let disposed = false; let timer: ReturnType<typeof setTimeout>; async function poll() { try { await refresh(); } catch (e) { if (!disposed) { setOnline(false); report(e); } } if (!disposed) timer = setTimeout(poll, 2500); } if (api && !lifecycle && !stopped) void poll(); return () => { disposed = true; clearTimeout(timer); }; }, [api, refresh, report, lifecycle, stopped]);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    if (isTauri()) void getCurrentWindow().setTheme(appearance).catch(() => undefined);
  }, [appearance]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);

  // Floating monitor: a native always-on-top window on desktop, a popup in the browser.
  useEffect(() => {
    if (!isTauri() || !prefs.float) return;
    void WebviewWindow.getByLabel('float').then(existing => {
      if (!existing) new WebviewWindow('float', { url: 'index.html?view=float', title: 'Agent Terminal 悬浮窗', width: 396, height: 260, visible: false, transparent: true, decorations: false, shadow: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false, minimizable: false, focus: false });
    }).catch(report);
  }, [prefs.float, report]);
  function toggleFloat() {
    if (isTauri()) return savePrefs({ float: !prefs.float });
    savePrefs({ float: true });
    if (!window.open(`${location.pathname}?view=float${location.hash}`, 'agentterminal-float', 'popup,width=400,height=264')) setError('浏览器拦截了悬浮窗，请允许此页面打开弹出窗口。');
  }

  async function control(command: 'stop' | 'restart') {
    if (lifecycle) return;
    if (!api) { if (command === 'stop' && isTauri()) void invoke('exit_app'); return; }
    if (tasks.some(active) && !window.confirm(`${command === 'stop' ? '完全退出' : '重启服务'}会终止正在运行的任务，是否继续？`)) return;
    setLifecycle(command); setError(''); setNotice('');
    try {
      if (isTauri()) {
        await invoke('service_control', { action: command });
        if (command === 'restart') { setAttempt(value => value + 1); setNotice('后台服务已重启'); }
      } else {
        await api.request(`/api/control/${command}`, {});
        if (command === 'stop') { setStopped(true); setOnline(false); setNotice('后台服务已停止，可以关闭此页面。重新启动请运行 pnpm start。'); }
        else {
          const deadline = Date.now() + 45000;
          await new Promise(resolve => setTimeout(resolve, 1000));
          let ready = false;
          while (Date.now() < deadline) {
            try { const health = await api.request<{ ok: boolean; stopping?: boolean }>('/api/health', undefined, AbortSignal.timeout(1500)); if (health.ok && !health.stopping) { ready = true; break; } } catch {}
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          if (!ready) throw new Error('重启尚未完成，请运行 pnpm start 查看服务状态');
          await refresh(); setNotice('后台服务已重启');
        }
      }
    } catch (error) { report(error); } finally { setLifecycle(''); }
  }
  const action: Action = async (key, path, body) => {
    if (!api || busy) return;
    setBusy(key); setError(''); setNotice('');
    try { await api.request(path, body); setNotice(key === 'kill' ? '已请求终止任务' : '设置已保存，状态已更新'); await refresh(); } catch (e) { report(e); } finally { setBusy(''); }
  };

  // Requests from outside this window: the floating monitor opens a task, the tray menu asks to quit.
  const latest = useRef({ control, refresh });
  latest.current = { control, refresh };
  const openTask = useCallback((id: string) => {
    setPage('monitor'); setSelected(id); setReveal(value => value + 1);
    void latest.current.refresh().catch(() => undefined);
  }, []);
  useEffect(() => onAnnounce(message => { if (message.type === 'open-task' && message.id) { openTask(message.id); window.focus(); } }), [openTask]);
  useEffect(() => {
    if (!isTauri()) return;
    const stops = [listen<string>('open-task', event => openTask(event.payload)), listen('tray-quit', () => void latest.current.control('stop'))];
    return () => { stops.forEach(stop => void stop.then(off => off())); };
  }, [openTask]);

  const running = tasks.filter(active).length;
  const failures = (Array.isArray(stats.groups) ? stats.groups as { status: string; count: number }[] : []).filter(g => g.status === 'failed').reduce((n, g) => n + g.count, 0);
  const locked = !!lifecycle || stopped || (!api && !isTauri());
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><SquareTerminal size={16}/></span><span>Agent Terminal</span></div>
      <nav>
        <button className={page === 'monitor' ? 'selected' : ''} onClick={() => setPage('monitor')}><Activity size={16}/><span>实时监控</span>{running > 0 && <span className="nav-count">{running}</span>}</button>
        <button className={page === 'config' ? 'selected' : ''} onClick={() => setPage('config')}><Settings2 size={16}/><span>配置中心</span></button>
      </nav>
      <div className="runtime">
        <span className={`status-dot ${online ? 'live' : ''}`}/>
        <div><strong>{online ? 'Runtime 已连接' : stopped ? 'Runtime 已停止' : '等待 Runtime'}</strong><small>{online ? '本地服务 · v0.1' : '检查连接与令牌'}</small></div>
        <button className="icon-button" title="重启服务" aria-label="重启服务" disabled={locked || !api} onClick={() => void control('restart')}><RotateCw size={14} className={lifecycle === 'restart' ? 'spin' : ''}/></button>
        <button className="icon-button danger" title="完全退出" aria-label="完全退出" disabled={locked} onClick={() => void control('stop')}><Power size={14}/></button>
      </div>
    </aside>
    <main>
      <header className="topbar">
        <h1>{pageNames[page]}</h1>
        {page === 'monitor' ? <div className="summary"><span><b>{count(stats.total)}</b>任务</span><span data-tone={running ? 'good' : undefined}><b>{count(stats.running)}</b>运行中</span><span data-tone={failures ? 'bad' : undefined}><b>{count(failures)}</b>失败</span><span><b>{count((stats.hooks as { count?: number } | undefined)?.count)}</b>Hook 事件</span></div>
          : <div className="summary">Agent 接入、执行 Shell 与终端外观</div>}
        <div className="heading-actions">
          {page === 'monitor' && <button className={`button ${prefs.float && isTauri() ? 'active' : ''}`} aria-pressed={prefs.float && isTauri()} title="在屏幕角落悬浮显示正在执行的命令" onClick={toggleFloat}><PictureInPicture2 size={14}/>悬浮窗</button>}
          {page === 'monitor' && isTauri() && <button className={`button ${pinned ? 'active' : ''}`} aria-pressed={pinned} onClick={() => { void getCurrentWindow().setAlwaysOnTop(!pinned).then(() => setPinned(!pinned)).catch(report); }}><Pin size={14}/>{pinned ? '取消置顶' : '置顶'}</button>}
          <button className="button" onClick={() => { if (api) void refresh().catch(report); else setAttempt(v => v + 1); }}><RefreshCw size={14}/>刷新</button>
        </div>
      </header>
      <div className={`content ${page}`} key={page}>
        {lifecycle || stopped ? <div className="empty"><Power size={26}/><h2>{stopped ? '后台服务已停止' : lifecycle === 'restart' ? '正在重启后台服务' : '正在完全退出'}</h2><p>{stopped ? '可以关闭此页面，重新启动请运行 pnpm start。' : '正在结束任务并保存状态，请稍候。'}</p></div>
          : !config || !api ? <div className="empty"><Plug size={26} className={error ? '' : 'breathe'}/><h2>{error ? '暂时无法连接' : '正在连接本地工作空间'}</h2><p>桌面端自动发现 Runtime；浏览器请使用带连接令牌的地址。</p><button className="button" onClick={() => setAttempt(v => v + 1)}>重新连接</button></div>
          : page === 'config' ? <ConfigPage api={api} config={config} busy={busy} action={action} report={report}/>
          : <Monitor api={api} tasks={tasks} stats={stats} busy={busy} action={action} report={report} selected={selected} onSelect={setSelected} reveal={reveal}/>}
      </div>
    </main>
    <div className="toasts" aria-live="polite">
      {error && <div className="toast error" role="alert"><TriangleAlert size={15}/><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><X size={14}/></button></div>}
      {notice && <div className="toast" role="status"><Check size={15}/><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={14}/></button></div>}
    </div>
  </div>;
}
