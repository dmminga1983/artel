#!/usr/bin/env node
// Artel guard — a Claude Code PreToolUse hook for the Bash/PowerShell tools.
//
// Before a `git commit`, `git push` or `gh repo create --push` runs, it scans
// what is about to be committed or pushed and:
//   * blocks (exit 2) when it finds a high-confidence secret or a sensitive
//     file such as `.env` or a private key;
//   * asks the user (permissionDecision "ask") on a medium-confidence match,
//     a force-push to main/master, or a change too large to scan.
// It never sends data anywhere, never modifies the repository, and fails open
// (does nothing) if git is unavailable or the input is not what it expects.
//
// Disable: start Claude Code with the environment variable ARTEL_GUARD=off.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatFindings, scanPatch, scanText, sensitiveFileReason } from './secret-rules.mjs';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILE = 1024 * 1024;
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'exec', 'nohup', 'time', 'env', 'xargs']);
const SHELLS = /^(?:.*[\\/])?(?:bash|sh|zsh|dash|pwsh|powershell)(?:\.exe)?$/i;
const GIT = /^(?:.*[\\/])?git(?:\.exe)?$/i;
const GH = /^(?:.*[\\/])?gh(?:\.exe)?$/i;
// git commit options that take a separate value.
const COMMIT_VALUE_OPTS = new Set(['-m', '-F', '-C', '-c', '-t', '--author', '--date', '--template', '--file', '--message', '--fixup', '--squash', '--cleanup', '--trailer', '--reuse-message', '--reedit-message']);
const PUSH_VALUE_OPTS = new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option']);

class Overflow extends Error {}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function tryGit(cwd, args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_BYTES, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    if (e && (e.code === 'ENOBUFS' || /maxBuffer/i.test(String(e.message)))) throw new Overflow();
    return fallback;
  }
}

/**
 * Splits a command line into simple commands (arrays of words), honouring
 * single/double quotes and backslash escapes, and separating on unquoted
 * `&&`, `||`, `;`, `|`, `&`, newlines and parentheses/braces.
 */
export function tokenize(command, { powershell = false } = {}) {
  const cmds = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const pushWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const pushCmd = () => {
    pushWord();
    if (words.length) cmds.push(words);
    words = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      // In bash double quotes a backslash only escapes $ ` " \ — so C:\Users stays intact.
      else if (!powershell && c === '\\' && quote === '"' && '$`"\\'.includes(command[i + 1] || '')) word += command[++i];
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      inWord = true;
    } else if (!powershell && c === '\\' && i + 1 < command.length && command[i + 1] !== '\n') {
      word += command[++i];
      inWord = true;
    } else if (/\s/.test(c) && c !== '\n') {
      pushWord();
    } else if (c === '\n' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '{' || c === '}') {
      pushCmd();
    } else {
      word += c;
      inWord = true;
    }
  }
  pushCmd();
  return cmds;
}

/** Kept for backwards compatibility with simple callers and tests. */
export function segments(command) {
  return tokenize(command).map((w) => w.join(' '));
}

/**
 * Normalises one simple command: strips env assignments and wrappers,
 * expands `bash -c "..."`. Returns a list of word arrays (more than one when
 * a shell -c string contains several commands).
 */
function stripRedirections(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d*(?:>>?|<<?|>&|<&)$/.test(w)) i++; // `> file`: drop operator and target
    else if (/^\d*(?:>>?|<<?)\S/.test(w) || /^\d*>&\d$/.test(w) || /^\d*>$/.test(w)) continue; // `>file`, `2>`
    else out.push(w);
  }
  return out;
}

