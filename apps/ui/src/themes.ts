import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme { id: string; name: string; dark: boolean; colors: ITheme }

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;

function theme(id: string, name: string, dark: boolean, background: string, foreground: string, cursor: string, selectionBackground: string, palette: string): TerminalTheme {
  const colors: ITheme = { background, foreground, cursor, cursorAccent: background, selectionBackground };
  palette.split(' ').forEach((color, index) => { colors[ANSI[index]] = color; });
  return { id, name, dark, colors };
}

const VSCODE_DARK = '#000000 #cd3131 #0dbc79 #e5e510 #2472c8 #bc3fbc #11a8cd #e5e5e5 #666666 #f14c4c #23d18b #f5f543 #3b8eea #d670d6 #29b8db #e5e5e5';
const VSCODE_LIGHT = '#000000 #cd3131 #107c10 #949800 #0451a5 #bc05bc #0598bc #555555 #666666 #cd3131 #14ce14 #b5ba00 #0451a5 #bc05bc #0598bc #a5a5a5';
const SOLARIZED = '#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5 #586e75 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3';

export const THEMES: TerminalTheme[] = [
  theme('midnight', 'Midnight Glass', true, '#0b0f17', '#d6dfeb', '#ffb37a', '#ff8a4c40', '#1b2230 #ff6b6b #3ddc97 #ffd166 #5aa9ff #c792ea #56d4dd #c9d3e0 #5b677a #ff8f8f #6ff0b7 #ffe08a #8cc4ff #dbb2ff #86e8ef #f4f7fb'),
  theme('dark-modern', 'Dark Modern', true, '#181818', '#cccccc', '#ffffff', '#264f78', VSCODE_DARK),
  theme('dark-plus', 'Dark+', true, '#1e1e1e', '#cccccc', '#ffffff', '#264f78', VSCODE_DARK),
  theme('one-dark', 'One Dark Pro', true, '#282c34', '#abb2bf', '#528bff', '#3e4451', '#3f4451 #e05561 #8cc265 #d18f52 #4aa5f0 #c162de #42b3c2 #d7dae0 #4f5666 #ff616e #a5e075 #f0a45d #4dc4ff #de73ff #4cd1e0 #e6e6e6'),
  theme('dracula', 'Dracula', true, '#282a36', '#f8f8f2', '#f8f8f2', '#44475a', '#21222c #ff5555 #50fa7b #f1fa8c #bd93f9 #ff79c6 #8be9fd #f8f8f2 #6272a4 #ff6e6e #69ff94 #ffffa5 #d6acff #ff92df #a4ffff #ffffff'),
  theme('tokyo-night', 'Tokyo Night', true, '#1a1b26', '#a9b1d6', '#c0caf5', '#283457', '#15161e #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6 #414868 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #c0caf5'),
  theme('catppuccin', 'Catppuccin Mocha', true, '#1e1e2e', '#cdd6f4', '#f5e0dc', '#45475a', '#45475a #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #bac2de #585b70 #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #a6adc8'),
  theme('github-dark', 'GitHub Dark', true, '#0d1117', '#e6edf3', '#58a6ff', '#264f78', '#484f58 #ff7b72 #3fb950 #d29922 #58a6ff #bc8cff #39c5cf #b1bac4 #6e7681 #ffa198 #56d364 #e3b341 #79c0ff #d2a8ff #56d4dd #ffffff'),
  theme('nord', 'Nord', true, '#2e3440', '#d8dee9', '#d8dee9', '#434c5e', '#3b4252 #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #88c0d0 #e5e9f0 #4c566a #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #8fbcbb #eceff4'),
  theme('monokai', 'Monokai', true, '#272822', '#f8f8f2', '#f8f8f0', '#49483e', '#272822 #f92672 #a6e22e #f4bf75 #66d9ef #ae81ff #a1efe4 #f8f8f2 #75715e #f92672 #a6e22e #f4bf75 #66d9ef #ae81ff #a1efe4 #f9f8f5'),
  theme('gruvbox', 'Gruvbox Dark', true, '#282828', '#ebdbb2', '#ebdbb2', '#504945', '#282828 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #a89984 #928374 #fb4934 #b8bb26 #fabd2f #83a598 #d3869b #8ec07c #ebdbb2'),
  theme('solarized-dark', 'Solarized Dark', true, '#002b36', '#839496', '#93a1a1', '#073642', SOLARIZED),
  theme('campbell', 'Campbell', true, '#0c0c0c', '#cccccc', '#ffffff', '#3a3d41', '#0c0c0c #c50f1f #13a10e #c19c00 #0037da #881798 #3a96dd #cccccc #767676 #e74856 #16c60c #f9f1a5 #3b78ff #b4009e #61d6d6 #f2f2f2'),
  theme('light-modern', 'Light Modern', false, '#f8f8f8', '#3b3b3b', '#005fb8', '#add6ff', VSCODE_LIGHT),
  theme('github-light', 'GitHub Light', false, '#ffffff', '#24292f', '#0969da', '#b6d7ff', '#24292f #cf222e #116329 #4d2d00 #0969da #8250df #1b7c83 #6e7781 #57606a #a40e26 #1a7f37 #633c01 #218bff #a475f9 #3192aa #8c959f'),
  theme('solarized-light', 'Solarized Light', false, '#fdf6e3', '#657b83', '#586e75', '#eee8d5', SOLARIZED),
];
const byId = (id: string) => THEMES.find(item => item.id === id);

