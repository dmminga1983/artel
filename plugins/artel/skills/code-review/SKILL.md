---
name: code-review
description: Reviews the current changes (or given files) for bugs, security problems, missing tests and unclear code, ranked by severity with concrete fixes. Use before committing or merging, or when the user says "проверь код", "сделай ревью", "review this", "что тут не так".
argument-hint: "[files, branch or PR — default: uncommitted changes]"
---

# Code review / Ревью кода

Scope: $ARGUMENTS (default: `git diff` + `git diff --cached`; if both are empty, the last commit)

Reply in the user's language.

1. Collect the diff and read the surrounding code of every changed function.
2. Delegate to the `code-reviewer` agent; for anything touching auth, secrets, payments, file uploads, shell commands or CI, also delegate to `security-auditor` in parallel.
3. Run the project's tests and linter if they exist; include the results.
4. Merge the findings into one list, **blocker → should fix → nit**, deduplicated. Each: `file:line`, the problem, a concrete scenario where it breaks, the fix.
5. Offer to apply the fixes. Apply only what the user agrees to, then re-run the tests.

If nothing is wrong, say so briefly. Do not invent findings.