function unwrap(words, depth = 0) {
  words = stripRedirections(words);
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++;
    else if (WRAPPERS.has(w)) {
      i++;
      while (i < words.length && words[i].startsWith('-')) i++; // wrapper flags, e.g. `env -i`
    } else break;
  }
  const rest = words.slice(i);
  if (rest.length && SHELLS.test(rest[0]) && depth < 3) {
    const ci = rest.findIndex((w, k) => k > 0 && /^-[a-z]*c$/i.test(w) || /^-Command$/i.test(w));
    if (ci > 0 && rest[ci + 1]) return tokenize(rest[ci + 1]).flatMap((cmd) => unwrap(cmd, depth + 1));
  }
  return [rest];
}

/**
 * Parses a git invocation. Returns null if `words` is not git, else
 * { sub, args, dir } where dir comes from -C / --work-tree.
 */
export function parseGit(words) {
  if (typeof words === 'string') words = tokenize(words)[0] || [];
  const [cmd] = unwrap(words);
  if (!cmd || !GIT.test(cmd[0] || '')) return null;
  let i = 1;
  let dir = null;
  while (i < cmd.length && cmd[i].startsWith('-')) {
    const a = cmd[i];
    if (a === '-C' && cmd[i + 1]) {
      dir = dir ? resolve(dir, cmd[i + 1]) : cmd[i + 1];
      i += 2;
    } else if (a === '-c' && cmd[i + 1]) i += 2;
    else if (a.startsWith('--work-tree=')) {
      dir = a.slice('--work-tree='.length);
      i++;
    } else if (a === '--work-tree' || a === '--git-dir' || a === '--namespace') {
      if (a === '--work-tree') dir = cmd[i + 1];
      i += 2;
    } else i++;
  }
  if (i >= cmd.length) return null;
  return { sub: cmd[i], args: cmd.slice(i + 1), dir };
}

function resolveAlias(cwd, sub) {
  if (sub === 'commit' || sub === 'push' || sub === 'add') return { sub, extra: [] };
  const alias = tryGit(cwd, ['config', '--get', `alias.${sub}`]).trim();
  if (!alias || alias.startsWith('!')) return { sub, extra: [] };
  const words = tokenize(alias)[0] || [];
  return { sub: words[0] || sub, extra: words.slice(1) };
}

function scanFileContent(cwd, name, findings) {
  try {
    const p = resolve(cwd, name);
    const st = statSync(p);
    if (!st.isFile() || st.size > MAX_FILE) return;
    const text = readFileSync(p, 'utf8');
    if (text.includes('\u0000')) return; // binary
    findings.push(...scanText(text, name));
  } catch {
    /* missing or unreadable */
  }
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

/** Positional (path) arguments of `git commit`, skipping option values. */
function commitPaths(args) {
  const out = [];
  let afterDashDash = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (afterDashDash) out.push(a);
    else if (a === '--') afterDashDash = true;
    else if (COMMIT_VALUE_OPTS.has(a)) i++;
    else if (/^-[a-zA-Z]*[mFCct]$/.test(a) && !a.startsWith('--')) i++; // e.g. -am "msg"
    else if (!a.startsWith('-')) out.push(a);
  }
  return out;
}

