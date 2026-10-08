# Artel

**A lean, security-first marketplace of agents and skills for Claude Code.** Install a small core (12 agents, 16 skills, a leak guard), then add only the stack packs you use: Python, TypeScript, Go, Rust, Java/Kotlin, .NET, PHP, Ruby, Swift, Flutter, C/C++, data, DevOps, web, content.

[Русская версия →](README.ru.md)

```
/plugin marketplace add dmminga1983/artel
/plugin install artel@artel
/plugin install artel-python@artel      # add the packs you need
```

Then type `/artel:start` — Artel asks what you want to do and points to one next step.

*Artel* (артель) is a Russian word for a cooperative team of craftsmen.

---

## Why Artel

Big toolkits such as [ECC](https://github.com/affaan-m/ECC) ship hundreds of skills at once. Claude Code caps the skill listing at about 1% of the context window, so on overflow most descriptions are dropped and skills stop triggering — and the always-on cost is paid in every session. Artel makes different choices:

| | ECC (as measured, Oct 2026) | Artel |
|---|---|---|
| Always-on context cost | ~44.8k tokens | **~2.9k tokens** for the core; ~180 per stack pack |
| Structure | one big plugin, ~68 agents, ~290 skills | core + 15 optional packs; **one skill per stack** with reference files read on demand |
| Security | configuration scanner | **a guard that is on from install**: blocks commits and pushes containing keys, tokens or `.env`/key files |
| Independent checking | — | a `verifier` agent that never grades its own work |
| Languages | English | agents reply in the user's language; skills trigger in Russian and English |
| Network and money | paid tiers, referral links | no network calls, no paid actions, no ads, no telemetry |
| Dependencies | — | none; Node ≥ 18 only for the guard, which fails open |

Token numbers come from `claude plugin details`; reproduce them after installing.

## The Artel loop

1. **Plan** multi-step work first (`/artel:plan-first`).
2. **Build** in small, checkable steps.
3. **Verify**: run it, open it, check sources (`/artel:verify-done`).
4. **Publish safely**: secret scan first, push second (`/artel:secure-publish`).

## Core (`artel@artel`)

### Agents

An agent is a helper with one role and its own context. Claude delegates automatically, or ask: "have `security-auditor` check this repo". When a stack pack is installed, the agents load it for the detected stack.

| Agent | What it does |
|---|---|
| `planner` | Turns a vague task into a step-by-step plan with a definition of done |
| `architect` | Chooses stack and structure; records trade-offs |
| `verifier` | Independently checks finished work: runs it, opens it, checks facts |
| `code-reviewer` | Review ranked by severity: bugs, security, tests, clarity |
| `security-auditor` | Secrets in history, `.gitignore`, GitHub Actions, dependencies |
| `test-engineer` | Writes tests, test-first |
| `debugger` | Finds the root cause, not the symptom |
| `build-fixer` | Fixes broken builds and failing CI with the smallest change |
| `refactorer` | Restructures code in small steps with tests as a safety net |
| `performance-engineer` | Measures first, then optimises the real bottleneck |
| `researcher` | Research with sources: every claim linked |
| `docs-writer` | Clear READMEs and instructions |

### Skills

| Command | What it does |
|---|---|
| `/artel:start` | Picks the agent, skill or pack for your task |
| `/artel:plan-first` | Plan and definition of done before work starts |
| `/artel:verify-done` | Verification before reporting "done" |
| `/artel:code-review` | Review of the current changes |
| `/artel:tdd` | Test-driven development |
| `/artel:debug` | Systematic debugging |
| `/artel:refactor` | Behaviour-preserving refactoring |
| `/artel:perf` | Profile, fix the bottleneck, re-measure |
| `/artel:onboard` | Understand an unfamiliar codebase quickly |
| `/artel:git-workflow` | Branches, commits, pull requests |
| `/artel:ship` | Pre-release checklist, changelog, tag |
| `/artel:research` | Research with sources |
| `/artel:secure-publish` | Secrets, `.gitignore` and Actions check before publishing |
| `/artel:secrets-setup` | `.env`, `.env.example` and key protection |
| `/artel:repo-audit` | Audit someone else's repo or plugin before installing it |
| `/artel:make-skill` | Create your own skill or agent |

## Stack packs

Each pack is one skill: how to detect the project, defaults, idioms, errors, testing, security pitfalls, performance, a build-error table and a review checklist, plus reference files loaded on demand.

| Install | Command | Covers |
|---|---|---|
| `artel-python@artel` | `/artel-python:python` | uv/poetry/pip, typing, pytest, Django, FastAPI, Flask |
| `artel-typescript@artel` | `/artel-typescript:typescript` | Node, React, Next.js, Vue, Angular, Svelte, Express/Nest |
| `artel-go@artel` | `/artel-go:go` | modules, concurrency, testing, net/http, gRPC |
| `artel-rust@artel` | `/artel-rust:rust` | cargo, ownership, async, unsafe review, axum |
| `artel-jvm@artel` | `/artel-jvm:jvm` | Java, Kotlin, Gradle/Maven, Spring Boot, Android |
| `artel-dotnet@artel` | `/artel-dotnet:dotnet` | C#, ASP.NET Core, EF Core |
| `artel-php@artel` | `/artel-php:php` | Composer, Laravel, Symfony |
| `artel-ruby@artel` | `/artel-ruby:ruby` | Bundler, Rails, RSpec |
| `artel-swift@artel` | `/artel-swift:swift` | SwiftPM/Xcode, SwiftUI, concurrency |
| `artel-flutter@artel` | `/artel-flutter:flutter` | Dart, state management, widget tests |
| `artel-cpp@artel` | `/artel-cpp:cpp` | CMake, sanitizers, linker errors |
| `artel-data@artel` | `/artel-data:data` | SQL, schema design, safe migrations, Redis |
| `artel-devops@artel` | `/artel-devops:devops` | Docker, Kubernetes, Terraform, Actions hardening |
| `artel-web@artel` | `/artel-web:landing-page`, `/artel-web:seo-audit`, `/artel-web:telegram-bot` | agents `web-builder`, `bot-builder` |
| `artel-content@artel` | `/artel-content:reel-script`, `/artel-content:youtube-script`, `/artel-content:unit-economics` | agents `content-producer`, `business-analyst` |

## The leak guard

The core installs a hook that runs before every `git commit` and `git push`:

- **blocks** when the change contains an API key, token, private key or `.env`/key file;
- **asks** on password-like values (in code, config, URLs, JWTs), on `--force` pushes to `main`/`master`, and on changes over 20 MB it could not fully scan;
- understands `cd dir && git commit`, quoting, `bash -c`, git aliases, pushing another branch or tag, and `gh repo create --push`;
- never modifies the repository and never sends anything anywhere;
- fails open: if something goes wrong, it gets out of the way.

It detects AWS, GitHub, Anthropic, OpenAI, Google, Slack, Stripe and other keys, bot tokens, private keys, and files such as `.env`, `.pem` and `id_rsa`.

- False positive: add the comment `artel:allow` to that line.
- Disable: start Claude Code with the environment variable `ARTEL_GUARD=off` (or set it in `env` in Claude Code settings). Setting it inside a command deliberately does not work.
- Scan a whole repo including history: `/artel:secure-publish`, or `node plugins/artel/hooks/scripts/scan-secrets.mjs --history <repo>`.
- It is a safety net, not a guarantee — see [SECURITY.md](SECURITY.md). Also enable GitHub secret scanning with push protection.

Requires **Node.js 18+**. Without Node the guard is silently inactive; everything else works.

## Uninstall

```
/plugin uninstall artel@artel
/plugin marketplace remove artel
```

## In the Claude app (claude.ai)

Skills are compatible with the Claude app. Build ZIP archives with `python3 tools/package_skills.py` (all skills) or `python3 tools/package_skills.py python`, then upload in Claude's settings. Agents and the guard work only in Claude Code.

## Contributing

```bash
npm run validate   # structure, frontmatter, budgets, documentation coverage
npm test           # guard and scanner tests
npm run scan       # secrets in files and history
claude plugin validate . --strict
```

New stack pack? See [docs/STACK_PACK_GUIDE.md](docs/STACK_PACK_GUIDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Note

The agents assist; they do not replace a professional. Check legal, tax and security-critical conclusions yourself, and anonymise personal data before sending it to any AI service. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
