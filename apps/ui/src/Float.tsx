import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { PhysicalPosition, PhysicalSize, availableMonitors, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { ChevronLeft, ChevronRight, SquareTerminal, X } from 'lucide-react';
import { Api, active, connect, type Task } from './api';
import { Terminal } from './Terminal';
import { dragBounds, floatCards, pickArea, resizeAnchored, settle, type Dock, type Rect, type Screen } from './floatLayout';
import { agentName, formatDuration, shellName, stateOf, taskDuration, useNow } from './labels';
import { announce, lookVars, savePrefs, useLook, usePrefs, type TerminalLook } from './themes';
import { FLOAT_IDLE_MS } from './streamPreview';

// Logical pixels. PAD is the transparent margin that leaves room for the card shadow.
const CARD_W = 372, CARD_H = 236, GAP = 10, PAD = 12, STRIP = 20, STRIP_H = 60, SNAP = 28;
const POSITION_KEY = 'agentterminal.float';
const logicalWidth = (count: number) => count * CARD_W + (count - 1) * GAP + PAD * 2;

/** Moves, snaps, docks and collapses the native floating window. Inactive in a browser popup. */
function useFloatWindow(count: number, idle: boolean) {
  const tauri = isTauri();
  const rect = useRef<Rect>(undefined);
  const dock = useRef<Dock>(null);
  const counter = useRef(count);
  counter.current = count;
  const idleRef = useRef(idle);
  idleRef.current = idle;
  const hovering = useRef(false);
  const drag = useRef<{ sx: number; sy: number; origin: Rect; raw: Rect; area?: Rect; moved: boolean }>(undefined);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [side, setSide] = useState<'left' | 'right'>('right');
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const scaleRef = useRef(window.devicePixelRatio || 1);

  // Window geometry is in physical pixels; the scale changes when the window lands on another monitor.
  const scale = () => scaleRef.current;
  const size = () => ({ w: Math.round((collapsedRef.current ? STRIP : logicalWidth(counter.current)) * scale()), h: Math.round((collapsedRef.current ? STRIP_H : CARD_H + PAD * 2) * scale()) });
  const toRect = (position: { x: number; y: number }, extent: { width: number; height: number }): Rect => ({ x: position.x, y: position.y, w: extent.width, h: extent.height });
  // Cached so a drag can start on the very first pointer move without waiting for the host.
  const areaRef = useRef<Rect>(undefined);
  const screensRef = useRef<Screen[]>([]);
  async function workArea(): Promise<Rect | undefined> {
    const monitor = await currentMonitor() ?? await primaryMonitor();
    if (monitor) areaRef.current = toRect(monitor.workArea.position, monitor.workArea.size);
    return areaRef.current;
  }
  const loadScreens = () => availableMonitors().then(monitors => { screensRef.current = monitors.map(monitor => ({ bounds: toRect(monitor.position, monitor.size), area: toRect(monitor.workArea.position, monitor.workArea.size) })); }).catch(() => undefined);
  function place(next: Rect) {
    const previous = rect.current;
    rect.current = next;
    const win = getCurrentWindow();
    if (!previous || previous.w !== next.w || previous.h !== next.h) void win.setSize(new PhysicalSize(next.w, next.h));
    void win.setPosition(new PhysicalPosition(Math.round(next.x), Math.round(next.y)));
  }
  function remember(area: Rect) {
    const current = rect.current!;
    setSide(dock.current ?? (current.x + current.w / 2 > area.x + area.w / 2 ? 'right' : 'left'));
    if (!collapsedRef.current) localStorage.setItem(POSITION_KEY, JSON.stringify({ x: current.x, y: current.y, dock: dock.current }));
  }
  async function collapse(value: boolean) {
    if (!tauri) { collapsedRef.current = value; setCollapsed(value); return; }
    const area = await workArea();
    if (!area || !rect.current) return;
    collapsedRef.current = value && idleRef.current;
    setCollapsed(collapsedRef.current);
    const previous = rect.current;
    const extent = size();
    // Keep the tab's centre steady when folding, and clamp expanded cards to the work area.
    const y = Math.max(area.y, Math.min(previous.y + (previous.h - extent.h) / 2, area.y + area.h - extent.h));
    place(resizeAnchored({ ...previous, y, h: extent.h }, area, extent.w, dock.current));
  }
  const scheduleCollapse = (force = false) => { clearTimeout(collapseTimer.current); if (idleRef.current) collapseTimer.current = setTimeout(() => { if (idleRef.current && !drag.current && (force || !hovering.current)) void collapse(true); }, force ? FLOAT_IDLE_MS : 1200); };

  useEffect(() => {
    if (!tauri) return;
    let cancelled = false;
    void (async () => {
      const area = await workArea();
      if (!area || cancelled) return;
      let saved: { x?: number; y?: number; dock?: Dock } | null = null;
      try { saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null'); } catch { /* start from the default corner */ }
      const start = settle({ x: saved?.x ?? area.x + area.w, y: saved?.y ?? area.y + area.h, ...size() }, area, 0);
      dock.current = saved?.dock === 'left' || saved?.dock === 'right' ? saved.dock : null;
      place(resizeAnchored(start, area, start.w, dock.current));
      remember(area);
      await getCurrentWindow().show();
      scheduleCollapse(idleRef.current);
    })();
    void loadScreens();
    // The system rescales the window when it moves to a monitor with another DPI: restore the intended size.
    const unlisten = getCurrentWindow().onScaleChanged(({ payload }) => {
      scaleRef.current = payload.scaleFactor;
      if (!rect.current) return;
      const next = { ...rect.current, ...size() };
      if (drag.current) drag.current.origin = { ...drag.current.origin, ...size() };
      rect.current = undefined;
      place(next);
    });
    return () => { cancelled = true; clearTimeout(collapseTimer.current); void unlisten.then(stop => stop()); };
  }, [tauri]);

  useEffect(() => {
    if (!tauri || !rect.current || collapsedRef.current) return;
    void workArea().then(area => { if (area && rect.current && !collapsedRef.current) { place(resizeAnchored(rect.current, area, size().w, dock.current)); remember(area); } });
  }, [tauri, count]);

  useEffect(() => {
    if (idle) scheduleCollapse(true);
    else { clearTimeout(collapseTimer.current); void collapse(false); }
    return () => clearTimeout(collapseTimer.current);
  }, [idle]);

  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!tauri || event.button !== 0 || !rect.current || (event.target as Element).closest('button')) return;
      // Capture at once: the window follows the pointer with a delay, so the pointer may leave it mid-drag.
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { sx: event.screenX, sy: event.screenY, origin: rect.current, raw: rect.current, area: areaRef.current, moved: false };
      void workArea().then(area => { if (drag.current && !drag.current.moved) drag.current.area = area; });
      void loadScreens();
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const state = drag.current;
      if (!state?.area) return;
      const dx = (event.screenX - state.sx) * scale(), dy = (event.screenY - state.sy) * scale();
      if (!state.moved && Math.hypot(dx, dy) < 4 * scale()) return;
      state.moved = true;
      state.raw = { ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy };
      state.area = pickArea(state.raw, screensRef.current, state.area);
      place(dragBounds(state.raw, state.area));
    },
    onPointerUp() {
      const state = drag.current;
      drag.current = undefined;
      if (!state?.moved || !state.area || !rect.current) return;
      const settled = settle({ ...state.raw, w: rect.current.w, h: rect.current.h }, state.area, SNAP * scale());
      dock.current = settled.dock;
      place({ x: settled.x, y: settled.y, w: settled.w, h: settled.h });
      if (collapsedRef.current && !settled.dock) void collapse(false).then(() => remember(state.area!));
      else remember(state.area);
      scheduleCollapse();
    },
    onPointerCancel() { drag.current = undefined; },
    onMouseEnter() { hovering.current = true; clearTimeout(collapseTimer.current); if (collapsedRef.current) void collapse(false); },
    onMouseLeave() { hovering.current = false; if (!drag.current) scheduleCollapse(); },
  };
  return { tauri, side, collapsed, handlers };
}

