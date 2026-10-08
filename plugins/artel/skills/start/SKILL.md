---
name: start
description: Shows what Artel can do and routes the user to the right agent, skill or stack pack for their task. Use when the user asks what Artel is, how to start, which command to use, or says "help" / "что ты умеешь" / "с чего начать" / "помоги выбрать".
---

# Artel — start here / с чего начать

Reply in the user's language. Ask what they want to get done, then point to **one** next step — not the whole catalogue.

## Core: task → what to use

| Task / Задача | Skill | Agent |
|---|---|---|
| Plan a task before doing it / Спланировать | `/artel:plan-first` | `planner` |
| Choose architecture / Выбрать архитектуру | — | `architect` |
| Check finished work / Проверить готовое | `/artel:verify-done` | `verifier` |
| Publish code safely / Безопасно выложить | `/artel:secure-publish` | `security-auditor` |
| Set up secrets / Настроить .env и ключи | `/artel:secrets-setup` | — |
| Vet someone else's repo / Проверить чужой репозиторий | `/artel:repo-audit` | `security-auditor` |
| Protect an LLM app or bot from prompt injection / Защита от промт-инъекций | `/artel:injection-defense` | `security-auditor` |
| Review code / Ревью кода | `/artel:code-review` | `code-reviewer` |
| Tests first / Тесты | `/artel:tdd` | `test-engineer` |
| Find a bug / Найти причину ошибки | `/artel:debug` | `debugger` |
| Fix a broken build / Починить сборку | — | `build-fixer` |
| Restructure code safely / Рефакторинг | `/artel:refactor` | `refactorer` |
| Slow code / Оптимизация | `/artel:perf` | `performance-engineer` |
| Understand a new codebase / Разобраться в проекте | `/artel:onboard` | `researcher` |
| Branches, commits, PRs / Git-процесс | `/artel:git-workflow` | — |
| Release a version / Выпустить релиз | `/artel:ship` | `verifier` |
| Research with sources / Исследование | `/artel:research` | `researcher` |
| README and docs / Документация | — | `docs-writer` |
| Make your own skill / Свой skill | `/artel:make-skill` | — |

## Stack packs (install only what you use)

Core agents load the matching pack automatically when it is installed. Install with `/plugin install <pack>@artel`.

| Pack | Use |
|---|---|
| `artel-python` | `/artel-python:python` — Django, FastAPI, Flask, data/ML |
| `artel-typescript` | `/artel-typescript:typescript` — Node, React, Next.js, Vue, Angular, Svelte |
| `artel-go` | `/artel-go:go` |
| `artel-rust` | `/artel-rust:rust` |
| `artel-jvm` | `/artel-jvm:jvm` — Java, Kotlin, Spring, Android |
| `artel-dotnet` | `/artel-dotnet:dotnet` — C#, ASP.NET Core, EF Core |
| `artel-php` | `/artel-php:php` — Laravel, Symfony |
| `artel-ruby` | `/artel-ruby:ruby` — Rails |
| `artel-swift` | `/artel-swift:swift` — iOS, SwiftUI |
| `artel-flutter` | `/artel-flutter:flutter` — Dart |
| `artel-cpp` | `/artel-cpp:cpp` — C, C++, CMake |
| `artel-data` | `/artel-data:data` — SQL, migrations, Redis |
| `artel-devops` | `/artel-devops:devops` — Docker, Kubernetes, Terraform, CI |
| `artel-web` | `/artel-web:landing-page`, `/artel-web:seo-audit`, `/artel-web:telegram-bot` (agents `web-builder`, `bot-builder`) |
| `artel-content` | `/artel-content:reel-script`, `/artel-content:youtube-script`, `/artel-content:unit-economics` (agents `content-producer`, `business-analyst`) |

If the needed pack is not installed, say so and give the install line.

## Always-on protection

Artel's guard hook blocks `git commit` / `git push` when the change contains something that looks like a secret (API keys, tokens, private keys, `.env` files) and asks before a force-push to `main`/`master`. To turn it off, start Claude Code with the environment variable `ARTEL_GUARD=off`.

## The Artel way of working

1. **Plan** before multi-step work.
2. **Build** in small, checkable steps.
3. **Verify** with fresh eyes — run it, open it, check sources.
4. **Publish safely** — secrets scan first, push second.
