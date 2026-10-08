# Changelog

## 1.0.0 — 2026-10-08

Artel becomes a universal marketplace.

- Core `artel`: 12 agents (planner, architect, verifier, code-reviewer, security-auditor, test-engineer, debugger, build-fixer, refactorer, performance-engineer, researcher, docs-writer) and 16 skills; always-on cost ≈ 2.9k tokens.
- 13 stack packs, one skill each with reference files: Python, TypeScript, Go, Rust, JVM, .NET, PHP, Ruby, Swift, Flutter, C/C++, data, DevOps.
- `artel-web` and `artel-content` packs (websites, bots, video scripts, unit economics).
- Guard hook moved into the core plugin (`plugins/artel/hooks`).
- Removed domain-specific skills; the project is no longer tied to one profession.
- Validator enforces context budgets and documentation coverage; stack pack authoring guide.

## 0.1.0 — 2026-10-08

First release (single plugin).
