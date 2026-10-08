// Tests for the Artel guard hook and secret rules. Run: node --test tests/
// Fake secrets are assembled at runtime so this file itself never contains
// a string that a secret scanner (or GitHub push protection) would flag.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLine, sensitiveFileReason, scanPatch, mask } from '../plugins/artel/hooks/scripts/secret-rules.mjs';
import { parseGit, segments } from '../plugins/artel/hooks/scripts/guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GUARD = join(here, '..', 'plugins', 'artel', 'hooks', 'scripts', 'guard.mjs');
const SCAN = join(here, '..', 'plugins', 'artel', 'hooks', 'scripts', 'scan-secrets.mjs');

const fake = {
  aws: 'AK' + 'IA' + 'Q'.repeat(16),
  github: 'gh' + 'p_' + 'a1B2'.repeat(9),
  telegram: '1234567' + '89:' + 'AAHk3' + 'x'.repeat(30),
  anthropic: 'sk-' + 'ant-' + 'api03-' + 'Z'.repeat(40),
  privateKey: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  yandex: 'AQ' + 'VN' + 'b'.repeat(37),
};

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'artel-guard-'));
  const g = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 'Test');
  g('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'README.md'), '# test\n');
  g('add', 'README.md');
  g('commit', '-q', '-m', 'init');
  return { dir, g, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function runGuard(command, cwd, env = {}) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });
  const r = spawnSync(process.execPath, [GUARD], { input, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ---------- rules ----------

test('detects high-confidence secrets', () => {
  for (const [kind, value] of Object.entries(fake)) {
    const found = scanLine(`const x = "${value}"`);
    assert.ok(found.some((f) => f.severity === 'high'), `should detect ${kind}`);
  }
});

test('ignores placeholders and env lookups', () => {
  assert.deepEqual(scanLine('TELEGRAM_BOT_TOKEN=your_token_here'), []);
  assert.deepEqual(scanLine('api_key = "YOUR_API_KEY_GOES_HERE"'), []);
  assert.deepEqual(scanLine('token = os.environ["BOT_TOKEN"]'), []);
  assert.deepEqual(scanLine('password: "${DB_PASSWORD}"'), []);
});

test('flags hard-coded generic secrets as medium', () => {
  const found = scanLine('db_password = "q7Lm2Vx9Rt4Zp1"');  // artel:allow
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'medium');
});

test('artel:allow suppresses a line', () => {
  assert.deepEqual(scanLine(`"${fake.aws}" // artel:allow test fixture`), []);
});

test('sensitive file names', () => {
  assert.ok(sensitiveFileReason('.env'));
  assert.ok(sensitiveFileReason('config/.env.production'));
  assert.ok(sensitiveFileReason('keys/server.pem'));
  assert.ok(sensitiveFileReason('id_ed25519'));
  assert.equal(sensitiveFileReason('.env.example'), null);
  assert.equal(sensitiveFileReason('id_ed25519.pub'), null);
  assert.equal(sensitiveFileReason('src/environment.ts'), null);
});

test('patch scanning only looks at added lines and tracks files', () => {
  const patch = [
    'commit 0123456789abcdef0123456789abcdef01234567',
    'diff --git a/a.txt b/a.txt',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1 +1 @@',
    `-${fake.aws}`,
    '+clean line',
  ].join('\n');
  const { findings, files } = scanPatch(patch);
  assert.deepEqual(findings, []);
  assert.deepEqual(files, ['a.txt']);
});

test('mask never reveals the full value', () => {
  assert.ok(!mask(fake.github).includes(fake.github.slice(4)));
});

test('command parsing', () => {
  assert.deepEqual(segments('git add . && git commit -m x'), ['git add .', 'git commit -m x']);
  assert.equal(parseGit('git -C sub push origin main').sub, 'push');
  assert.equal(parseGit('git -C sub push origin main').dir, 'sub');
  assert.equal(parseGit('FOO=1 git commit -am "msg"').sub, 'commit');
  assert.equal(parseGit('echo git commit'), null);
});

// ---------- hook end to end ----------

test('blocks committing a staged .env file', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, '.env'), 'X=1\n');
    r.g('add', '.env');
    const res = runGuard('git commit -m "add env"', r.dir);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /\.env/);
  } finally {
    r.cleanup();
  }
});

