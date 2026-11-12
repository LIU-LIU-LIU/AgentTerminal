import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Api, active, type Task } from './api';
import type { TerminalLook } from './themes';
import { streamFrame } from './streamPreview';

interface Props { api: Api; task: Task; look: TerminalLook; onError?: (error: unknown) => void; readOnly?: boolean; fontSize?: number; smooth?: boolean }

export function Terminal({ api, task, look, onError, readOnly = false, fontSize, smooth = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<{ term: Xterm; fit: FitAddon }>(undefined);
  const running = useRef(active(task));
  running.current = active(task);
  const lookRef = useRef(look);
  lookRef.current = look;
  const size = fontSize ?? look.fontSize;

  useEffect(() => {
    if (!host.current) return;
    const initial = lookRef.current;
    const term = new Xterm({ cursorBlink: !readOnly, disableStdin: readOnly, cursorStyle: initial.cursorStyle, cursorInactiveStyle: readOnly ? 'none' : 'outline', fontSize: size, fontFamily: initial.fontFamily, scrollback: readOnly ? 1000 : 10000, theme: initial.colors });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Replayed output may contain "who are you" queries; answering them would type the reply into the task.
    const swallow = [term.parser.registerCsiHandler({ final: 'c' }, () => true), term.parser.registerCsiHandler({ prefix: '>', final: 'c' }, () => true)];
    term.open(host.current);
    terminal.current = { term, fit };
    let disposed = false;
    let finished = false;
    let offset = 0;
    let timer: ReturnType<typeof setTimeout>;
    let resizeTimer: ReturnType<typeof setTimeout>;
    let frame = 0;
    let queue = '';
    let lastFrame = 0;
    let writing = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const paint = (time: number) => {
      frame = 0;
      if (disposed || writing || !queue) return;
      const [chunk, rest] = motion.matches ? [queue, ''] : streamFrame(queue, lastFrame ? time - lastFrame : 16);
      lastFrame = time;
      queue = rest;
      writing = true;
      term.write(chunk, () => {
        writing = false;
        if (!disposed && queue && !frame) frame = requestAnimationFrame(paint);
      });
    };
    const write = (output: string) => {
      if (!smooth) { term.write(output); return; }
      queue += output;
      if (!frame && !writing) { lastFrame = 0; frame = requestAnimationFrame(paint); }
    };
    const controller = new AbortController();
    const report = (error: unknown) => { if (!disposed) onError?.(error); };
    const path = `/api/tasks/${encodeURIComponent(task.id)}`;
    let inputQueue = Promise.resolve();
    const input = readOnly ? undefined : term.onData(data => {
      if (running.current && !finished) inputQueue = inputQueue.then(async () => { if (running.current && !finished) await api.request(`${path}/input`, { input: data }, controller.signal); }).then(() => undefined).catch(async error => {
        if (disposed) return;
        try { const state = await api.request<Task>(path); if (!active(state)) { finished = true; running.current = false; return; } } catch {}
        report(error);
      });
    });
    const resize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (disposed) return;
        fit.fit();
        if (term.cols < 2 || term.rows < 2) return;
        if (running.current && !readOnly) void api.request(`${path}/resize`, { cols: term.cols, rows: term.rows }, controller.signal).catch(report);
      }, 150);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    async function poll() {
      try {
        const data = await api.request<{ output: string; offset: number; done: boolean; more?: boolean }>(`${path}/output?offset=${offset}`, undefined, controller.signal);
        if (disposed) return;
        if (data.offset < offset) { queue = ''; term.reset(); }
        if (data.output) write(data.output);
        offset = data.offset;
        if (data.done && !data.more) { finished = true; running.current = false; return; }
        if (data.more) { timer = setTimeout(poll, 0); return; }
      } catch (error) { report(error); }
      if (!disposed) timer = setTimeout(poll, running.current ? (smooth ? 100 : 250) : 2000);
    }
    void poll();
    return () => { disposed = true; queue = ''; cancelAnimationFrame(frame); terminal.current = undefined; controller.abort(); clearTimeout(timer); clearTimeout(resizeTimer); observer.disconnect(); input?.dispose(); swallow.forEach(handler => handler.dispose()); term.dispose(); };
  }, [api, task.id, onError, readOnly, smooth]);

  useEffect(() => {
    const current = terminal.current;
    if (!current) return;
    current.term.options.theme = look.colors;
    current.term.options.fontFamily = look.fontFamily;
    current.term.options.fontSize = size;
    current.term.options.cursorStyle = look.cursorStyle;
    current.fit.fit();
  }, [look.colors, look.fontFamily, look.cursorStyle, size]);

  return <div className="terminal" ref={host} aria-label={`任务 ${task.id} 的${readOnly ? '输出预览' : '交互终端'}`} />;
}
