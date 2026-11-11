import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Api, active, type Task } from './api';

export function Terminal({ api, task, onError }: { api: Api; task: Task; onError: (error: unknown) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const running = useRef(active(task));
  running.current = active(task);
  useEffect(() => {
    if (!host.current) return;
    const term = new Xterm({ cursorBlink: true, fontSize: 13, fontFamily: 'Cascadia Code, Consolas, monospace', scrollback: 10000, theme: { background: '#10171e', foreground: '#d4dee7', cursor: '#a5f3c5', selectionBackground: '#3e655b' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    let disposed = false;
    let finished = false;
    let offset = 0;
    let timer: ReturnType<typeof setTimeout>;
    let resizeTimer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const path = `/api/tasks/${encodeURIComponent(task.id)}`;
    let inputQueue = Promise.resolve();
    const input = term.onData(data => {
      if (running.current && !finished) inputQueue = inputQueue.then(async () => { if(running.current && !finished) await api.request(`${path}/input`, { input: data }, controller.signal); }).then(() => undefined).catch(async error => {
        if(disposed)return;
        try { const state=await api.request<Task>(path); if(!active(state)){finished=true;running.current=false;return;} } catch {}
        onError(error);
      });
    });
    const resize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (disposed) return;
        fit.fit();
        if (term.cols < 2 || term.rows < 2) return;
        if (running.current) void api.request(`${path}/resize`, { cols: term.cols, rows: term.rows }, controller.signal).catch(error => { if (!disposed) onError(error); });
      }, 150);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    async function poll() {
      try {
        const data = await api.request<{ output: string; offset: number; done: boolean }>(`${path}/output?offset=${offset}`, undefined, controller.signal);
        if (disposed) return;
        if (data.offset < offset) term.reset();
        if (data.output) term.write(data.output);
        offset = data.offset;
        if(data.done) { finished=true; running.current=false; }
      } catch (error) { if (!disposed) onError(error); }
      if (!disposed) timer = setTimeout(poll, running.current ? 500 : 2000);
    }
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); clearTimeout(resizeTimer); observer.disconnect(); input.dispose(); term.dispose(); };
  }, [api, task.id, onError]);
  return <div className="terminal" ref={host} aria-label={`任务 ${task.id} 的交互终端`} />;
}