// ---- IDE detection --------------------------------------------------------------------------

/** Parses VS Code style settings: JSON with comments and trailing commas. */
export function parseJsonc(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
      out += text.slice(start, i + 1);
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

const IDE_THEME_MATCHERS: [RegExp, string][] = [
  [/solarized.*light/i, 'solarized-light'], [/solarized/i, 'solarized-dark'],
  [/github.*light/i, 'github-light'], [/github/i, 'github-dark'],
  [/one dark|atom one/i, 'one-dark'], [/dracula/i, 'dracula'], [/tokyo/i, 'tokyo-night'],
  [/catppuccin (latte)/i, 'light-modern'], [/catppuccin/i, 'catppuccin'], [/nord/i, 'nord'],
  [/monokai/i, 'monokai'], [/gruvbox.*light/i, 'light-modern'], [/gruvbox/i, 'gruvbox'],
  [/dark\+|visual studio dark|dark \(visual studio\)/i, 'dark-plus'],
  [/light|quiet|latte|day/i, 'light-modern'],
];
const CUSTOM_KEYS: Record<string, keyof ITheme> = {
  'terminal.background': 'background', 'terminal.foreground': 'foreground',
  'terminalCursor.foreground': 'cursor', 'terminal.selectionBackground': 'selectionBackground',
  ...Object.fromEntries(ANSI.map(name => [`terminal.ansi${name[0].toUpperCase()}${name.slice(1)}`, name])),
};

export interface IdeLook { ide: string; themeName: string; themeId: string; overrides: ITheme; fontFamily?: string; fontSize?: number }

/** Picks the terminal look of the first IDE whose settings parse. `files` come ordered by most recently used. */
export function resolveIde(files: { ide: string; text: string }[]): IdeLook | undefined {
  for (const file of files) {
    let settings: Record<string, unknown>;
    try { settings = parseJsonc(file.text) as Record<string, unknown>; } catch { continue; }
    if (!settings || typeof settings !== 'object') continue;
    const themeName = typeof settings['workbench.colorTheme'] === 'string' ? settings['workbench.colorTheme'] as string : 'Default Dark Modern';
    const themeId = IDE_THEME_MATCHERS.find(([pattern]) => pattern.test(themeName))?.[1] ?? 'dark-modern';
    const custom = (settings['workbench.colorCustomizations'] ?? {}) as Record<string, unknown>;
    const scoped = (custom[`[${themeName}]`] ?? {}) as Record<string, unknown>;
    const overrides: ITheme = {};
    for (const source of [custom, scoped]) for (const [key, target] of Object.entries(CUSTOM_KEYS)) {
      const value = source[key];
      if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) (overrides as Record<string, string>)[target] = value;
    }
    const family = settings['terminal.integrated.fontFamily'] || settings['editor.fontFamily'];
    const size = Number(settings['terminal.integrated.fontSize']);
    return { ide: file.ide, themeName, themeId, overrides, fontFamily: typeof family === 'string' && family.trim() ? family : undefined, fontSize: size >= 8 && size <= 32 ? size : undefined };
  }
  return undefined;
}

