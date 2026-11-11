import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import * as TOML from '@iarna/toml';
import { getConfiguration, previewIntegration, installIntegration, uninstallIntegration, toggleSkill } from '../packages/installer/src/index.js';

function sandbox(t: any) {
  const root = mkdtempSync(join(tmpdir(), 'agentterminal-installer-'));
  for (const [key, dir] of Object.entries({ AGENT_TERMINAL_HOME: 'data', CODEX_HOME: 'codex', CLAUDE_CONFIG_DIR: 'claude' })) {
    const previous = process.env[key];
    process.env[key] = join(root, dir);
    mkdirSync(process.env[key]!, { recursive: true });
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  return { root, codex: process.env.CODEX_HOME!, claude: process.env.CLAUDE_CONFIG_DIR!, data: process.env.AGENT_TERMINAL_HOME! };
}

test('Codex preview is read-only and redacted; install/uninstall preserve unrelated external edits', t => {
  const s = sandbox(t), path = join(s.codex, 'config.toml');
  const initial = '# keep this comment\nmodel = "existing"\napi_key = "very-private"\n[mcp_servers.other]\ncommand = "other"\n';
  writeFileSync(path, initial);
  const preview = previewIntegration('codex', 'strict');
  assert(!JSON.stringify(preview).includes('very-private'));
  assert.equal(readFileSync(path, 'utf8'), initial);
  assert(!existsSync(join(s.data, 'installer.json')));
  const config = installIntegration('codex', 'strict');
  assert.equal(typeof (config as any).then, 'undefined');
  assert.deepEqual([config.agents.codex.installed, config.agents.codex.hook, config.agents.codex.skill], [true, true, true]);
  const parsed: any = TOML.parse(readFileSync(path, 'utf8'));
  assert(isAbsolute(parsed.mcp_servers.agentterminal.command));
  assert(isAbsolute(parsed.mcp_servers.agentterminal.args[0]));
  assert(readdirSync(join(s.data, 'backups')).length > 0);
  const backupIndex = readFileSync(join(s.data, 'backups', 'index.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const backup = backupIndex.find(entry => entry.path === path);
  assert(backup);
  assert.equal(readFileSync(backup.backup, 'utf8'), initial);
  const hooksPath = join(s.codex, 'hooks.json');
  const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  hooks.hooks.PreToolUse.push({ hooks: [{ type: 'command', command: 'external-hook' }] });
  writeFileSync(hooksPath, JSON.stringify(hooks));
  writeFileSync(path, readFileSync(path, 'utf8') + '\n[mcp_servers.external]\ncommand = "external"\n');
  uninstallIntegration('codex');
  const after = readFileSync(path, 'utf8');
  assert(after.startsWith(initial));
  assert(after.includes('[mcp_servers.external]'));
  assert(!after.includes('[mcp_servers.agentterminal]'));
  assert.equal(JSON.parse(readFileSync(hooksPath, 'utf8')).hooks.PreToolUse.length, 1);
});

test('Claude uses user MCP JSON and restores collisions while preserving external settings', t => {
  const s = sandbox(t), path = join(s.claude, '.claude.json');
  const old = { command: 'original' };
  writeFileSync(path, JSON.stringify({ token: 'private-token', mcpServers: { agentterminal: old, other: { command: 'other' } } }));
  writeFileSync(join(s.claude, 'settings.json'), JSON.stringify({ permissions: { allow: ['Read'] } }));
  assert(!JSON.stringify(previewIntegration('claude', 'audit')).includes('private-token'));
  installIntegration('claude', 'audit');
  installIntegration('claude', 'strict');
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  doc.external = true;
  writeFileSync(path, JSON.stringify(doc));
  uninstallIntegration('claude');
  const after = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(after.mcpServers.agentterminal, old);
  assert.equal(after.external, true);
  assert.deepEqual(JSON.parse(readFileSync(join(s.claude, 'settings.json'), 'utf8')), { permissions: { allow: ['Read'] } });
});

test('Windows Codex hooks invoke quoted Node with PowerShell call operator; Claude uses Bash syntax', t => {
  const s = sandbox(t);
  for (const agent of ['codex', 'claude'] as const) {
    installIntegration(agent, 'strict');
    const path = join(s[agent], agent === 'codex' ? 'hooks.json' : 'settings.json');
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    for (const event of ['PreToolUse', 'PostToolUse']) {
      const command = doc.hooks[event][0].hooks[0].command;
      const prefix = process.platform === 'win32' && agent === 'codex' ? '& ' : '';
      assert(command.startsWith(`${prefix}"${process.execPath}" `));
      assert.equal(command.startsWith('& '), process.platform === 'win32' && agent === 'codex');
      assert(command.includes(`--mode strict --agent ${agent}`));
    }
  }
});

test('exact restoration, edited managed entries, and owned skills', t => {
  const s = sandbox(t), path = join(s.codex, 'config.toml');
  const initial = '# exact original\nmodel="original"\n';
  writeFileSync(path, initial);
  installIntegration('codex', 'prefer');
  uninstallIntegration('codex');
  assert.equal(readFileSync(path, 'utf8'), initial);
  const other = join(s.codex, 'skills', 'other');
  mkdirSync(other, { recursive: true }); writeFileSync(join(other, 'SKILL.md'), 'other skill');
  toggleSkill('codex', true); toggleSkill('codex', false);
  assert.equal(readFileSync(join(other, 'SKILL.md'), 'utf8'), 'other skill');
  installIntegration('codex', 'audit');
  writeFileSync(path, readFileSync(path, 'utf8').replace('--agent', '--external-agent'));
  uninstallIntegration('codex');
  assert(readFileSync(path, 'utf8').includes('--external-agent'));
});

test('integration preserves existing provider settings without exposing them', t => {
  const s = sandbox(t), path = join(s.codex, 'config.toml');
  const original = 'model="existing"\nmodel_provider="external"\n[model_providers.external]\nbase_url="https://example.com"\nexperimental_bearer_token="private-key"\n';
  writeFileSync(path, original);
  const claude = join(s.claude, 'settings.json');
  const settings = { env: { ANTHROPIC_AUTH_TOKEN: 'private-key', ANTHROPIC_MODEL: 'existing' } };
  writeFileSync(claude, JSON.stringify(settings));
  for (const agent of ['codex', 'claude'] as const) {
    installIntegration(agent, 'strict');
    assert(!('providers' in getConfiguration()));
    assert(!JSON.stringify(getConfiguration()).includes('private-key'));
    uninstallIntegration(agent);
  }
  assert.equal(readFileSync(path, 'utf8'), original);
  assert.deepEqual(JSON.parse(readFileSync(claude, 'utf8')), settings);
});

test('invalid API inputs do not mutate configurations', t => {
  const s = sandbox(t);
  assert.throws(() => installIntegration('other' as any, 'strict'));
  assert.throws(() => previewIntegration('codex', 'other' as any));
  assert.throws(() => toggleSkill('codex', 'false' as any));
  assert.deepEqual(readdirSync(s.codex), []);
  assert.deepEqual(readdirSync(s.claude), []);
  assert.equal(getConfiguration().agents.codex.installed, false);
});

test('previews redact nested and multiline secrets, and malformed configuration errors omit contents', t => {
  const s = sandbox(t);
  writeFileSync(join(s.codex, 'config.toml'), 'experimental_bearer_token = """\nmultiline-private\n"""\n');
  assert(!JSON.stringify(previewIntegration('codex', 'audit')).includes('multiline-private'));
  writeFileSync(join(s.claude, '.claude.json'), JSON.stringify({ credentials: { nested: ['private-nested'] }, mcpServers: {} }));
  assert(!JSON.stringify(previewIntegration('claude', 'audit')).includes('private-nested'));
  writeFileSync(join(s.codex, 'config.toml'), 'api_key = "private-malformed');
  assert.throws(() => getConfiguration(), error => error instanceof Error && !error.message.includes('private-malformed'));
});
