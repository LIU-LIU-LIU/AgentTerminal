import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { resolveShell } from './shell.js';

export type ShellSettings = { default_shell: 'gitbash' | 'pwsh' | 'cmd'; paths: Partial<Record<'gitbash' | 'pwsh' | 'cmd', string>> };
export function loadShellSettings(home: string): ShellSettings {
  const file = path.join(home, 'shell.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { default_shell: 'gitbash', paths: {} };
}
export function saveShellSettings(home: string, value: ShellSettings) {
  if (!value || !['gitbash','pwsh','cmd'].includes(value.default_shell) || !value.paths || typeof value.paths !== 'object' || Array.isArray(value.paths)) throw new Error('Invalid shell settings');
  for (const [shell, file] of Object.entries(value.paths)) {
    if (!['gitbash','pwsh','cmd'].includes(shell) || typeof file !== 'string' || !path.isAbsolute(file) || !existsSync(file) || !statSync(file).isFile()) throw new Error('Shell paths must point to existing absolute executables');
    if (process.platform === 'win32' && !/\.exe$/i.test(file)) throw new Error('Select an .exe shell');
  }
  resolveShell(value.default_shell, value.paths[value.default_shell]);
  const file=path.join(home,'shell.json');
  writeFileSync(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});
  renameSync(file+'.tmp',file);
  return shellConfiguration(home);
}
export function shellConfiguration(home: string) {
  const settings=loadShellSettings(home);
  const detected=Object.fromEntries(['gitbash','pwsh','cmd'].map(shell=> {
    try { return [shell,{available:true,path:resolveShell(shell,settings.paths[shell as keyof typeof settings.paths]).file}]; }
    catch(error) { return [shell,{available:false,error:(error as Error).message}]; }
  }));
  return {...settings,detected};
}
