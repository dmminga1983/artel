#!/usr/bin/env node
// Artel secret scanner — run before publishing a repository.
//
//   node scan-secrets.mjs [--history] [--strict] [path]
//
//   (default)   scan tracked and untracked (not ignored) files in the working tree
//   --history   also scan every commit on every branch (git log -p --all)
//   --strict    exit 1 on medium-confidence findings too
//
// Exit codes: 0 clean, 1 findings, 2 usage or git error.
// Read-only: it never changes files and never uses the network.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatFindings, scanPatch, scanText, sensitiveFileReason } from './secret-rules.mjs';

const MAX_FILE = 2 * 1024 * 1024;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

const argv = process.argv.slice(2);
const history = argv.includes('--history');
const strict = argv.includes('--strict');
const target = resolve(argv.find((a) => !a.startsWith('--')) || '.');

let root;
try {
  root = git(target, ['rev-parse', '--show-toplevel']).trim();
} catch {
  process.stderr.write(`Not a git repository: ${target}\n`);
  process.exit(2);
}

const findings = [];
const badFiles = new Map();

const files = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
for (const f of files) {
  const why = sensitiveFileReason(f);
  if (why) badFiles.set(f, why);
  try {
    const p = resolve(root, f);
    const st = statSync(p);
    if (!st.isFile() || st.size > MAX_FILE) continue;
    const text = readFileSync(p, 'utf8');
    if (text.includes('\u0000')) continue;
    findings.push(...scanText(text, f).map((x) => ({ ...x, source: `${f}:${x.line}` })));
  } catch {
    /* deleted or unreadable */
  }
}

if (history) {
  let patch = '';
  try {
    patch = git(root, ['log', '-p', '--all', '--no-color', '--no-ext-diff', '-U0', '--format=commit %H']);
  } catch {
    /* empty repository */
  }
  const res = scanPatch(patch);
  findings.push(...res.findings.map((x) => ({ ...x, source: `history ${x.source}` })));
  let names = '';
  try {
    names = git(root, ['log', '--all', '--name-only', '--format=']);
  } catch {
    /* empty repository */
  }
  for (const n of new Set(names.split('\n').filter(Boolean))) {
    const why = sensitiveFileReason(n);
    if (why && !badFiles.has(n)) badFiles.set(n, `${why} (in history)`);
  }
}

const high = findings.filter((f) => f.severity === 'high');
const medium = findings.filter((f) => f.severity === 'medium');

console.log(`Artel secret scan: ${root}${history ? ' (files + full history)' : ' (files)'}`);
if (badFiles.size) {
  console.log('\nSensitive files:');
  for (const [n, why] of badFiles) console.log(`  - ${n} — ${why}`);
}
if (high.length) {
  console.log('\nSecrets (high confidence):');
  console.log(formatFindings(high).join('\n'));
}
if (medium.length) {
  console.log('\nPossible hard-coded secrets (check manually):');
  console.log(formatFindings(medium).join('\n'));
}

const failed = badFiles.size > 0 || high.length > 0 || (strict && medium.length > 0);
if (!badFiles.size && !high.length && !medium.length) console.log('\nNo findings.');
else if (failed) console.log('\nNot safe to publish yet. Secrets found in history must be revoked and re-issued, not just deleted.');
process.exit(failed ? 1 : 0);
