import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function runtimeUrl() {
  if (process.env.AGENT_TERMINAL_RUNTIME_URL) return process.env.AGENT_TERMINAL_RUNTIME_URL;
  try { return JSON.parse(readFileSync(join(process.env.AGENT_TERMINAL_HOME || join(homedir(), '.agentterminal'), 'connection.json'), 'utf8')).url as string; }
  catch { return 'http://127.0.0.1:4317'; }
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, proxy: { '/api': runtimeUrl() } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { terminal: ['@xterm/xterm', '@xterm/addon-fit'] } } } },
});
