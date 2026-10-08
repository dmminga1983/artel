# Artel

**Artel is a team of AI agents and skills for Claude Code.** It plans, builds, verifies and publishes safely: code, websites, Telegram bots, video content, business math and construction expert-report review. It speaks Russian and English.

[Русская версия →](README.md)

```
/plugin marketplace add dmminga1983/artel
/plugin install artel@artel
```

After installing, type `/artel:start`. Artel asks what you want to do and points you to the right first step.

*Artel* (артель) is a Russian word for a cooperative team of craftsmen.

---

## How Artel differs

Artel is inspired by [ECC](https://github.com/affaan-m/ECC), a very large agent toolkit for developers, but makes different choices (ECC figures from its page as of October 2026):

| | ECC | Artel |
|---|---|---|
| Language | English | Russian and English: agents reply in the user's language, skills trigger on requests in either |
| Audience | developers | developers **and** non-coders: websites, bots, content, business, construction cases |
| Security | AgentShield configuration scanner | **a guard that is on from install**: blocks commits and pushes that contain keys, tokens or `.env` files |
| Size | ~68 agents and ~290 skills | 14 agents and 20 skills, each file readable in a couple of minutes |
| Network and money | paid tiers and referral links | no network calls, no paid actions, no ads, no telemetry |

There is also a dedicated `verifier` agent that checks finished work with fresh eyes, so the builder never grades its own work.

## The Artel loop

1. **Plan** multi-step work first (`/artel:plan-first`).
2. **Build** in small, checkable steps.
3. **Verify**: run it, open it, check it against sources (`/artel:verify-done`).
4. **Publish safely**: secret scan first, push second (`/artel:secure-publish`).

## Agents

An agent is a helper with one role and its own context. Claude delegates to it automatically when a task fits, or you can ask explicitly: "have `security-auditor` check this repo".

| Agent | What it does |
|---|---|
| `planner` | Turns a vague task into a step-by-step plan with a definition of done |
| `architect` | Chooses stack and structure; records trade-offs |
| `verifier` | Independently checks finished work: runs it, opens it, checks facts |
| `code-reviewer` | Code review ranked by severity: bugs, tests, clarity |
| `security-auditor` | Security audit: secrets in history, `.gitignore`, GitHub Actions, dependencies |
| `test-engineer` | Writes tests, test-first |
| `debugger` | Finds the root cause, not the symptom |
| `researcher` | Research with sources: every claim linked |
| `docs-writer` | Clear READMEs and instructions |
| `web-builder` | Fast, responsive, findable websites and landing pages |
| `bot-builder` | Telegram bots with safe token handling |
| `content-producer` | Reels and YouTube scripts, hooks, storyboards, content plans, AI personas |
| `business-analyst` | Unit economics, margin, payback |
| `claims-analyst` | Construction warranty cases, claims and expert reports |

## Skills

A skill is a step-by-step procedure. Call it with its command, or let Claude pick it up when your request matches.

**Work and quality**

| Command | What it does |
|---|---|
| `/artel:start` | Where to start: picks the agent or skill for your task |
| `/artel:plan-first` | Plan and definition of done before the work starts |
| `/artel:verify-done` | Verification before reporting done |
| `/artel:code-review` | Review of the current changes |
| `/artel:tdd` | Test-driven development |
| `/artel:debug` | Systematic debugging |
| `/artel:research` | Research with sources |
| `/artel:make-skill` | Create your own skill or agent |

**Security**

| Command | What it does |
|---|---|
| `/artel:secure-publish` | Secrets, `.gitignore` and Actions check before publishing to GitHub |
| `/artel:secrets-setup` | `.env`, `.env.example` and key protection setup |
| `/artel:repo-audit` | Audit someone else's repository or plugin before installing it |

**Websites and bots**

| Command | What it does |
|---|---|
| `/artel:landing-page` | Landing page from a short brief, plus a free hosting guide |
| `/artel:seo-audit` | Website audit: search, accessibility, speed, links |
| `/artel:telegram-bot` | Telegram bot with the token in `.env`, tests and 24/7 running |

**Content and business**

| Command | What it does |
|---|---|
| `/artel:reel-script` | Reel / short script: 3 hooks, second-by-second shot table |
| `/artel:youtube-script` | YouTube script: titles, thumbnails, chapters, description |
| `/artel:unit-economics` | Does the idea pay off: margin, scenarios, break-even |

**Construction and claims** (Russian legal context)

| Command | What it does |
|---|---|
| `/artel:expertise-audit` | Audit of a construction-technical expert report along the evidence chain |
| `/artel:warranty-case` | Warranty case or lawsuit analysis: what is proven, who is liable, recourse to contractors |
| `/artel:claim-letter` | Pre-trial claim, reply to a claim, demand to a contractor |

## The leak guard

Artel installs a hook that runs before every `git commit` and `git push`:

- **blocks** when the change contains an API key, bot token, private key or `.env` file;
- **asks** when it sees a password-like value (in code, config, inside a URL, a JWT), a `--force` push to `main`/`master`, or a change over 20 MB it could not fully scan;
- understands `cd dir && git commit`, quoting, `bash -c`, git aliases, pushing another branch or a tag, and `gh repo create --push`;
- never modifies the repository and never sends anything anywhere;
- fails open: if something goes wrong, it gets out of the way.

It detects AWS, GitHub, Anthropic, OpenAI, Google, Slack, Stripe and Yandex Cloud keys, Telegram bot tokens, private keys, and files such as `.env`, `.pem` and `id_rsa`.

- False positive: add the comment `artel:allow` to that line.
- Disable: start Claude Code with the environment variable `ARTEL_GUARD=off` (or put it in `env` in Claude Code settings). Setting it inside a command (`ARTEL_GUARD=off git commit`) deliberately does not work.
- Scan a whole repository including history: `/artel:secure-publish`, or from the Artel folder: `node hooks/scripts/scan-secrets.mjs --history <path to repo>`.
- It is a safety net, not a guarantee: see [SECURITY.md](SECURITY.md) for what it cannot see. Also enable GitHub secret scanning with push protection.

Requires **Node.js 18+**. Without Node the guard is silently inactive; the rest of Artel works.

## In the Claude app (claude.ai)

Skills are compatible with the Claude app. Build ZIP archives:

```bash
python3 tools/package_skills.py            # all skills → dist/*.zip
python3 tools/package_skills.py expertise-audit
```

and upload the one you need in Claude's settings, in the skills section. Agents and the guard work only in Claude Code.

## For contributors

```bash
npm run validate   # structure, frontmatter, documentation coverage
npm test           # guard and scanner tests
npm run scan       # secrets in files and history
claude plugin validate .
```

To add a skill, use `/artel:make-skill` or see [CONTRIBUTING.md](CONTRIBUTING.md).

## Note

The agents assist; they do not replace a professional. Check legal, tax and expert conclusions yourself. Anonymise personal data (names, addresses, ID numbers) before sending it to any AI service.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
