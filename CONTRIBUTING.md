# Contributing / Как помочь проекту

Pull requests are welcome in Russian or English. / Pull request'ы принимаются на русском или английском.

## Adding a skill / Новый навык

1. Create `skills/<name>/SKILL.md` — `name` is lowercase letters, digits and hyphens (≤ 64), equal to the folder name.
2. Write the `description` carefully: what the skill does, when to use it, and trigger phrases **in Russian and English** (≤ 1024 characters).
3. Keep the body under 500 lines; put long checklists in separate files next to `SKILL.md` and link them.
4. Add the skill to the tables in `README.md`, `README.en.md` and `skills/start/SKILL.md`.
5. Run the checks below.

Or just run `/artel:make-skill` in Claude Code.

## Adding an agent / Новый агент

`agents/<name>.md` with `name`, `description`, `tools` (least privilege: reviewers get no `Write`/`Edit`), `model` (`haiku` / `sonnet` / `opus`), `color`. Tell the agent to reply in the user's language. Document it in both READMEs.

## Changing the guard / Изменения в стороже

- Add a test in `tests/guard.test.mjs` for every new pattern, including a placeholder that must **not** match.
- Never put a realistic secret in the source: assemble fake values at runtime (see the existing tests), or GitHub push protection will reject the push.
- The guard must stay read-only, offline, dependency-free and fail-open.

## Checks / Проверки

```bash
node tools/validate.mjs
node --test
node hooks/scripts/scan-secrets.mjs --history
claude plugin validate .
```

## Rules for content / Правила

- No secrets, personal data or confidential client documents in skills or examples.
- References to laws and norms must name the document, clause and edition, and be checked against the primary text.
- Prefer short, imperative instructions over long explanations.
