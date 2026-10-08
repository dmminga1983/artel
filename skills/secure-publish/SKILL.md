---
name: secure-publish
description: Pre-publication security gate for any git push or first publication on GitHub — scans files and the whole git history for secrets, checks .gitignore and .env handling, and GitHub Actions for dangerous triggers, then pushes only if clean. Use before every push, before making a repository public, or when the user says "выложи на гитхаб", "запушь", "опубликуй", "publish", "push".
argument-hint: "[remote/branch or repo path]"
---

# Secure publish / Безопасная публикация

Target: $ARGUMENTS (default: the current repository and branch)

Reply in the user's language. **Check first, push second — never the other way round.**

## 1. Secrets in the files and in history

Run the bundled scanner from the repository root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/scan-secrets.mjs" --history
```

It scans tracked files and every commit for API keys, bot tokens, private keys and `.env` files, and prints each finding with file and commit. If the scanner is not available (for example, outside Claude Code), use `git log -p --all | grep -nE "AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_|sk-ant-|sk-[A-Za-z0-9]{20,}|xox[abprs]-|AIza[0-9A-Za-z_-]{35}|[0-9]{8,10}:[A-Za-z0-9_-]{35}|BEGIN [A-Z ]*PRIVATE KEY"` and `git log --all --name-only --format= | sort -u | grep -E "(^|/)\.env($|\.)"`.

Then look manually for anything the patterns cannot know: real names, phone numbers, addresses, internal URLs, client documents.

If a secret is found in **history**, removing the file is not enough: the secret must be **rotated** (revoked and re-issued) and the history rewritten (`git filter-repo`) before publishing. Stop and explain this to the user.

## 2. Hygiene

- `.gitignore` exists and covers `.env`, `.env.*` (but not `.env.example`), `*.pem`, `*.key`, credentials files, `node_modules/`, virtualenvs, build output, local databases, OS files.
- `.env.example` exists when the project uses secrets, with placeholders only.
- Code reads secrets from the environment, never hard-codes them, never logs them.
- No large binaries or personal files accidentally staged (`git status`, `git ls-files | head -100`).

## 3. GitHub Actions (if `.github/workflows/` exists)

Flag and fix before publishing:
- `pull_request_target` or `workflow_run` combined with checking out PR code;
- `${{ github.event.issue.title }}` / `…body` / `…head_ref` and similar inserted directly into `run:` — script injection;
- no top-level `permissions:` block (set `contents: read` and widen per job only when needed);
- secrets passed to steps that run untrusted code.

## 4. Push

Only when steps 1–3 are clean: show the user what will be pushed (`git log --oneline HEAD --not --remotes` — works for a first push too), then push.

## 5. After the first publication, recommend

GitHub → Settings → *Code security*: enable **Secret scanning** and **Push protection**; add branch protection on `main`.