function FloatCard({ api, task, look }: { api: Api; task: Task; look: TerminalLook }) {
  const running = active(task);
  const now = useNow(1000, running);
  const [command, setCommand] = useState('');
  useEffect(() => {
    const text = Array.from(task.command || task.id);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setCommand(text.join('')); return; }
    let frame = 0;
    let start: number | undefined;
    const reveal = (time: number) => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 420);
      setCommand(text.slice(0, Math.ceil(text.length * progress)).join(''));
      if (progress < 1) frame = requestAnimationFrame(reveal);
    };
    setCommand('');
    frame = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(frame);
  }, [task.id, task.command]);
  return <article className="float-card" data-state={stateOf(task)} style={lookVars(look) as CSSProperties} data-task={task.id} title="双击在 Agent Terminal 中打开">
    <div className="float-body">
      <header><span className="status-dot"/><b>{agentName(task.agent)}</b><span className="float-shell">{shellName(task.shell)}</span><time>{formatDuration(taskDuration(task, now))}</time><button aria-label="关闭悬浮窗" title="关闭悬浮窗" onClick={() => savePrefs({ float: false })}><X size={13}/></button></header>
      <div className="float-input" title={task.command}><span>❯</span><code>{command}</code><i className="float-caret"/></div>
      <div className="float-output"><Terminal api={api} task={task} look={look} readOnly smooth fontSize={11}/><div className="float-shield"/></div>
    </div>
  </article>;
}

