---
name: telegram-bot
description: Creates a Telegram bot project from a short description — handlers, menu buttons, storage, admin commands, optional AI-model replies — with the token in .env, tests, and instructions to run it 24/7. Use when the user wants a Telegram bot or says "сделай бота", "телеграм-бот", "бот для заявок", "telegram bot".
argument-hint: "[what the bot should do]"
---

# Telegram bot / Телеграм-бот

Idea: $ARGUMENTS

Reply in the user's language; bot texts in its users' language.

## 1. Spec (one screen)

Purpose in one sentence · users · commands and buttons (`/start`, `/help`, main menu) · data stored · notifications to the admin · external APIs or AI model · where it will run.

## 2. Build

Delegate to the `bot-builder` agent with the spec. Required in every bot:
- `.env.example` with `TELEGRAM_BOT_TOKEN=` and `ADMIN_IDS=`; `.env` in `.gitignore` — run `/artel:secrets-setup`;
- startup check for missing variables, no token in logs;
- handlers for `/start`, `/help`, unknown input and errors;
- input validation and rate limiting for expensive actions;
- if an AI model is used: per-user daily limit and max tokens per reply;
- SQLite storage by default; minimum personal data;
- tests for the handler logic (without calling Telegram).

## 3. Run

Instructions in the README: create the bot in **@BotFather** → copy the token into `.env` → install → run. For 24/7: a systemd unit or a `Dockerfile` + `docker compose`, with restart on failure.

## 4. Before publishing

`/artel:secure-publish`. A leaked token lets anyone control the bot — if it ever leaks, revoke it in @BotFather (`/revoke`).
