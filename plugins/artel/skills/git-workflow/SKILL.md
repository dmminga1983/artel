---
name: git-workflow
description: Clean git practice — branch, small focused commits with clear messages, rebase or merge safely, open a pull request with a good description, and recover from mistakes without losing work. Use for commits, branches, PRs, merge conflicts, or "I messed up git" / "закоммить", "сделай PR", "конфликт", "откатить".
argument-hint: "[what you want to do in git]"
---

# Git workflow / Работа с git

Task: $ARGUMENTS

Reply in the user's language.

## Before anything destructive

Run `git status` and `git stash list`. If there is uncommitted work, commit or `git stash push -u` first. Prefer reversible commands; `git reflog` can recover most "lost" commits.

## Commits

- One logical change per commit. Stage deliberately (`git add -p` or named files), never blindly `git add .` in a repo you have not inspected.
- Message: imperative subject ≤ 72 chars (follow the repo's convention, e.g. Conventional Commits if used), blank line, body explaining **why**.
- Never commit secrets — run `/artel:secure-publish` before the first push of a new repository.
- Do not skip hooks (`--no-verify`) unless the user explicitly asks.

## Branches and PRs

- Branch from an up-to-date default branch: `git switch -c feat/short-name`.
- Rebase your own unpublished branch to update it; merge shared branches. Never force-push shared branches; for your own use `--force-with-lease`.
- PR description: what and why, how to test, screenshots for UI, risks, linked issue. Keep PRs small enough to review in one sitting.

## Conflicts

Understand both sides before choosing. Resolve, run tests, then continue (`git rebase --continue` / commit the merge). If it goes wrong: `git rebase --abort` / `git merge --abort`.

## Undo cheatsheet

| Situation | Command |
|---|---|
| Unstage a file | `git restore --staged <file>` |
| Discard local edits to a file (destructive) | `git restore <file>` |
| Change the last unpublished commit | `git commit --amend` |
| Undo a published commit | `git revert <sha>` |
| Find a lost commit | `git reflog`, then `git switch -c rescue <sha>` |
