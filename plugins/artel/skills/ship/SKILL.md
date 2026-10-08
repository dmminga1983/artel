---
name: ship
description: Release and deploy checklist — tests and build green, version and changelog, secrets and config, migrations, rollback plan, deploy, smoke test, monitoring. Use before releasing or deploying, or when the user says "release", "deploy", "ship it", "выкатить", "релиз", "задеплоить".
argument-hint: "[version or environment]"
---

# Ship / Релиз и деплой

Target: $ARGUMENTS

Reply in the user's language. Deploying, publishing packages and running production migrations are irreversible or visible to others — confirm with the user before each of them.

## Gate (all must pass)

1. Default branch up to date; working tree clean.
2. Full test suite, linters, type checks and production build pass — show the output.
3. `/artel:secure-publish` checks pass (no secrets, safe CI).
4. Dependencies: no known critical vulnerabilities (`npm audit`, `pip-audit`, `cargo audit`, …).
5. Config: every new environment variable is documented and set in the target environment.
6. Database migrations: reviewed, backwards-compatible with the running version, tested on a copy; backup taken.

## Release

7. Version bump following the project's scheme (SemVer by default) and a `CHANGELOG.md` entry written for users.
8. Tag and release notes.

## Deploy

9. **Rollback plan written down first:** how to revert the code, the config and the migration.
10. Deploy with the project's own pipeline; avoid manual hot-fixes on servers.
11. Smoke test the critical paths in the target environment.
12. Watch errors, latency and logs for a while; say what you checked.

## Report

Each gate item with evidence, what was released, where, and how to roll back.
