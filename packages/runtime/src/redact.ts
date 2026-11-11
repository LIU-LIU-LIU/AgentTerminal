export function redact(text: string): string {
  let result = text.replace(/\b(?:sk|ghp|github_pat)-?[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*["']?)([^\s"';&]+)/gi, '$1[REDACTED]');
  for (const [name, value] of Object.entries(process.env)) {
    if (/key|token|secret|password/i.test(name) && value && value.length >= 8) result = result.split(value).join('[REDACTED]');
  }
  return result;
}
