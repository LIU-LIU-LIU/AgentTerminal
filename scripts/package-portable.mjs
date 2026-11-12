import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const target=process.env.CARGO_TARGET_DIR ? path.resolve(root,'apps/ui/src-tauri',process.env.CARGO_TARGET_DIR) : path.join(root,'apps/ui/src-tauri/target');
const executable=path.join(target,'release/agentterminal-ui.exe');
if(process.platform!=='win32') throw new Error('Portable packaging currently supports Windows x64 only.');
const alternative=path.join(target,'release/agentterminal-desktop.exe');
const desktop=existsSync(executable)?executable:alternative;
if(!existsSync(desktop)) throw new Error('Build desktop first: pnpm --dir apps/ui tauri build --no-bundle');
const destination=path.join(root,'artifacts',`AgentTerminal-${Date.now()}-win-x64`);
const runtime=path.join(destination,'runtime');
mkdirSync(runtime,{recursive:true});
cpSync(desktop,path.join(destination,'AgentTerminal.exe'));
for(const file of ['LICENSE','NOTICE','THIRD_PARTY_NOTICES.md']) cpSync(path.join(root,file),path.join(destination,file));
const uiLicenses=path.join(destination,'third-party-licenses');
mkdirSync(uiLicenses);
for(const [name,file] of [['react','LICENSE'],['react-dom','LICENSE'],['@xterm/xterm','LICENSE'],['@xterm/addon-fit','LICENSE'],['lucide-react','LICENSE'],['@tauri-apps/api','LICENSE-MIT'],['@tauri-apps/api','LICENSE-APACHE-2.0']]) {
  cpSync(path.join(root,'apps/ui/node_modules',name,file),path.join(uiLicenses,name.replaceAll('/','-')+'-'+file));
}
const nodeLicense=await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`);
if(!nodeLicense.ok) throw new Error('Could not obtain Node.js distribution license');
writeFileSync(path.join(destination,'NODE_LICENSE'),await nodeLicense.text());
cpSync(process.execPath,path.join(runtime,'node.exe'));
cpSync(path.join(root,'dist'),path.join(runtime,'dist'),{recursive:true});
cpSync(path.join(root,'apps/ui/dist'),path.join(runtime,'apps/ui/dist'),{recursive:true});
const manifest=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const dependencies=Object.fromEntries(Object.keys(manifest.dependencies).map(name=>[name,JSON.parse(readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version]));
writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'agentterminal-runtime',version:manifest.version,type:'module',private:true,dependencies},null,2));
const npmCli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
execFileSync(process.execPath,[npmCli,'install','--omit=dev','--no-audit','--no-fund'],{cwd:runtime,stdio:'inherit',windowsHide:true});
writeFileSync(path.join(destination,'README.txt'),'AgentTerminal Windows portable\r\nLaunch AgentTerminal.exe. One window contains monitoring and configuration tabs.\r\nGit for Windows must be installed. Runtime keeps running after closing the window.\r\nConfiguration integrations reference this folder: keep it in a stable location.\r\nBefore moving or deleting it, uninstall integrations in the configuration UI.\r\nShell defaults and paths are in Configuration. Terminal token counts are text estimates, not model billing usage.\r\nSee LICENSE, NOTICE, THIRD_PARTY_NOTICES.md and NODE_LICENSE.\r\n');
console.log('Portable application:',destination);
