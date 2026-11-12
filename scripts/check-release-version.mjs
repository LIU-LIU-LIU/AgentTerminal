import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? '';
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw new Error('Use a version tag such as v0.1.0 or v0.2.0-beta.1');
const version = tag.slice(1);
const versions = {
  'package.json': json('package.json').version,
  'apps/ui/package.json': json('apps/ui/package.json').version,
  'apps/ui/src-tauri/tauri.conf.json': json('apps/ui/src-tauri/tauri.conf.json').version,
  'apps/ui/src-tauri/Cargo.toml': readFileSync(new URL('apps/ui/src-tauri/Cargo.toml', root), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1],
};
for (const [file, actual] of Object.entries(versions)) {
  if (actual !== version) throw new Error(`${file}: version ${actual} does not match ${tag}; update all version files before tagging`);
}
console.log(`Release version verified: ${tag}`);
