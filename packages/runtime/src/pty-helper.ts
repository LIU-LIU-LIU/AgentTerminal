import { chmodSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export function preparePtyHelper() {
  if (process.platform !== 'darwin') return undefined;
  const native = require('node-pty/lib/utils.js').loadNativeModule('pty') as { dir: string };
  const helper = path.resolve(path.dirname(require.resolve('node-pty/lib/unixTerminal.js')), native.dir, 'spawn-helper');
  const mode = statSync(helper).mode;
  if ((mode & 0o111) !== 0o111) {
    try { chmodSync(helper, mode | 0o111); }
    catch (error) { throw new Error(`Cannot enable node-pty spawn-helper execution at ${helper}: ${(error as Error).message}`); }
  }
  return helper;
}
