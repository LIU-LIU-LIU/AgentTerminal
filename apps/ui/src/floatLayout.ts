import { active, type Task } from './api';

export interface Rect { x: number; y: number; w: number; h: number }
export type Dock = 'left' | 'right' | null;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export interface Screen { bounds: Rect; area: Rect }

/** The work area of the monitor under the window's centre, so a drag can cross monitors. */
export function pickArea(win: Rect, screens: Screen[], fallback: Rect): Rect {
  const cx = win.x + win.w / 2, cy = win.y + win.h / 2;
  return screens.find(({ bounds }) => cx >= bounds.x && cx < bounds.x + bounds.w && cy >= bounds.y && cy < bounds.y + bounds.h)?.area ?? fallback;
}

/** While dragging the window never leaves the work area. */
export function dragBounds(win: Rect, area: Rect): Rect {
  return { ...win, x: clamp(win.x, area.x, area.x + area.w - win.w), y: clamp(win.y, area.y, area.y + area.h - win.h) };
}

/**
 * On release, given where the pointer tried to put the window: dock when it was pushed more than
 * `snap` past a side edge, stick to any edge closer than `snap`, and always end up inside the area.
 */
export function settle(win: Rect, area: Rect, snap: number): Rect & { dock: Dock } {
  const right = area.x + area.w - win.w;
  const bottom = area.y + area.h - win.h;
  const dock: Dock = win.x < area.x - snap ? 'left' : win.x > right + snap ? 'right' : null;
  let x = clamp(win.x, area.x, right);
  let y = clamp(win.y, area.y, bottom);
  if (x - area.x < snap) x = area.x; else if (right - x < snap) x = right;
  if (y - area.y < snap) y = area.y; else if (bottom - y < snap) y = bottom;
  return { x, y, w: win.w, h: win.h, dock };
}

/** Changes the width while keeping the edge nearest to the screen border in place. */
export function resizeAnchored(win: Rect, area: Rect, width: number, dock: Dock = null): Rect {
  const anchorRight = dock ? dock === 'right' : win.x + win.w / 2 > area.x + area.w / 2;
  const x = anchorRight ? win.x + win.w - width : win.x;
  return { x: clamp(x, area.x, area.x + area.w - width), y: win.y, w: width, h: win.h };
}

/** Latest running command takes focus; when it ends, fall back to remaining background work. */
export function floatCards(tasks: Task[], now: number, lingerMs = 12000, limit = 3): Task[] {
  const latest = new Map<string, Task>();
  const started = (task: Task) => Date.parse(String(task.started_at ?? task.startedAt ?? '')) || 0;
  for (const task of tasks) {
    const agent = task.agent || 'manual';
    const previous = latest.get(agent);
    if (!previous || (active(task) && !active(previous)) ||
      (active(task) === active(previous) && started(task) > started(previous))) latest.set(agent, task);
  }
  const cards = [...latest.values()].filter(task => active(task) || now - Date.parse(String(task.ended_at ?? '')) < lingerMs);
  return cards.sort((a, b) => Number(active(b)) - Number(active(a)) || started(a) - started(b)).slice(0, limit);
}