export function FloatView() {
  const prefs = usePrefs();
  const look = useLook();
  const [api, setApi] = useState<Api>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attempt, setAttempt] = useState(0);
  const now = useNow(2000);
  // Keep cards in order of first appearance so a new agent opens beside the existing card instead of displacing it.
  const order = useRef<string[]>([]);
  const cards = useMemo(() => {
    const next = floatCards(tasks, now);
    for (const task of next) if (!order.current.includes(task.agent || 'manual')) order.current.push(task.agent || 'manual');
    return next.sort((a, b) => order.current.indexOf(a.agent || 'manual') - order.current.indexOf(b.agent || 'manual'));
  }, [tasks, now]);
  const { tauri, side, collapsed, handlers } = useFloatWindow(Math.max(1, cards.length), Boolean(api) && !tasks.some(active));

  useEffect(() => { document.title = 'Agent Terminal 悬浮窗'; }, []);
  useEffect(() => { if (!prefs.float) { if (tauri) void getCurrentWindow().close(); else window.close(); } }, [prefs.float, tauri]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    connect().then(connection => { if (!cancelled) setApi(new Api(connection)); }).catch(() => { if (!cancelled) timer = setTimeout(() => setAttempt(value => value + 1), 3000); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [attempt]);
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const next = await api!.tasks(); if (!cancelled) setTasks(next); }
      catch { if (!cancelled) { setApi(undefined); setAttempt(value => value + 1); return; } }
      if (!cancelled) timer = setTimeout(poll, 250);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api]);

  // Handled here, by position: while the pointer is captured for dragging, clicks are retargeted to this element.
  function openTask(event: MouseEvent<HTMLElement>) {
    const id = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-task]')?.dataset.task;
    if (!id) return;
    if (tauri) void invoke('open_task', { id }); else announce({ type: 'open-task', id });
  }
  const Chevron = side === 'right' ? ChevronLeft : ChevronRight;
  return <div className={`float-root ${tauri ? 'native' : 'popup'} ${collapsed ? 'collapsed' : ''}`} data-side={side} style={tauri ? { width: collapsed ? STRIP : logicalWidth(Math.max(1, cards.length)), height: collapsed ? STRIP_H : CARD_H + PAD * 2, padding: collapsed ? 0 : PAD, gap: GAP } : undefined} onDoubleClick={openTask} {...handlers}>
    {api && cards.length ? cards.map(task => <FloatCard key={task.agent || 'manual'} api={api} task={task} look={look}/>) : <article className="float-card" data-state="idle" style={lookVars(look) as CSSProperties}><div className="float-body"><header><span className="status-dot"/><b>Agent Terminal</b><time/><button aria-label="关闭悬浮窗" title="关闭悬浮窗" onClick={() => savePrefs({ float: false })}><X size={13}/></button></header><div className="float-empty"><SquareTerminal size={26}/><p>{api ? '等待 Agent 执行命令' : '正在连接 Runtime…'}</p></div></div></article>}
    {collapsed && <div className="float-strip" style={{ width: STRIP }}><Chevron size={14}/>{cards.map(task => <span key={task.agent || 'manual'} className="status-dot" data-state={stateOf(task)}/>)}</div>}
  </div>;
}
