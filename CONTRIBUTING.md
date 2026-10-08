# Contributing / Как помочь проекту

Pull requests are welcome in English or Russian. / Pull request'ы принимаются на русском или английском.

## Layout

`plugins/artel` is the core (agents, skills, guard hook). Every other folder in `plugins/` is an optional pack. Each plugin is listed in `.claude-plugin/marketplace.json`.

## Adding a stack pack

Follow [docs/STACK_PACK_GUIDE.md](docs/STACK_PACK_GUIDE.md): one skill per stack, a single-line description (≤ 400 chars), body ≤ 250 lines, long material in reference files. Then add the pack to `marketplace.json`, both READMEs and the map in `plugins/artel/skills/start/SKILL.md`.

## Adding a skill or agent to the core

1. `plugins/artel/skills/<name>/SKILL.md` — `name` is lowercase letters, digits and hyphens (≤ 64) and equals the folder name. The description says what it does, when to use it and trigger phrases in English and Russian. Keep the body under 500 lines; use reference files.
2. `plugins/artel/agents/<name>.md` — `name`, `description`, `tools` (least privilege: reviewers get no `Write`/`Edit`), `model`, `color`; tell the agent to reply in the user's language.
3. Document it in both READMEs and in the start skill. The core's always-on description budget is enforced by the validator — keep descriptions short.

Or run `/artel:make-skill` in Claude Code.

## Changing the guard

- Add a test in `tests/guard.test.mjs` for every new pattern, including a placeholder that must **not** match.
- Never put a realistic secret in the source: assemble fake values at runtime (see the existing tests), or GitHub push protection will reject the push.
- The guard must stay read-only, offline, dependency-free and fail-open.

## Checks

```bash
node tools/validate.mjs
node --test
node plugins/artel/hooks/scripts/scan-secrets.mjs --history
claude plugin validate . --strict
```

## Rules for content

- No secrets, personal data or confidential documents in skills or examples.
- Accuracy over volume: never invent flags, APIs or config keys. Name the document and version when citing laws, standards or specs.
- Prefer short, imperative instructions over long explanations.
