# Changelog

## 0.1.0 — 2026-10-08

First release.

- 14 agents: planner, architect, verifier, code-reviewer, security-auditor, test-engineer, debugger, researcher, docs-writer, web-builder, bot-builder, content-producer, business-analyst, claims-analyst.
- 20 skills across work quality, security, websites and bots, content and business, construction claims.
- Guard hook: blocks commits/pushes with secrets or sensitive files; asks on possible hard-coded secrets and force-push to main/master.
- `scan-secrets.mjs`: repository and history secret scanner.
- Validator, tests, CI on Linux/Windows/macOS with pinned actions and read-only permissions.
- Bilingual README (RU/EN); skill packaging for the Claude app.