test('blocks `git add -A && git commit` with a token in a new file', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'bot.py'), `TOKEN = "${fake.telegram}"\n`);
    const res = runGuard('git add -A && git commit -m bot', r.dir);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /Telegram bot token/);
    assert.ok(!res.stderr.includes(fake.telegram), 'secret must be masked in output');
  } finally {
    r.cleanup();
  }
});

test('blocks `git add .env` even when .env is gitignored and forced', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, '.gitignore'), '.env\n');
    writeFileSync(join(r.dir, '.env'), 'X=1\n');
    const res = runGuard('git add -f .env && git commit -m oops', r.dir);
    assert.equal(res.code, 2);
  } finally {
    r.cleanup();
  }
});

test('blocks pushing a commit that contains a secret', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'config.js'), `export const key = "${fake.github}";\n`);
    r.g('add', 'config.js');
    r.g('commit', '-q', '-m', 'config');
    writeFileSync(join(r.dir, 'config.js'), 'export const key = process.env.KEY;\n');
    r.g('commit', '-q', '-am', 'remove key');
    // The key is gone from the files but still in history: push must be blocked.
    const res = runGuard('git push -u origin main', r.dir);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /GitHub token/);
  } finally {
    r.cleanup();
  }
});

test('allows clean commits and unrelated commands', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'app.py'), 'print("hello")\n');
    writeFileSync(join(r.dir, '.env.example'), 'TELEGRAM_BOT_TOKEN=your_token_here\n');
    assert.equal(runGuard('git add -A && git commit -m clean', r.dir).code, 0);
    assert.equal(runGuard('git status', r.dir).code, 0);
    assert.equal(runGuard('ls -la', r.dir).code, 0);
  } finally {
    r.cleanup();
  }
});

test('asks before a force-push to main', () => {
  const r = repo();
  try {
    const res = runGuard('git push --force origin main', r.dir);
    assert.equal(res.code, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  } finally {
    r.cleanup();
  }
});

test('asks (not blocks) on a medium-confidence secret', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, 'db.py'), 'db_password = "q7Lm2Vx9Rt4Zp1"\n');  // artel:allow
    r.g('add', 'db.py');
    const res = runGuard('git commit -m db', r.dir);
    assert.equal(res.code, 0);
    assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'ask');
  } finally {
    r.cleanup();
  }
});

test('ARTEL_GUARD=off disables the guard', () => {
  const r = repo();
  try {
    writeFileSync(join(r.dir, '.env'), 'X=1\n');
    r.g('add', '.env');
    assert.equal(runGuard('git commit -m env', r.dir, { ARTEL_GUARD: 'off' }).code, 0);
  } finally {
    r.cleanup();
  }
});

