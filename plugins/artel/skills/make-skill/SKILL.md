---
name: make-skill
description: Turns a repeating workflow into a new Artel skill or agent — interviews the user, writes SKILL.md or an agent file in the right format, tests it on a real example, and validates the repository. Use when the user says "сделай свой skill", "добавь агента", "хочу автоматизировать это", "make a skill", "add an agent".
argument-hint: "[workflow to capture]"
---

# Make a skill or agent / Новый skill или агент

Workflow: $ARGUMENTS

Reply in the user's language.

## Skill or agent?

- **Skill** (`skills/<name>/SKILL.md`) — a procedure: steps, checklists, output format. Runs in the main conversation; the user can call it as `/artel:<name>`.
- **Agent** (`agents/<name>.md`) — a role with its own context window and tool list, for focused or parallel work (review, research, verification).

## Steps

1. **Interview:** what triggers the workflow, inputs, steps, output format, common mistakes, what "good" looks like. Ask for one real example.
2. **Name:** lowercase letters, digits and hyphens, ≤ 64 characters, unique in the repo.
3. **Description** (the most important line — it decides when the skill is used): what it does + when to use it + trigger phrases in **both Russian and English**. Keep it under 1,000 characters.
4. **Body:** short imperative steps, the output format, rules and boundaries. Under 500 lines; move long checklists to separate files next to `SKILL.md` and link them.
5. **Agent frontmatter:** `name`, `description`, `tools` (least privilege — no `Write`/`Bash` for reviewers), `model` (`haiku` for simple, `sonnet` default, `opus` for hard reasoning), `color`.
6. **Test** on the real example; fix what went wrong.
7. **Validate:** `node tools/validate.mjs` must pass. Add the skill to the tables in `README.md` and `README.en.md` and to `skills/start/SKILL.md`.

Never put secrets, personal data or confidential client material into a skill — skills in a public repository are public.
