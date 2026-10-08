# Writing an Artel stack pack

A stack pack teaches Claude one ecosystem well. It is a plugin under `plugins/artel-<stack>/` that holds **one skill** named after the stack (for example `plugins/artel-python/skills/python/SKILL.md`, invoked as `/artel-python:python`), plus optional reference files next to it. Core agents (`code-reviewer`, `build-fixer`, `test-engineer`, `debugger`, `security-auditor`) load the pack's skill when they detect the stack.

## Why one skill per stack

ECC-style toolkits ship a separate skill for every framework × concern (`django-tdd`, `django-security`, `django-verification`, …). Each skill adds its description to the always-on listing, and Claude Code caps that listing at about 1% of the context window — so with hundreds of skills most descriptions are dropped and the skills stop triggering. Artel keeps **one short description per stack** and puts depth in reference files that cost nothing until they are read.

## Frontmatter

```yaml
---
name: python                      # = folder name, lowercase-hyphen, ≤ 64 chars
description: >-                   # ≤ 450 chars. What it covers + when to use + trigger words
  ...                             # (a couple in Russian are welcome). One line in the file.
paths: "**/*.py, pyproject.toml"  # globs that make the skill relevant
---
```

Write `description` on a single line (no YAML block scalars) so every tool parses it.

## Body (≤ 250 lines) — sections in this order

1. **Detect the project** — which files to read (manifests, lockfiles, tool configs, CI) to learn the version, package manager, framework, test runner, formatter and linter. Rule: *follow the project's existing conventions over these defaults.*
2. **Defaults for new code** — the boring, well-supported choices. Do not hard-code "latest" version numbers; say "check the current stable version" where it matters.
3. **Idioms and design** — the 8–15 things a senior engineer in this stack insists on.
4. **Errors and logging.**
5. **Testing** — framework, layout, fixtures/mocks, how to run one test, coverage.
6. **Security pitfalls** — concrete, stack-specific (injection APIs, unsafe deserialisation, framework settings, dependency audit command).
7. **Performance pitfalls.**
8. **Build and run errors** — a table: *symptom → likely cause → fix*.
9. **Review checklist** — short; long versions go to `review-checklist.md`.
10. **Frameworks** — short notes; long notes go to `frameworks.md`.

Start the body with: `Reply in the user's language.`

## Reference files

Put long material in files next to `SKILL.md` and link them with relative links, e.g. `[frameworks.md](frameworks.md)`. Reference files are read on demand.

## Rules

- Accuracy over volume. Never invent flags, APIs or config keys. If unsure, describe the behaviour without the exact flag.
- No `$` followed by a digit inside `SKILL.md` (Claude Code treats `$1` as an argument placeholder). Put shell examples with positional parameters in a reference file, or escape as `\$1`.
- No secrets or realistic-looking tokens, even fake ones. No personal data, company names or sponsor/affiliate links.
- Commands must be copy-pasteable and safe; destructive ones are labelled.
- Run `node tools/validate.mjs` and `claude plugin validate plugins/artel-<stack>/skills --strict` before opening a PR.
