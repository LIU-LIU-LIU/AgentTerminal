import { existsSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import path from 'node:path';

export function resolveShell(shell = 'gitbash', override?: string): { file: string; args: string[] } {
  if (override) {
    if (!path.isAbsolute(override) || !existsSync(override)) throw new Error('Configured shell executable does not exist');
    const args = shell === 'gitbash' ? ['--noprofile','--norc'] : shell === 'pwsh' ? ['-NoLogo','-NoProfile','-Command'] : shell === 'cmd' ? ['/d','/s','/c'] : undefined;
    if (!args) throw new Error('Unsupported shell');
    return {file:override,args};
  }
  if (shell === 'gitbash') {
    if (process.platform !== 'win32') {
      const file = process.env.AGENT_TERMINAL_BASH || '/bin/bash';
      if (!existsSync(file)) throw new Error('Bash unavailable');
      return { file, args: ['--noprofile', '--norc'] };
    }
    const candidates = [process.env.AGENT_TERMINAL_BASH];
    try {
      const output = execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 65536 }).trim();
      candidates.push(path.resolve(output, '../../bin/bash.exe'));
    } catch {}
    for (const hive of ['HKLM', 'HKCU']) {
      try {
        const output = execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/reg.exe'), ['query', `${hive}\\SOFTWARE\\GitForWindows`, '/v', 'InstallPath'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore','pipe','ignore'] });
        const install = output.match(/InstallPath\s+REG_SZ\s+(.+)/)?.[1]?.trim();
        if (install) candidates.push(path.join(install, 'bin/bash.exe'));
      } catch {}
    }
    candidates.push('C:/Program Files/Git/bin/bash.exe', path.join(process.env.LOCALAPPDATA || '', 'Programs/Git/bin/bash.exe'));
    const file = candidates.find(candidate => candidate && existsSync(candidate));
    if (!file) throw new Error('Git Bash not found. Set AGENT_TERMINAL_BASH to an absolute bash.exe path.');
    return { file, args: ['--noprofile', '--norc'] };
  }
  if (shell === 'pwsh') {
    let file: string;
    try { file=execFileSync(process.platform==='win32' ? path.join(process.env.SystemRoot || 'C:/Windows','System32/where.exe') : 'which',[process.platform==='win32'?'pwsh.exe':'pwsh'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim().split(/\r?\n/)[0]; }
    catch { const fallback=path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'); if(process.platform!=='win32'||!existsSync(fallback))throw new Error('PowerShell not found'); file=fallback; }
    return {file,args:['-NoLogo','-NoProfile','-Command']};
  }
  if (shell === 'cmd' && process.platform === 'win32') return { file: process.env.ComSpec || 'C:/Windows/System32/cmd.exe', args: ['/d', '/s', '/c'] };
  throw new Error(`Unsupported shell: ${shell}`);
}

export async function killProcessTree(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) return;
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => execFile(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()));
    return;
  }
  const listing = await new Promise<string>(resolve => execFile('ps', ['-e', '-o', 'pid=,ppid='], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (_error, stdout) => resolve(stdout || '')));
  const children = new Map<number, number[]>();
  for (const line of listing.trim().split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    if (child > 1 && parent > 0) children.set(parent, [...(children.get(parent) || []), child]);
  }
  const descendants: number[] = [];
  const visit = (parent: number) => { for (const child of children.get(parent) || []) { visit(child); descendants.push(child); } };
  visit(pid);
  for (const target of [pid, ...descendants]) { try { process.kill(-target, 'SIGKILL'); } catch {} }
  for (const target of [...descendants, pid]) { try { process.kill(target, 'SIGKILL'); } catch {} }
}
