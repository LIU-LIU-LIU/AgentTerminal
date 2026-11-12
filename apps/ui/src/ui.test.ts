import { describe, expect, it } from 'vitest';
import { dragBounds, floatCards, pickArea, resizeAnchored, settle } from './floatLayout';
import { DEFAULT_PREFS, parseJsonc, resolveIde, resolveLook } from './themes';
import { formatDuration, taskDuration } from './labels';
import { streamFrame, FLOAT_IDLE_MS } from './streamPreview';

describe('streamed floating preview', () => {
  it('reveals a burst over frames, preserving ANSI, Unicode and order exactly', () => {
    const original = '\x1b[32m你好🙂\x1b[0m\r\n' + 'line\r\n'.repeat(200);
    let pending = original, result = '', frames = 0;
    while (pending) {
      const [chunk, rest] = streamFrame(pending, 16);
      expect(chunk.length).toBeGreaterThan(0);
      expect(/[\uD800-\uDBFF]$/.test(chunk)).toBe(false);
      result += chunk; pending = rest; frames++;
    }
    expect(result).toBe(original);
    expect(frames).toBeGreaterThan(1);
    expect(frames).toBeLessThan(150);
  });
  it('catches up large bursts without a long backlog and allows idle reading time', () => {
    let pending = 'x'.repeat(65536), frames = 0;
    while (pending) { pending = streamFrame(pending, 16)[1]; frames++; }
    expect(frames).toBeLessThan(100);
    expect(FLOAT_IDLE_MS).toBe(10000);
  });
});

describe('terminal look', () => {
  it('parses settings with comments, trailing commas and slashes inside strings', () => {
    expect(parseJsonc('{ // note\n "a": "http://x/*y*/", /* block */ "b": [1, 2,], }')).toEqual({ a: 'http://x/*y*/', b: [1, 2] });
  });
  it('follows the first IDE whose settings parse, including its colour overrides and font', () => {
    const ide = resolveIde([
      { ide: 'Cursor', text: '{ broken' },
      { ide: 'VS Code', text: '{ "workbench.colorTheme": "Dracula Soft", "terminal.integrated.fontSize": 15, "editor.fontFamily": "Fira Code", "workbench.colorCustomizations": { "terminal.background": "#101010", "[Dracula Soft]": { "terminal.ansiRed": "#ff0000" }, "terminal.foreground": "red" } }' },
    ]);
    expect(ide).toMatchObject({ ide: 'VS Code', themeId: 'dracula', fontSize: 15, fontFamily: 'Fira Code', overrides: { background: '#101010', red: '#ff0000' } });
    const look = resolveLook(DEFAULT_PREFS, ide);
    expect(look.colors).toMatchObject({ background: '#101010', red: '#ff0000', green: '#50fa7b' });
    expect(look).toMatchObject({ fontSize: 15, fontFamily: 'Fira Code', source: 'VS Code · Dracula Soft' });
  });
  it('defaults an IDE without a chosen theme to Dark Modern and lets explicit choices win', () => {
    const ide = resolveIde([{ ide: 'VS Code', text: '{}' }]);
    expect(ide?.themeId).toBe('dark-modern');
    const look = resolveLook({ ...DEFAULT_PREFS, theme: 'nord', fontSize: 16, fontFamily: 'Hack' }, { ...ide!, overrides: { background: '#000000' } });
    expect(look).toMatchObject({ fontSize: 16, fontFamily: 'Hack', source: 'Nord' });
    expect(look.colors.background).toBe('#2e3440');
  });
  it('falls back to the system scheme when no IDE is found', () => {
    expect(resolveLook(DEFAULT_PREFS, undefined, false).theme.id).toBe('light-modern');
    expect(resolveLook({ ...DEFAULT_PREFS, theme: 'removed-theme' }, undefined, true).theme.id).toBe('dark-modern');
  });
});

