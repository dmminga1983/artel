---
name: repo-audit
description: Audits a third-party GitHub repository, plugin, extension or install script before you install or run it — what it really does, what runs automatically, what it changes on your machine, network and credential access, maintenance and licence — and gives an install / don't-install verdict. Use when the user shares a GitHub link and asks "что это", "можно ставить?", "сделай аудит", "is this safe".
argument-hint: "[GitHub URL or local path]"
---

# Audit before install / Проверка чужого репозитория

Target: $ARGUMENTS

Reply in the user's language. Read, do not execute: never run the project's install scripts during the audit.

## 1. What it is

Purpose in plain words, who it is for, the author, licence, stars/forks, last release and last commit, open issues about bugs or security. Is this the official repository or a mirror/fork?

## 2. What it does on your machine

Read the install path the README recommends (`install.sh`, `setup.py`, `package.json` scripts — especially `preinstall`/`postinstall`, `npx …`, `curl | bash`) and list:
- files and settings it writes or changes (e.g. `~/.claude/settings.json`, shell profiles, startup items);
- anything that runs **automatically** (hooks, services, cron/scheduled tasks, startup entries);
- network calls and where they go; telemetry;
- access to credentials, tokens, keychains, browser data;
- actions that can cost money (paid APIs, purchases);
- dependencies it pulls and whether they are pinned.

## 3. Red flags

Obfuscated or minified code where source is expected, downloads of binaries at install time, requests for broad permissions, disabled TLS checks, affiliate or sponsored links woven into instructions, unofficial mirrors.

## 4. Fit

Does the user actually need it for their goal? Is there a simpler or built-in way?

## 5. Verdict

**Install / install with precautions / don't install**, with the precautions (test machine, pinned version, which parts to disable). Delegate code-level checks to `security-auditor` when the repository is large.