test('fails open outside a git repository and on bad input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'artel-nogit-'));
  try {
    assert.equal(runGuard('git commit -m x', dir).code, 0);
    const r = spawnSync(process.execPath, [GUARD], { input: 'not json', encoding: 'utf8' });
    assert.equal(r.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- bypasses found in review ----------

test('no false block on ordinary sk- words', () => {
  assert.deepEqual(scanLine('import "sk-learn-preprocessing-pipeline-utils-module"'), []);
});

test('medium rules: env-style config, URL credentials', () => {
  assert.equal(scanLine('DB_PASSWORD=q7Lm2Vx9Rt4Zp1aa')[0]?.severity, 'medium'); // artel:allow
  assert.equal(scanLine('url = "postgres://admin:S3cretPass99@db.local/app"')[0]?.severity, 'medium'); // artel:allow
  assert.deepEqual(scanLine('POSTGRES_PASSWORD: your_password_here'), []);
});

function withSecretRepo(fn) {
  const r = repo();
  try {
    mkdirSync(join(r.dir, 'sub'));
    return fn(r);
  } finally {
    r.cleanup();
  }
}

test('follows `cd <repo> &&` before git commit', () => {
  withSecretRepo((r) => {
    writeFileSync(join(r.dir, 'k.js'), `k = "${fake.aws}"\n`);
    r.g('add', 'k.js');
    const outside = mkdtempSync(join(tmpdir(), 'artel-out-'));
    try {
      assert.equal(runGuard(`cd "${r.dir}" && git commit -m k`, outside).code, 2);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('quoted ; or && inside a commit message does not hide -a', () => {
  withSecretRepo((r) => {
    writeFileSync(join(r.dir, 'README.md'), `# test\n${fake.github}\n`);
    assert.equal(runGuard('git commit -m "fix; cleanup && more" -a', r.dir).code, 2);
  });
});

test('pathspec commit scans the working-tree file', () => {
  withSecretRepo((r) => {
    writeFileSync(join(r.dir, 'README.md'), `# test\n${fake.github}\n`);
    assert.equal(runGuard('git commit -m x README.md', r.dir).code, 2);
  });
});

test('wrappers: bash -c, env, subshell', () => {
  withSecretRepo((r) => {
    writeFileSync(join(r.dir, '.env'), 'X=1\n');
    r.g('add', '-f', '.env');
    assert.equal(runGuard(`bash -c "git commit -m x"`, r.dir).code, 2);
    assert.equal(runGuard('env GIT_TRACE=0 git commit -m x', r.dir).code, 2);
    assert.equal(runGuard('(git commit -m x)', r.dir).code, 2);
  });
});

test('git alias for commit is resolved', () => {
  withSecretRepo((r) => {
    r.g('config', 'alias.ci', 'commit');
    writeFileSync(join(r.dir, '.env'), 'X=1\n');
    r.g('add', '-f', '.env');
    assert.equal(runGuard('git ci -m x', r.dir).code, 2);
  });
});

test('pushing another branch or a tag scans that ref', () => {
  withSecretRepo((r) => {
    r.g('checkout', '-q', '-b', 'feat');
    writeFileSync(join(r.dir, 'k.js'), `k = "${fake.aws}"\n`);
    r.g('add', 'k.js');
    r.g('commit', '-q', '-m', 'k');
    r.g('tag', 'v1');
    r.g('checkout', '-q', 'main');
    assert.equal(runGuard('git push origin feat', r.dir).code, 2);
    assert.equal(runGuard('git push origin v1', r.dir).code, 2);
  });
});

test('gh repo create --push is treated as a push', () => {
  withSecretRepo((r) => {
    writeFileSync(join(r.dir, 'k.js'), `k = "${fake.aws}"\n`);
    r.g('add', 'k.js');
    r.g('commit', '-q', '-m', 'k');
    assert.equal(runGuard('gh repo create me/x --public --source=. --push', r.dir).code, 2);
  });
});

test('redirections are not mistaken for paths', () => {
  withSecretRepo((r) => {
    writeFileSync(join(r.dir, 'ok.txt'), 'fine\n');
    r.g('add', 'ok.txt');
    assert.equal(runGuard('git commit -m ok > /dev/null 2>&1', r.dir).code, 0);
  });
});

// ---------- scanner CLI ----------

test('scan-secrets finds secrets in history after they were deleted', () => {
  const r = repo();
  try {
    mkdirSync(join(r.dir, 'src'));
    writeFileSync(join(r.dir, 'src', 'k.txt'), `${fake.anthropic}\n`);
    r.g('add', '.');
    r.g('commit', '-q', '-m', 'k');
    r.g('rm', '-q', 'src/k.txt');
    r.g('commit', '-q', '-m', 'rm');
    const clean = spawnSync(process.execPath, [SCAN, r.dir], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stdout);
    const hist = spawnSync(process.execPath, [SCAN, '--history', r.dir], { encoding: 'utf8' });
    assert.equal(hist.status, 1, hist.stdout);
    assert.match(hist.stdout, /Anthropic API key/);
  } finally {
    r.cleanup();
  }
});
