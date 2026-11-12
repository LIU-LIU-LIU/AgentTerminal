/** Smooth bursts without changing recorded output. xterm buffers split ANSI sequences. */
export function streamFrame(text: string, elapsed: number): [string, string] {
  let end = Math.min(text.length, Math.max(2, Math.ceil(Math.min(elapsed, 64) * .35), Math.ceil(text.length * Math.min(elapsed, 64) / 140)));
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end++;
  return [text.slice(0, end), text.slice(end)];
}

export const FLOAT_IDLE_MS = 10_000;
