# Third-party components

AgentTerminal orchestration and integration code is maintained in this repository. Research into Tabby and smart-terminal-mcp informed evaluation; their source is not vendored into the application.

| Component | Purpose | Upstream license |
| --- | --- | --- |
| node-pty | PTY / ConPTY | MIT |
| xterm.js, addon-fit | Terminal rendering | MIT |
| Model Context Protocol TypeScript SDK | MCP protocol | MIT |
| better-sqlite3 | SQLite bindings | MIT |
| SQLite | Database engine | Public domain |
| React, React DOM | UI | MIT |
| Tauri | Desktop shell | MIT OR Apache-2.0 |
| lucide-react | Icons | ISC |
| @iarna/toml | TOML parser | ISC |
| Zod | Validation | MIT |
| Node.js | Portable runtime | Node.js license including third-party notices |

This overview does not replace upstream license texts. Transitive packages have their own notices. Retain applicable licenses and notices supplied with node_modules, Node.js and Tauri distributions. Apache-2.0 applies to this project's original code, not a relicensing of dependencies. Versions are recorded in pnpm-lock.yaml and apps/ui/src-tauri/Cargo.lock. Portable packaging includes the project notices and Node.js's full license.
