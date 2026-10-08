---
name: start
description: Shows what Artel can do and routes the user to the right agent or skill for their task. Use when the user asks what Artel is, how to start, which command to use, or says "help" / "что ты умеешь" / "с чего начать" / "помоги выбрать".
---

# Artel — start here / с чего начать

Reply in the user's language. Ask what they want to get done, then point to **one** next step — not the whole catalogue.

## Map: task → what to use

| Task / Задача | Skill | Agent |
|---|---|---|
| Plan a task before doing it / Спланировать задачу | `/artel:plan-first` | `planner` |
| Choose a stack or structure / Выбрать архитектуру | — | `architect` |
| Check finished work / Проверить готовую работу | `/artel:verify-done` | `verifier` |
| Publish code safely / Безопасно выложить на GitHub | `/artel:secure-publish` | `security-auditor` |
| Set up secrets / Настроить .env и ключи | `/artel:secrets-setup` | — |
| Check someone else's repo before installing / Проверить чужой репозиторий | `/artel:repo-audit` | `security-auditor` |
| Review code / Ревью кода | `/artel:code-review` | `code-reviewer` |
| Tests first / Тесты | `/artel:tdd` | `test-engineer` |
| Find a bug / Найти причину ошибки | `/artel:debug` | `debugger` |
| Research with sources / Исследование с источниками | `/artel:research` | `researcher` |
| Website or landing / Сайт или лендинг | `/artel:landing-page` | `web-builder` |
| Audit a website / Аудит сайта | `/artel:seo-audit` | `web-builder` |
| Telegram bot / Телеграм-бот | `/artel:telegram-bot` | `bot-builder` |
| Reels / Shorts script / Сценарий рилса | `/artel:reel-script` | `content-producer` |
| YouTube script / Сценарий для YouTube | `/artel:youtube-script` | `content-producer` |
| Is the idea profitable / Окупится ли идея | `/artel:unit-economics` | `business-analyst` |
| Review an expert report (СТЭ) / Проверить экспертизу | `/artel:expertise-audit` | `claims-analyst` |
| Analyse a warranty case / Разобрать гарантийное дело | `/artel:warranty-case` | `claims-analyst` |
| Draft a claim or a reply / Претензия или ответ | `/artel:claim-letter` | `claims-analyst` |
| Make your own skill / Сделать свой skill | `/artel:make-skill` | — |
| README and instructions / Документация | — | `docs-writer` |

## Always-on protection

Artel's guard hook blocks `git commit` / `git push` when the change contains something that looks like a secret (API keys, bot tokens, private keys, `.env` files) and asks before a force-push to `main`/`master`. To turn it off, start Claude Code with the environment variable `ARTEL_GUARD=off`.

## The Artel way of working

1. **Plan** before multi-step work.
2. **Build** in small, checkable steps.
3. **Verify** with fresh eyes — run it, open it, check sources.
4. **Publish safely** — secrets scan first, push second.
