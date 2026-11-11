import { handleHook, parseArguments } from './index.js';

async function main(): Promise<void> {
  let input = '';
  try {
    const options = parseArguments(process.argv.slice(2));
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) input += chunk;
    const event = JSON.parse(input);
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event');
    process.stdout.write(JSON.stringify(await handleHook(event, options)) + '\n');
  } catch {
    process.stderr.write('AgentTerminal: invalid hook input or arguments; allowing tool execution.\n');
    process.stdout.write('{}\n');
  }
}

await main();
