#!/usr/bin/env node
// Validates the Artel marketplace. No dependencies. Run: node tools/validate.mjs
// Checks: marketplace ↔ plugin manifests, agent and skill frontmatter, local links,
// hook wiring, context budgets, and that everything is documented in both READMEs.

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
// Always-on budgets (characters of descriptions). Claude Code's skill listing is
// capped at ~1% of the context window; staying small keeps every description visible.
const CORE_DESC_BUDGET = 9000;
const PACK_DESC_BUDGET = 1700;
const MAX_DESC = 600;

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

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
  if (d.length > MAX_DESC) err(`${rel}: description is ${d.length} chars (max ${MAX_DESC}) — keep the always-on listing small`);
}

function checkLinks(rel, body, baseDir) {
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const link of prose.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
    if (!existsSync(join(root, baseDir, link[1]))) err(`${rel}: broken link to ${link[1]}`);
  }
}

// ---- marketplace
const market = readJson('.claude-plugin/marketplace.json');
if (!market) process.exit(1);
if (!market.owner?.name) err('marketplace.json: owner.name is required');
const listed = new Set();
const inventory = []; // { plugin, agents: [], skills: [], descChars }

for (const entry of market.plugins || []) {
  const name = entry.name;
  if (!NAME_RE.test(name || '')) err(`marketplace.json: bad plugin name "${name}"`);
  if (listed.has(name)) err(`marketplace.json: duplicate plugin "${name}"`);
  listed.add(name);
  const dir = (entry.source || '').replace(/^\.\//, '');
  if (!dir || !isDir(join(root, dir))) {
    err(`marketplace.json: source for "${name}" not found: ${entry.source}`);
    continue;
  }
  const pj = readJson(`${dir}/.claude-plugin/plugin.json`);
  if (pj && pj.name !== name) err(`${dir}/.claude-plugin/plugin.json: name "${pj.name}" does not match marketplace entry "${name}"`);
  if (pj && !pj.version) warn(`${dir}: no version`);
  if (pj && !pj.license) warn(`${dir}: no license`);

  const inv = { plugin: name, dir, agents: [], skills: [], descChars: 0 };
  inventory.push(inv);

  // agents
  if (isDir(join(root, dir, 'agents'))) {
    for (const f of readdirSync(join(root, dir, 'agents')).filter((x) => x.endsWith('.md'))) {
      const rel = `${dir}/agents/${f}`;
      const { data, body } = frontmatter(rel);
      if (!data.name) err(`${rel}: name is required`);
      else {
        if (!NAME_RE.test(data.name)) err(`${rel}: name must be kebab-case`);
        if (`${data.name}.md` !== f) err(`${rel}: name "${data.name}" must match the file name`);
        inv.agents.push(data.name);
      }
      checkDescription(rel, data.description);
      inv.descChars += (data.description || '').length;
      if (data.model && !MODELS.has(data.model) && !/^claude-/.test(data.model)) err(`${rel}: unknown model "${data.model}"`);
      if (data.color && !COLORS.has(data.color)) err(`${rel}: unknown color "${data.color}"`);
      for (const t of (data.tools || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!TOOLS.has(t) && !t.startsWith('mcp__')) warn(`${rel}: unfamiliar tool "${t}"`);
      }
      if (!/user'?s language|language the user/i.test(body)) warn(`${rel}: does not say to reply in the user's language`);
    }
  }

  // skills
  if (isDir(join(root, dir, 'skills'))) {
    for (const d of readdirSync(join(root, dir, 'skills')).filter((x) => isDir(join(root, dir, 'skills', x)))) {
      const rel = `${dir}/skills/${d}/SKILL.md`;
      if (!existsSync(join(root, rel))) {
        err(`${rel}: missing`);
        continue;
      }
      const { data, body } = frontmatter(rel);
      const sname = data.name || d;
      if (!NAME_RE.test(sname) || sname.length > 64) err(`${rel}: name must be kebab-case, max 64 chars`);
      if (sname !== d) err(`${rel}: name "${sname}" must match the directory "${d}"`);
      inv.skills.push(sname);
      checkDescription(rel, data.description);
      inv.descChars += (data.description || '').length + (data.when_to_use || '').length;
      const lines = body.split('\n').length;
      if (lines > 500) err(`${rel}: ${lines} lines — move details to supporting files (max 500)`);
      // `$` + digit is substituted as an argument placeholder in SKILL.md.
      if (/(^|[^\\])\$\d/.test(body)) err(`${rel}: "$<digit>" is treated as an argument placeholder; escape it as \\$ or move the example to a reference file`);
      checkLinks(rel, body, `${dir}/skills/${d}`);
    }
  }

  // hooks
  if (existsSync(join(root, dir, 'hooks/hooks.json'))) {
    const hooks = readJson(`${dir}/hooks/hooks.json`);
    if (hooks && (!hooks.hooks || typeof hooks.hooks !== 'object')) err(`${dir}/hooks/hooks.json: top-level "hooks" object is required`);
    for (const [event, groups] of Object.entries(hooks?.hooks || {})) {
      for (const g of groups) {
        if (!g.matcher || g.matcher === '.*' || g.matcher === '*') warn(`${dir}: ${event} hook runs on every tool call — keep hooks narrow`);
        for (const h of g.hooks || []) {
          for (const a of [h.command, ...(h.args || [])]) {
            const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/.exec(a || '');
            if (m && !existsSync(join(root, dir, m[1]))) err(`${dir}/hooks/hooks.json: script not found: ${m[1]}`);
          }
        }
      }
    }
  }

  const budget = name === 'artel' ? CORE_DESC_BUDGET : PACK_DESC_BUDGET;
  if (inv.descChars > budget) err(`${name}: always-on descriptions are ${inv.descChars} chars (budget ${budget})`);
  if (!inv.agents.length && !inv.skills.length) err(`${name}: plugin has no agents or skills`);
}

// orphans: plugin folders not listed in the marketplace
if (isDir(join(root, 'plugins'))) {
  for (const d of readdirSync(join(root, 'plugins'))) {
    if (isDir(join(root, 'plugins', d)) && !listed.has(d)) err(`plugins/${d}: not listed in marketplace.json`);
  }
}

// ---- docs coverage
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const readmeRu = readFileSync(join(root, 'README.ru.md'), 'utf8');
const start = inventory.find((i) => i.plugin === 'artel');
const startText = start ? readFileSync(join(root, start.dir, 'skills/start/SKILL.md'), 'utf8') : '';
for (const inv of inventory) {
  for (const [file, text] of [['README.md', readme], ['README.ru.md', readmeRu]]) {
    if (!text.includes(`${inv.plugin}@artel`)) err(`${file}: plugin "${inv.plugin}" has no install line ("${inv.plugin}@artel")`);
    for (const s of inv.skills) {
      if (inv.plugin === 'artel' && s === 'start') continue;
      if (!text.includes(`/${inv.plugin}:${s}`)) err(`${file}: skill "/${inv.plugin}:${s}" is not documented`);
    }
    for (const a of inv.agents) if (!text.includes(`\`${a}\``)) err(`${file}: agent "${a}" is not documented`);
  }
  for (const s of inv.skills) {
    if (inv.plugin === 'artel' && s !== 'start' && !startText.includes(`/artel:${s}`)) err(`artel start skill: "/artel:${s}" missing from the map`);
  }
  if (inv.plugin !== 'artel' && !startText.includes(inv.plugin)) err(`artel start skill: pack "${inv.plugin}" missing from the map`);
}

// ---- report
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
const totals = inventory.reduce((a, i) => ({ agents: a.agents + i.agents.length, skills: a.skills + i.skills.length }), { agents: 0, skills: 0 });
console.log(`\n${inventory.length} plugins, ${totals.agents} agents, ${totals.skills} skills — ${errors.length} errors, ${warnings.length} warnings`);
for (const i of inventory) console.log(`  ${i.plugin.padEnd(18)} agents ${String(i.agents.length).padStart(2)}  skills ${String(i.skills.length).padStart(2)}  always-on desc ${i.descChars} chars`);
process.exit(errors.length ? 1 : 0);
