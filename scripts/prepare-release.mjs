import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function nextVersion(current, tags) {
  const parse = value => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const source = parse(current);
  if (!source) throw new Error('Automatic releases require a stable major.minor.patch version');
  const latest = tags.map(parse).filter(Boolean).sort(compare).at(-1);
  if (!latest || compare(source, latest) > 0) return source.join('.');
  return [latest[0], latest[1], latest[2] + 1].join('.');
}

export function stampVersion(root, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid stable version');
  for (const file of ['package.json', 'apps/ui/package.json', 'apps/ui/src-tauri/tauri.conf.json']) {
    const target = path.join(root, file);
    const text = readFileSync(target, 'utf8');
    writeFileSync(target, text.replace(/("version"\s*:\s*")[^"]+"/, `$1${version}"`));
  }
  const cargo = path.join(root, 'apps/ui/src-tauri/Cargo.toml');
  writeFileSync(cargo, readFileSync(cargo, 'utf8').replace(/^(version\s*=\s*")[^"]+"/m, `$1${version}"`));
  const lock = path.join(root, 'apps/ui/src-tauri/Cargo.lock');
  writeFileSync(lock, readFileSync(lock, 'utf8').replace(/(\[\[package\]\]\r?\nname = "agentterminal-ui"\r?\nversion = ")[^"]+"/, `$1${version}"`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const current = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
  const version = process.argv[2] ?? nextVersion(current, tags);
  stampVersion(root, version);
  console.log(`v${version}`);
}