let ideLook: IdeLook | undefined;
let ideRequest: Promise<void> | undefined;
const ideListeners = new Set<() => void>();
function loadIde() {
  ideRequest ??= (isTauri() ? invoke<{ ide: string; text: string }[]>('ide_settings') : Promise.resolve([]))
    .then(files => { ideLook = resolveIde(files); ideListeners.forEach(listener => listener()); })
    .catch(() => undefined);
}
export function useIdeLook(): IdeLook | undefined {
  useEffect(loadIde, []);
  return useSyncExternalStore(listener => { ideListeners.add(listener); return () => ideListeners.delete(listener); }, () => ideLook);
}

// ---- Preferences (shared by every window through localStorage) --------------------------------

export interface Prefs {
  theme: string; // 'ide' follows the detected IDE, otherwise a theme id
  fontSize: number; // 0 follows the IDE
  fontFamily: string; // empty follows the IDE
  cursorStyle: 'block' | 'bar' | 'underline';
  appearance: 'dark' | 'light' | 'system';
  float: boolean;
}
export const DEFAULT_PREFS: Prefs = { theme: 'ide', fontSize: 0, fontFamily: '', cursorStyle: 'block', appearance: 'dark', float: true };
const PREFS_KEY = 'agentterminal.prefs';
const channel = typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('agentterminal');
const prefListeners = new Set<() => void>();
let prefs = readPrefs();

function readPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
}
function reloadPrefs() { prefs = readPrefs(); prefListeners.forEach(listener => listener()); }
channel?.addEventListener('message', event => { if (event.data?.type === 'prefs') reloadPrefs(); });
if (typeof window !== 'undefined') window.addEventListener('storage', event => { if (event.key === PREFS_KEY) reloadPrefs(); });

export function savePrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode: keep in memory */ }
  prefListeners.forEach(listener => listener());
  channel?.postMessage({ type: 'prefs' });
}
export function usePrefs(): Prefs {
  return useSyncExternalStore(listener => { prefListeners.add(listener); return () => prefListeners.delete(listener); }, () => prefs);
}

/** Cross-window messages: the floating window asks the main window to reveal a task. */
export function announce(message: { type: 'open-task'; id: string }) { channel?.postMessage(message); }
export function onAnnounce(handler: (message: { type: string; id?: string }) => void) {
  const listener = (event: MessageEvent) => handler(event.data ?? {});
  channel?.addEventListener('message', listener);
  return () => channel?.removeEventListener('message', listener);
}

// ---- Resolution --------------------------------------------------------------------------------

export const DEFAULT_FONT = "'Cascadia Code', 'Cascadia Mono', 'JetBrains Mono', Consolas, 'Courier New', monospace";
export interface TerminalLook { theme: TerminalTheme; colors: ITheme; fontFamily: string; fontSize: number; cursorStyle: Prefs['cursorStyle']; source: string }

export function resolveLook(current: Prefs, ide: IdeLook | undefined, dark = true): TerminalLook {
  const followIde = current.theme === 'ide' || !byId(current.theme);
  const base = followIde ? byId(ide?.themeId ?? (dark ? 'dark-modern' : 'light-modern'))! : byId(current.theme)!;
  const colors = followIde && ide ? { ...base.colors, ...ide.overrides } : base.colors;
  return {
    theme: base, colors, cursorStyle: current.cursorStyle,
    fontFamily: current.fontFamily.trim() || ide?.fontFamily || DEFAULT_FONT,
    fontSize: current.fontSize || ide?.fontSize || 13,
    source: !followIde ? base.name : ide ? `${ide.ide} · ${ide.themeName}` : `${base.name}（未检测到 IDE 配置）`,
  };
}

function useSystemDark() {
  return useSyncExternalStore(listener => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, () => window.matchMedia('(prefers-color-scheme: dark)').matches);
}
export function useAppearance(): 'dark' | 'light' {
  const { appearance } = usePrefs();
  const systemDark = useSystemDark();
  return appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;
}
/** The terminal look in effect. Without a detected IDE it follows the interface theme. */
export function useLook(): TerminalLook {
  const current = usePrefs();
  const ide = useIdeLook();
  const dark = useAppearance() === 'dark';
  return useMemo(() => resolveLook(current, ide, dark), [current, ide, dark]);
}

/** CSS variables that let the chrome around a terminal follow its theme. */
export function lookVars(look: TerminalLook): Record<string, string> {
  const c = look.colors;
  return { '--t-bg': c.background!, '--t-fg': c.foreground!, '--t-green': c.green!, '--t-red': c.red!, '--t-yellow': c.yellow!, '--t-blue': c.blue!, '--t-font': look.fontFamily };
}
