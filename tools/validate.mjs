#!/usr/bin/env node
// Validates the Artel repository structure. No dependencies. Run: node tools/validate.mjs
// Checks manifests, agent and skill frontmatter, local links, hooks wiring,
// and that every skill and agent is documented in both READMEs and in the start skill.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODELS = new Set(['haiku', 'sonnet', 'opus', 'fable', 'inherit']);
const COLORS = new Set(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']);
const TOOLS = new Set([
  'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'PowerShell', 'WebSearch', 'WebFetch',
  'NotebookEdit', 'TaskCreate', 'TaskUpdate', 'Agent', 'Skill',
]);

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (e) {
    err(`${rel}: invalid JSON (${e.message})`);
    return null;
  }
}

/** Minimal frontmatter parser: `key: value` lines between --- fences. */
function frontmatter(rel) {
  const text = readFileSync(join(root, rel), 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) {
    err(`${rel}: missing YAML frontmatter`);
    return { data: {}, body: text };
  }
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { data, body: m[2] };
}

function checkDescription(rel, d) {
  if (!d) return err(`${rel}: description is required`);
  if (d.length < 40) warn(`${rel}: description is very short — it decides when this is used`);
  if (d.length > 1024) err(`${rel}: description is ${d.length} chars (max 1024)`);
}

// ---- manifests
const plugin = readJson('.claude-plugin/plugin.json');
const market = readJson('.claude-plugin/marketplace.json');
if (plugin) {
  if (!plugin.name || !NAME_RE.test(plugin.name)) err('plugin.json: name must be kebab-case');
  if (!plugin.version) warn('plugin.json: no version');
  if (!plugin.license) warn('plugin.json: no license');
}
if (market && plugin) {
  const entry = (market.plugins || []).find((p) => p.name === plugin.name);
  if (!entry) err('marketplace.json: no entry for the plugin');
  else if (entry.source !== '.' && entry.source !== './') err('marketplace.json: plugin source should be "."');
  if (!market.owner?.name) err('marketplace.json: owner.name is required');
}

// ---- agents
const agentFiles = readdirSync(join(root, 'agents')).filter((f) => f.endsWith('.md'));
const agents = [];
for (const f of agentFiles) {
  const rel = `agents/${f}`;
  const { data, body } = frontmatter(rel);
  const name = data.name;
  if (!name) err(`${rel}: name is required`);
  else {
    if (!NAME_RE.test(name)) err(`${rel}: name "${name}" must be kebab-case`);
    if (`${name}.md` !== f) err(`${rel}: name "${name}" must match the file name`);
    agents.push(name);
  }
  checkDescription(rel, data.description);
  if (data.model && !MODELS.has(data.model) && !/^claude-/.test(data.model)) err(`${rel}: unknown model "${data.model}"`);
  if (data.color && !COLORS.has(data.color)) err(`${rel}: unknown color "${data.color}"`);
  if (data.tools) {
    for (const t of data.tools.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!TOOLS.has(t) && !t.startsWith('mcp__')) warn(`${rel}: unfamiliar tool "${t}"`);
    }
  }
  if (body.trim().split('\n').length < 8) warn(`${rel}: body is very short`);
}

// ---- skills
const skillDirs = readdirSync(join(root, 'skills')).filter((d) => statSync(join(root, 'skills', d)).isDirectory());
const skills = [];
for (const d of skillDirs) {
  const rel = `skills/${d}/SKILL.md`;
  if (!existsSync(join(root, rel))) {
    err(`${rel}: missing`);
    continue;
  }
  const { data, body } = frontmatter(rel);
  const name = data.name || d;
  if (!NAME_RE.test(name) || name.length > 64) err(`${rel}: name "${name}" must be kebab-case, max 64 chars`);
  if (name !== d) err(`${rel}: name "${name}" must match the directory "${d}"`);
  skills.push(name);
  checkDescription(rel, data.description);
  const lines = body.split('\n').length;
  if (lines > 500) warn(`${rel}: ${lines} lines — move details to supporting files`);
  // `$` followed by a digit is substituted as an argument placeholder by Claude Code.
  if (/(^|[^\\])\$\d/.test(body)) warn(`${rel}: "$<digit>" is treated as an argument placeholder; escape as \\$`);
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const link of prose.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
    if (!existsSync(join(root, 'skills', d, link[1]))) err(`${rel}: broken link to ${link[1]}`);
  }
}

const dupes = [...agents, ...skills].filter((n, i, a) => a.indexOf(n) !== i);
for (const n of new Set(dupes)) warn(`name "${n}" is used by both an agent and a skill`);

// ---- hooks
const hooks = readJson('hooks/hooks.json');
if (hooks) {
  if (!hooks.hooks || typeof hooks.hooks !== 'object') err('hooks/hooks.json: top-level "hooks" object is required');
  for (const groups of Object.values(hooks.hooks || {})) {
    for (const g of groups) {
      for (const h of g.hooks || []) {
        for (const a of [h.command, ...(h.args || [])]) {
          const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/.exec(a || '');
          if (m && !existsSync(join(root, m[1]))) err(`hooks/hooks.json: script not found: ${m[1]}`);
        }
      }
    }
  }
}

// ---- docs coverage
const docs = {
  'README.md': readFileSync(join(root, 'README.md'), 'utf8'),
  'README.en.md': readFileSync(join(root, 'README.en.md'), 'utf8'),
  'skills/start/SKILL.md': readFileSync(join(root, 'skills/start/SKILL.md'), 'utf8'),
};
for (const s of skills) {
  if (s === 'start') continue;
  for (const [file, text] of Object.entries(docs)) {
    if (!text.includes(`/artel:${s}`)) err(`${file}: skill "${s}" is not documented (expected "/artel:${s}")`);
  }
}
for (const a of agents) {
  for (const file of ['README.md', 'README.en.md']) {
    if (!docs[file].includes(`\`${a}\``)) err(`${file}: agent "${a}" is not documented`);
  }
}

// ---- report
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
console.log(`\n${agents.length} agents, ${skills.length} skills — ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
