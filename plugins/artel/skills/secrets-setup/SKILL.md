---
name: secrets-setup
description: Sets up safe secret handling for a project — .env plus .env.example, .gitignore rules, loading and validating variables at startup, and GitHub secret scanning with push protection. Use when a project gets a bot token, API key or database password, or the user asks "куда положить токен", "как хранить ключи", "set up .env".
argument-hint: "[project path or stack]"
---

# Secrets setup / Настройка секретов

Project: $ARGUMENTS

Reply in the user's language.

## 1. Files

- `.env` — real values, **never committed**.
- `.env.example` — the same variable names with placeholders (`TELEGRAM_BOT_TOKEN=your_token_here`), committed, with a comment per variable saying where to get it.
- `.gitignore` must contain:

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
*.p12
credentials*.json
```

If `.env` was already committed at any point, the values in it are compromised: rotate them, then remove the file from history.

## 2. Loading

- Python: `python-dotenv` → `load_dotenv()`; read with `os.environ["NAME"]` so a missing value fails loudly.
- Node: built-in `node --env-file=.env` (Node 20.6+) or `dotenv`.
- Validate at startup: list required variables, exit with a clear message naming the missing one. Never print values.

## 3. Production

Use the host's secret store (GitHub Actions secrets, the hosting panel's environment variables, systemd `EnvironmentFile=` with `chmod 600`). Different keys for development and production.

## 4. GitHub

Settings → *Code security* → enable **Secret scanning** and **Push protection**. Keep Artel's guard hook on: it blocks commits and pushes that contain token-like strings.

## 5. Check

Run `node "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/scan-secrets.mjs" --history` and confirm it reports no findings.