describe('floating window layout', () => {
  const area = { x: 0, y: 0, w: 1920, h: 1040 };
  const win = { x: 0, y: 0, w: 400, h: 260 };
  it('snaps to nearby edges and stays inside the work area', () => {
    expect(settle({ ...win, x: 1500, y: 770 }, area, 28)).toMatchObject({ x: 1520, y: 780, dock: null });
    expect(settle({ ...win, x: 600, y: -90 }, area, 28)).toMatchObject({ x: 600, y: 0, dock: null });
  });
  it('docks only when pushed well past a side edge', () => {
    expect(settle({ ...win, x: 1600, y: 300 }, area, 28)).toMatchObject({ x: 1520, y: 300, dock: 'right' });
    expect(settle({ ...win, x: -40, y: 300 }, area, 28)).toMatchObject({ x: 0, dock: 'left' });
    expect(settle({ ...win, x: 1540, y: 300 }, area, 28)).toMatchObject({ x: 1520, dock: null });
  });
  it('keeps the window inside the work area while dragging and follows the monitor under it', () => {
    expect(dragBounds({ ...win, x: 5000, y: 5000 }, area)).toMatchObject({ x: 1520, y: 780 });
    const second = { bounds: { x: 1920, y: 0, w: 2560, h: 1440 }, area: { x: 1920, y: 0, w: 2560, h: 1400 } };
    const screens = [{ bounds: { ...area, h: 1080 }, area }, second];
    expect(pickArea({ ...win, x: 1700 }, screens, area)).toBe(area);
    expect(pickArea({ ...win, x: 1800 }, screens, area)).toBe(second.area);
    expect(pickArea({ ...win, x: 9000 }, screens, area)).toBe(area);
  });
  it('grows towards the screen centre when another agent appears', () => {
    expect(resizeAnchored({ ...win, x: 1520 }, area, 800)).toMatchObject({ x: 1120, w: 800 });
    expect(resizeAnchored({ ...win, x: 100 }, area, 800)).toMatchObject({ x: 100, w: 800 });
    expect(resizeAnchored({ ...win, x: 1520 }, area, 28, 'right')).toMatchObject({ x: 1892, w: 28 });
  });
  it('shows one card per working agent and lingers briefly after a task ends', () => {
    const now = Date.parse('2026-01-01T00:01:00Z');
    const tasks = [
      { id: 'c2', agent: 'codex', status: 'running' },
      { id: 'a1', agent: 'claude', status: 'ok', ended_at: '2026-01-01T00:00:57Z' },
      { id: 'c1', agent: 'codex', status: 'running' },
      { id: 'm1', agent: 'manual', status: 'failed', ended_at: '2026-01-01T00:00:00Z' },
    ];
    expect(floatCards(tasks, now).map(task => task.id)).toEqual(['c2', 'a1']);
    expect(floatCards(tasks.slice(3), now)).toEqual([]);
    expect(floatCards([], now)).toEqual([]);
  });
  it('focuses the latest running command then returns to background work when it finishes', () => {
    const now = Date.parse('2026-01-01T01:00:01Z');
    const background = { id: 'background', agent: 'codex', status: 'running', started_at: '2026-01-01T00:00:00Z' };
    const tasks = [
      { id: 'short', agent: 'codex', status: 'ok', started_at: '2026-01-01T00:59:50Z', ended_at: '2026-01-01T00:59:53.600Z' },
      { id: 'new-running', agent: 'codex', status: 'running', started_at: '2026-01-01T00:59:00Z' },
      background,
    ];
    expect(floatCards(tasks, now)).toEqual([tasks[1]]);
    expect(floatCards([...tasks].reverse(), now)).toEqual([tasks[1]]);
    expect(floatCards(tasks.map(task => task.id === 'new-running' ? { ...task, status: 'ok', ended_at: new Date(now).toISOString() } : task), now)).toEqual([background]);
    expect(taskDuration(background, now)).toBe(3601000);
    expect(taskDuration(background, now + 1000)).toBe(3602000);
    expect(formatDuration(taskDuration(background, now))).toBe('1 小时 0 分 1 秒');
    expect(taskDuration(tasks[0], now)).toBe(3600);
  });
  it('never lets recently completed agents displace running agents at the card limit', () => {
    const now = Date.parse('2026-01-01T01:00:00Z');
    const ended_at = new Date(now - 1000).toISOString();
    const tasks = ['a', 'b', 'c'].map(agent => ({ id: agent, agent, status: 'ok', ended_at }));
    expect(floatCards([...tasks, { id: 'live', agent: 'z', status: 'running' }], now, 8000, 1).map(task => task.id)).toEqual(['live']);
  });
});