function collectForCommit(cwd, { includeUnstaged, includeUntracked, paths }) {
  let patch = tryGit(cwd, ['diff', '--cached', '--no-color', '--no-ext-diff', '-U0']);
  if (includeUnstaged) patch += '\n' + tryGit(cwd, ['diff', '--no-color', '--no-ext-diff', '-U0']);
  const { findings, files } = scanPatch(patch);
  const names = new Set(files);
  for (const n of lines(tryGit(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']))) names.add(n);
  if (includeUnstaged) for (const n of lines(tryGit(cwd, ['diff', '--name-only', '--diff-filter=ACMR']))) names.add(n);
  if (includeUntracked || paths.length) {
    const filter = includeUntracked ? [] : ['--', ...paths];
    for (const n of lines(tryGit(cwd, ['ls-files', '--others', '--exclude-standard', ...filter]))) {
      names.add(n);
      scanFileContent(cwd, n, findings);
    }
  }
  // Explicit paths (also catches `git add -f .env`, which ls-files hides as ignored).
  for (const n of paths) {
    if (/[*?[]/.test(n)) continue;
    try {
      if (statSync(resolve(cwd, n)).isFile()) {
        if (!names.has(n)) scanFileContent(cwd, n, findings);
        names.add(n);
      }
    } catch {
      /* not a file */
    }
  }
  return { findings, names: [...names] };
}

/** The commit range a push would send, from its refspecs. */
function pushRange(cwd, args) {
  if (args.includes('--all') || args.includes('--mirror') || args.includes('--branches')) return ['--branches', '--not', '--remotes'];
  if (args.includes('--tags')) return ['--tags', 'HEAD', '--not', '--remotes'];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (PUSH_VALUE_OPTS.has(args[i])) i++;
    else if (!args[i].startsWith('-')) positional.push(args[i]);
  }
  const refs = positional
    .slice(1) // first positional is the remote
    .map((r) => r.replace(/^\+/, '').split(':')[0])
    .filter((r) => r && tryGit(cwd, ['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).trim());
  return [...(refs.length ? refs : ['HEAD']), '--not', '--remotes'];
}

function collectForPush(cwd, args) {
  const range = pushRange(cwd, args);
  const patch = tryGit(cwd, ['log', '-p', '--no-color', '--no-ext-diff', '-U0', '--format=commit %H', ...range]);
  const { findings, files } = scanPatch(patch);
  const names = new Set(files);
  for (const n of lines(tryGit(cwd, ['log', '--name-only', '--diff-filter=ACMR', '--format=', ...range]))) names.add(n);
  return { findings, names: [...names] };
}

function isForcePushToProtected(cwd, args) {
  const forced = args.some((a) => a === '-f' || a === '--force' || a.startsWith('--force-with-lease') || /^\+/.test(a));
  if (!forced) return false;
  const protectedRe = /(^|[:/+])(main|master)$/;
  const positional = args.filter((a) => !a.startsWith('-'));
  if (positional.some((a) => protectedRe.test(a))) return true;
  if (positional.length <= 1) {
    const branch = tryGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    return branch === 'main' || branch === 'master';
  }
  return false;
}

function deny(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
    }) + '\n',
  );
  process.exit(0);
}

/** Walks the command in order, tracking `cd`, and returns the git actions to check. */
export function plan(command, baseCwd, { powershell = false } = {}) {
  let cwd = baseCwd;
  const stack = [];
  const actions = [];
  let pendingAdds = [];
  for (const raw of tokenize(command, { powershell })) {
    for (const words of unwrap(raw)) {
      if (!words.length) continue;
      const head = words[0];
      if (head === 'cd' || head === 'Set-Location' || head === 'sl' || head === 'chdir') {
        const target = words.find((w, k) => k > 0 && !w.startsWith('-'));
        cwd = target ? resolve(cwd, target.replace(/^~(?=$|[\\/])/, homedir())) : homedir();
        continue;
      }
      if (head === 'pushd' || head === 'Push-Location') {
        stack.push(cwd);
        const target = words[1];
        if (target) cwd = resolve(cwd, target.replace(/^~(?=$|[\\/])/, homedir()));
        continue;
      }
      if (head === 'popd' || head === 'Pop-Location') {
        cwd = stack.pop() || cwd;
        continue;
      }
      if (GH.test(head) && words[1] === 'repo' && words[2] === 'create' && words.includes('--push')) {
        let src = words.find((w) => w.startsWith('--source='))?.slice(9);
        const si = words.findIndex((w) => w === '--source' || w === '-s');
        if (!src && si > 0) src = words[si + 1];
        actions.push({ kind: 'push', cwd: src ? resolve(cwd, src) : cwd, args: [] });
        continue;
      }
      const g = parseGit(words);
      if (!g) continue;
      const gcwd = g.dir ? resolve(cwd, g.dir) : cwd;
      const { sub, extra } = resolveAlias(gcwd, g.sub);
      const args = [...extra, ...g.args];
      if (sub === 'add') {
        pendingAdds.push({ cwd: gcwd, args });
      } else if (sub === 'commit') {
        actions.push({ kind: 'commit', cwd: gcwd, args, adds: pendingAdds });
        pendingAdds = [];
      } else if (sub === 'push') {
        actions.push({ kind: 'push', cwd: gcwd, args });
      }
    }
  }
  return actions;
}

export function main() {
  if ((process.env.ARTEL_GUARD || '').toLowerCase() === 'off') return;
  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    return;
  }
  const command = input?.tool_input?.command;
  if (typeof command !== 'string' || !/\b(git|gh)\b/.test(command)) return;
  const baseCwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();

  const high = [];
  const medium = [];
  const badFiles = new Map();
  const notes = [];

  for (const action of plan(command, baseCwd, { powershell: input.tool_name === 'PowerShell' })) {
    const { cwd } = action;
    if (!tryGit(cwd, ['rev-parse', '--is-inside-work-tree']).trim()) continue;
    let result;
    try {
      if (action.kind === 'commit') {
        const addArgs = action.adds.flatMap((a) => a.args);
        const addAll = addArgs.some((a) => a === '.' || a === '-A' || a === '--all' || a === ':/' || a === '*');
        const addPaths = addArgs.filter((a) => !a.startsWith('-') && a !== '.' && a !== ':/');
        const commitAll = action.args.some((a) => a === '-a' || a === '--all' || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(a));
        const paths = [...addPaths, ...commitPaths(action.args)];
        result = collectForCommit(cwd, {
          includeUnstaged: action.adds.length > 0 || commitAll || paths.length > 0,
          includeUntracked: addAll,
          paths,
        });
      } else {
        result = collectForPush(cwd, action.args);
        if (isForcePushToProtected(cwd, action.args)) notes.push('force-push to main/master rewrites shared history');
      }
    } catch (e) {
      if (e instanceof Overflow) {
        notes.push('the change is larger than 20 MB, so it could not be fully scanned for secrets');
        continue;
      }
      throw e;
    }
    for (const f of result.findings) (f.severity === 'high' ? high : medium).push(f);
    for (const n of result.names) {
      const why = sensitiveFileReason(n);
      if (why) badFiles.set(n, why);
    }
  }

  if (high.length || badFiles.size) {
    const out = ['Artel guard blocked this git command: it would commit or push secrets.', ''];
    if (badFiles.size) {
      out.push('Sensitive files:');
      for (const [n, why] of badFiles) out.push(`  - ${n} — ${why}`);
    }
    if (high.length) {
      out.push('Secret-like values:');
      out.push(...formatFindings(high.slice(0, 20)));
      if (high.length > 20) out.push(`  …and ${high.length - 20} more`);
    }
    out.push(
      '',
      'What to do: remove the secret from the code (read it from .env / environment variables),',
      'unstage sensitive files (git restore --staged <file>) and add them to .gitignore.',
      'If a secret was already committed or pushed, revoke and re-issue it.',
      'False positive? Add the comment "artel:allow" on that line, or restart Claude Code with ARTEL_GUARD=off.',
    );
    deny(out.join('\n'));
  }

  if (medium.length || notes.length) {
    const parts = [];
    if (medium.length) parts.push(`possible hard-coded secrets: ${medium.slice(0, 5).map((f) => `${f.name} at ${f.source}`).join('; ')}`);
    parts.push(...notes);
    ask(`Artel guard: ${parts.join('; ')}. Continue?`);
  }
}

// Case-insensitive so Windows drive-letter differences (C: vs c:) do not disable the guard.
const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href.toLowerCase() === import.meta.url.toLowerCase();
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    // Fail open: a broken guard must never stop the user's work.
    process.stderr.write(`Artel guard error (ignored): ${err && err.message}\n`);
    process.exit(0);
  }
}
