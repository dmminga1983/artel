// Artel secret rules — shared by the guard hook and the scan-secrets CLI.
// Pure JavaScript, no dependencies, Node.js 18+.

/**
 * High-confidence patterns. A match blocks a commit/push.
 * Keep patterns specific: false positives teach people to switch the guard off.
 */
export const RULES = [
  { id: 'aws-access-key', name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { id: 'github-pat', name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
  { id: 'anthropic-key', name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  // Real keys mix letters and digits; plain words such as `sk-learn-…` do not match.
  {
    id: 'openai-key',
    name: 'OpenAI-style API key',
    re: /\bsk-(?!ant-)(?:proj-|svcacct-)?(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9_-]{32,}/g,
  },
  { id: 'slack-token', name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'google-api-key', name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'stripe-live-key', name: 'Stripe live key', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}/g },
  { id: 'telegram-bot-token', name: 'Telegram bot token', re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { id: 'yandex-api-key', name: 'Yandex Cloud API key', re: /\bAQVN[A-Za-z0-9_-]{35,}/g },
  { id: 'yandex-oauth', name: 'Yandex OAuth token', re: /\by0_[A-Za-z0-9_-]{50,}/g },
  {
    id: 'private-key',
    name: 'Private key',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
];

/**
 * Medium-confidence patterns. A match asks for confirmation instead of blocking.
 * `group` is the index of the captured value to check against placeholders.
 */
export const GENERIC_RULES = [
  {
    id: 'generic-secret-assignment',
    name: 'Hard-coded secret value',
    re: /\b([A-Za-z0-9_]*(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|bot[_-]?token)[A-Za-z0-9_]*)\s*[:=]\s*["']([^"'\s]{12,})["']/gi,
    group: 2,
    label: 1,
  },
  {
    // Unquoted env/YAML style: DB_PASSWORD=..., POSTGRES_PASSWORD: ...
    id: 'env-style-secret',
    name: 'Secret in config',
    re: /^\s*(?:export\s+|-\s+)?([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|API_KEY|TOKEN|PRIVATE_KEY)[A-Z0-9_]*)\s*[:=]\s*([^\s"'#]{12,})\s*$/g,
    group: 2,
    label: 1,
  },
  {
    id: 'url-credentials',
    name: 'Password inside a URL',
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/'"]+:([^\s@/'"]{6,})@[^\s'"]+/gi,
    group: 1,
  },
  {
    id: 'jwt',
    name: 'JSON Web Token',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    group: 0,
  },
];

const PLACEHOLDER_HINTS = [
  'your_', 'your-', 'yourtoken', 'yourkey', 'yourpassword', 'yoursecret', 'example', 'changeme', 'change_me', 'placeholder', 'dummy', 'sample', 'xxxx',
  'todo', 'replace', 'insert', '<', '${', 'process.env', 'os.environ', 'getenv', '****', 'redacted',
  'ваш', 'пример', 'заменить',
];

const ALLOW_MARKER = 'artel:allow';

const SAFE_ENV_SUFFIXES = new Set(['example', 'sample', 'template', 'dist', 'defaults']);

/** Returns a reason string if the path looks like a file that must never be committed. */
export function sensitiveFileReason(path) {
  const base = path.replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (base === '.env') return '.env file with real secrets';
  if (base.startsWith('.env.')) {
    const suffix = base.slice(5);
    if (!SAFE_ENV_SUFFIXES.has(suffix)) return `${base} file (environment secrets)`;
    return null;
  }
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(base)) return 'private key or certificate store';
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return 'SSH private key';
  if (base === '.pypirc' || base === '.netrc') return 'credentials file';
  return null;
}

/** Masks a secret so it can be shown without leaking it again. */
export function mask(value) {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}…(${value.length} chars)`;
}

function looksLikePlaceholder(value) {
  const v = value.toLowerCase();
  if (PLACEHOLDER_HINTS.some((h) => v.includes(h))) return true;
  if (/^(.)\1+$/.test(v)) return true; // aaaaaaaaaaaa
  return false;
}

/**
 * Scans one line of text. Returns findings: { rule, name, severity, match }.
 * severity: "high" blocks, "medium" asks.
 */
export function scanLine(line) {
  if (line.includes(ALLOW_MARKER)) return [];
  const findings = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(line)) !== null) {
      findings.push({ rule: rule.id, name: rule.name, severity: 'high', match: m[0] });
    }
  }
  if (findings.length === 0) {
    for (const rule of GENERIC_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        const value = m[rule.group];
        if (looksLikePlaceholder(value)) continue;
        const name = rule.label ? `${rule.name} (${m[rule.label]})` : rule.name;
        findings.push({ rule: rule.id, name, severity: 'medium', match: value });
      }
    }
  }
  return findings;
}

/** Scans whole text, tagging findings with a source label and 1-based line number. */
export function scanText(text, source) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const f of scanLine(lines[i])) out.push({ ...f, source, line: i + 1 });
  }
  return out;
}

/**
 * Scans `git diff` / `git log -p` output, looking only at added lines.
 * Recognises "commit <sha>" headers and "+++ b/<path>" file headers.
 * Returns { findings, files } where files are added/modified paths seen in the patch.
 */
export function scanPatch(patch) {
  const findings = [];
  const files = new Set();
  let commit = null;
  let file = null;
  let newLine = 0;
  let prev = '';
  for (const raw of patch.split(/\r?\n/)) {
    const isFileHeader = raw.startsWith('+++ ') && prev.startsWith('--- ');
    prev = raw;
    if (raw.startsWith('commit ') && /^commit [0-9a-f]{7,40}\b/.test(raw)) {
      commit = raw.slice(7, 19);
      continue;
    }
    if (isFileHeader) {
      const p = raw.slice(4).trim();
      file = p === '/dev/null' ? null : p.replace(/^b\//, '');
      if (file) files.add(file);
      continue;
    }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw);
      newLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (raw.startsWith('+') && file) {
      const where = commit ? `${commit}:${file}:${newLine}` : `${file}:${newLine}`;
      for (const f of scanLine(raw.slice(1))) findings.push({ ...f, source: where, line: newLine });
      newLine++;
      continue;
    }
    if (raw.startsWith(' ')) newLine++;
  }
  return { findings, files: [...files] };
}

/** Formats findings as human-readable lines with masked values. */
export function formatFindings(findings) {
  return findings.map((f) => `  - [${f.severity}] ${f.name}: ${mask(f.match)} at ${f.source}`);
}
