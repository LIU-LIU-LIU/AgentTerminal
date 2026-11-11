import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
const t=new StdioClientTransport({command:"node",args:["src/index.js"],env:{...process.env,SMART_TERMINAL_SHELL:"C:\\Program Files\\Git\\bin\\bash.exe"}});
const c=new Client({name:"t",version:"1"});await c.connect(t);
const tools=await c.listTools();console.log(tools.tools.map(x=>x.name).join(","));
const r=await c.callTool({name:"terminal_run",arguments:{cmd:"C:\\Program Files\\Git\\bin\\bash.exe",args:["-lc","echo hi; uname -s; for i in 1 2 3; do echo tick$i; sleep 1; done; exit 3"]}});
console.log(JSON.stringify(r).slice(0,900));
await c.close();
