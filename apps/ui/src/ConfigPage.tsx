import { useEffect, useState, type CSSProperties } from 'react';
import { Check, ChevronRight, Circle, Download, LoaderCircle, X } from 'lucide-react';
import { Api, enabled, type Agent, type Config, type Mode, type Shell } from './api';
import type { Action } from './App';
import { agentName, shellName } from './labels';
import { DEFAULT_PREFS, THEMES, lookVars, resolveLook, savePrefs, useAppearance, useIdeLook, useLook, usePrefs, type Prefs, type TerminalLook } from './themes';

const modes: Record<Mode, [string, string]> = { prefer: ['优先使用', '通过 MCP 和 Skill 引导 Agent 使用统一终端。'], audit: ['审计增强', '增加 Hooks，记录受支持的原生工具调用。'], strict: ['严格接入', '通过受支持的 Hooks 拦截原生命令工具。'] };
const shellIds: Shell[] = ['gitbash', 'pwsh', 'cmd'];

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return <div className="segmented" role="radiogroup" aria-label={label}>{options.map(([id, name]) => <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'chosen' : ''} onClick={() => onChange(id)}>{name}</button>)}</div>;
}

/** A static miniature of a terminal drawn with a look's colours. */
function Swatch({ look, lines = 3 }: { look: TerminalLook; lines?: number }) {
  const c = look.colors;
  return <div className="swatch" style={{ background: c.background, color: c.foreground, fontFamily: look.fontFamily }}>
    <p><span style={{ color: c.green }}>❯</span> pnpm test</p>
    <p><span style={{ color: c.green }}>✓</span> 12 passed <span style={{ color: c.brightBlack }}>1.4s</span></p>
    {lines > 2 && <p><span style={{ color: c.red }}>✗</span> 1 failed <span style={{ color: c.blue }}>api.test.ts</span></p>}
    {lines > 3 && <><p><span style={{ color: c.yellow }}>warn</span> <span style={{ color: c.magenta }}>deprecated</span> <span style={{ color: c.cyan }}>fs.rmdir</span></p><p><span style={{ color: c.green }}>❯</span> <span className="swatch-cursor" data-style={look.cursorStyle} style={{ background: c.cursor, color: c.cursor }}/></p></>}
    <div className="swatch-palette">{(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map(name => <i key={name} style={{ background: c[name] }}/>)}</div>
  </div>;
}

function TerminalAppearance() {
  const prefs = usePrefs();
  const ide = useIdeLook();
  const look = useLook();
  const dark = useAppearance() === 'dark';
  const followed = resolveLook({ ...prefs, theme: 'ide' }, ide, dark);
  const choices: { id: string; name: string; note: string; look: TerminalLook }[] = [
    { id: 'ide', name: '跟随 IDE', note: ide ? `${ide.ide} · ${ide.themeName}` : `未检测到 IDE，使用 ${followed.theme.name}`, look: followed },
    ...THEMES.map(item => ({ id: item.id, name: item.name, note: item.dark ? '深色' : '浅色', look: resolveLook({ ...prefs, theme: item.id }, ide) })),
  ];
  const current = choices.some(choice => choice.id === prefs.theme) ? prefs.theme : 'ide';
  return <section className="look-panel">
    <div className="section-title"><h2>终端外观</h2><span>当前：{look.source}</span></div>
    <div className="panel look-layout">
      <div className="theme-grid" role="radiogroup" aria-label="终端配色方案">{choices.map(choice => <button key={choice.id} role="radio" aria-checked={current === choice.id} className={`theme-tile ${current === choice.id ? 'chosen' : ''}`} onClick={() => savePrefs({ theme: choice.id })}><Swatch look={choice.look} lines={2}/><strong>{choice.name}{current === choice.id && <Check size={13}/>}</strong><small title={choice.note}>{choice.note}</small></button>)}</div>
      <div className="look-side">
        <div className="look-preview" style={{ ...lookVars(look), fontSize: look.fontSize } as CSSProperties}><Swatch look={look} lines={4}/></div>
        <label>字号<Segmented label="终端字号" value={String(prefs.fontSize)} options={[['0', '跟随'], ['12', '12'], ['13', '13'], ['14', '14'], ['15', '15'], ['16', '16']]} onChange={value => savePrefs({ fontSize: Number(value) })}/></label>
        <label>光标<Segmented<Prefs['cursorStyle']> label="光标样式" value={prefs.cursorStyle} options={[['block', '方块'], ['bar', '竖线'], ['underline', '下划线']]} onChange={cursorStyle => savePrefs({ cursorStyle })}/></label>
        <label>字体<input aria-label="终端字体" value={prefs.fontFamily} placeholder={`留空跟随 IDE：${look.fontFamily.split(',')[0].replace(/['"]/g, '')}`} onChange={e => savePrefs({ fontFamily: e.target.value })}/></label>
        <button className="text-button" onClick={() => savePrefs({ theme: DEFAULT_PREFS.theme, fontSize: 0, fontFamily: '', cursorStyle: 'block' })}>恢复默认（跟随 IDE）</button>
      </div>
    </div>
  </section>;
}

function ShellSettings({ config, busy, action }: { config: Config; busy: string; action: Action }) {
  const [shell, setShell] = useState<Shell>(config.shell?.default_shell || 'gitbash');
  const [paths, setPaths] = useState(config.shell?.paths || {});
  if (!config.shell) return <section><div className="section-title"><h2>Runtime 需要更新</h2></div><p className="description">检测到旧版 Runtime。请等待现有任务结束，再停止旧 Runtime 并重开新版应用，以启用 Shell 配置与 Token 统计。</p></section>;
  return <section>
    <div className="section-title"><h2>执行 Shell</h2><span>仅影响新任务；Agent 可通过 MCP 的 shell 参数覆盖，不会自动改写命令语法</span></div>
    <form className="panel form-panel" onSubmit={e => { e.preventDefault(); void action('shell', '/api/config/shell', { default_shell: shell, paths: Object.fromEntries(Object.entries(paths).filter(([, value]) => value?.trim())) }); }}>
      <label>默认 Shell<Segmented label="默认 Shell" value={shell} options={shellIds.map(id => [id, shellName(id)])} onChange={setShell}/></label>
      {shellIds.map(id => { const found = config.shell.detected[id]; return <label key={id}>{shellName(id)} 可执行文件<input aria-label={`${id} 路径`} value={paths[id] || ''} placeholder="留空自动检测（指定时使用绝对路径）" onChange={e => setPaths({ ...paths, [id]: e.target.value })}/><small className={found.available ? 'detected' : 'missing'}>{found.available ? <Check size={11}/> : <X size={11}/>}{found.available ? found.path : found.error}</small></label>; })}
      <button className="button primary" type="submit" disabled={!!busy}>{busy === 'shell' ? '保存中' : '保存 Shell 设置'}</button>
    </form>
  </section>;
}

export function ConfigPage({ api, config, busy, action, report }: { api: Api; config: Config; busy: string; action: Action; report: (e: unknown) => void }) {
  const prefs = usePrefs();
  const [mode, setMode] = useState<Mode>(config.mode || 'prefer');
  const [preview, setPreview] = useState<{ agent: Agent; data: unknown }>();
  const [loading, setLoading] = useState('');
  useEffect(() => setMode(config.mode || 'prefer'), [config.mode]);
  async function showPreview(agent: Agent) { setLoading(agent); try { setPreview({ agent, data: await api.request(`/api/config/preview?agent=${agent}&mode=${mode}`) }); } catch (e) { report(e); } finally { setLoading(''); } }
  return <>
    <section>
      <div className="section-title"><h2>Agent 接入</h2><span>MCP · Hooks · Skill</span></div>
      <div className="agent-grid">{(['codex', 'claude'] as Agent[]).map(agent => { const c = config.agents[agent]; return <div className="panel agent-card" key={agent}>
        <div className="agent-head"><div><h3>{agentName(agent)}</h3><span>{agent === 'codex' ? 'OpenAI' : 'Anthropic'}</span></div><span className={`pill ${c.installed ? 'good' : ''}`}>{c.installed ? '已接入' : '未接入'}</span></div>
        <div className="home-path" title={c.home}>{c.home || '尚未检测到配置目录'}</div>
        <div className="integration-bits">{(['mcp', 'hook', 'skill'] as const).map(key => <span key={key} className={enabled(c[key]) ? 'on' : ''}>{enabled(c[key]) ? <Check size={12} strokeWidth={3}/> : <Circle size={9}/>}{key === 'hook' ? 'Hooks' : key === 'mcp' ? 'MCP 服务' : 'Skill'}</span>)}</div>
        <div className="agent-actions"><button className={`button ${!c.installed ? 'primary' : ''}`} disabled={!!busy} onClick={() => void action(agent, '/api/config/integration', { agent, action: c.installed ? 'uninstall' : 'install', mode })}>{busy === agent ? <LoaderCircle className="spin" size={14}/> : <Download size={14}/>}{c.installed ? '卸载接入' : '一键接入'}</button>{c.installed && <button className="button" disabled={!!busy} onClick={() => void action(agent, '/api/config/integration', { agent, action: 'install', mode })}>应用模式</button>}<button className="text-button" disabled={loading === agent} onClick={() => void showPreview(agent)}>{loading === agent ? '读取中' : '查看配置'}<ChevronRight size={13}/></button></div>
      </div>; })}</div>
    </section>
    <section>
      <div className="section-title"><h2>接入模式</h2><span>选择后，点击一键接入或应用模式生效</span></div>
      <div className="panel mode-grid">{(Object.keys(modes) as Mode[]).map(key => <button className={`mode-option ${mode === key ? 'chosen' : ''}`} key={key} onClick={() => setMode(key)} aria-pressed={mode === key}><span className="radio">{mode === key && <span/>}</span><strong>{modes[key][0]}{key === 'prefer' && <span className="recommended">推荐</span>}</strong><p>{modes[key][1]}</p></button>)}</div>
    </section>
    <TerminalAppearance/>
    <ShellSettings config={config} busy={busy} action={action}/>
    <section>
      <div className="section-title"><h2>Agent Skill</h2><span>为 Agent 安装终端使用说明，帮助它发现并正确使用统一执行工具</span></div>
      <div className="panel rows">{(['codex', 'claude'] as Agent[]).map(agent => <div className="switch-row" key={agent}><div><strong>{agentName(agent)}</strong><small>{enabled(config.agents[agent].skill) ? 'Skill 已启用' : 'Skill 未启用'}</small></div><button className={`toggle ${enabled(config.agents[agent].skill) ? 'checked' : ''}`} role="switch" aria-label={`${agentName(agent)} Skill`} aria-checked={enabled(config.agents[agent].skill)} disabled={!!busy} onClick={() => void action(`skill-${agent}`, '/api/config/skill', { agent, enabled: !enabled(config.agents[agent].skill) })}><span/></button></div>)}</div>
    </section>
    <section>
      <div className="section-title"><h2>界面</h2><span>保存在本机</span></div>
      <div className="panel rows">
        <div className="switch-row"><div><strong>界面主题</strong></div><Segmented<Prefs['appearance']> label="界面主题" value={prefs.appearance} options={[['dark', '深色'], ['light', '浅色'], ['system', '跟随系统']]} onChange={appearance => savePrefs({ appearance })}/></div>
        <div className="switch-row"><div><strong>悬浮窗</strong><small>在屏幕角落显示正在执行的命令与输出，拖到屏幕边缘自动收起，双击回到监控。</small></div><button className={`toggle ${prefs.float ? 'checked' : ''}`} role="switch" aria-label="悬浮窗" aria-checked={prefs.float} onClick={() => savePrefs({ float: !prefs.float })}><span/></button></div>
      </div>
    </section>
    {preview && <div className="modal-backdrop" onClick={() => setPreview(undefined)}><section className="modal" role="dialog" aria-modal="true" aria-label="配置预览" onClick={e => e.stopPropagation()}><div className="section-title"><h2>{agentName(preview.agent)} · 配置预览</h2><button className="icon-button" aria-label="关闭配置预览" autoFocus onClick={() => setPreview(undefined)}><X size={16}/></button></div><pre>{typeof preview.data === 'string' ? preview.data : JSON.stringify(preview.data, null, 2)}</pre><button className="button" onClick={() => setPreview(undefined)}>关闭</button></section></div>}
  </>;
}
