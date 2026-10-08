# PHP review checklist

Use with the `code-reviewer` agent. Report findings as *file:line — problem — fix*, most severe first.

## Correctness and types
- [ ] `declare(strict_types=1);` in new/changed files.
- [ ] Parameter, return and property types present; nullable only where null is meaningful.
- [ ] No loose comparisons (`==`, `in_array` without `true`) where types can differ.
- [ ] Enums/`match` instead of magic strings and fallthrough `switch`.
- [ ] No dynamic properties; no `@` error suppression; no empty `catch`.
- [ ] Dates are `DateTimeImmutable`; time zones explicit; time injected in testable code.
- [ ] Money as integers (minor units) or a decimal library — never floats.

## Design
- [ ] Dependencies injected via constructor; no service locator/static facades inside domain code (Laravel facades are fine in controllers/glue if the project uses them).
- [ ] DTOs/value objects instead of associative arrays crossing layers.
- [ ] Controllers thin; business logic in services/actions; DB writes that belong together in a transaction.

## Security
- [ ] No string-built SQL/DQL; `*Raw` methods use bindings; sort/column inputs allowlisted.
- [ ] Output escaped for its context; every `{!! !!}` / `|raw` justified.
- [ ] CSRF protection intact; webhooks verify signatures.
- [ ] Mass assignment allowlisted; `validated()` data only; privileged fields set explicitly.
- [ ] Object-level authorization (policy/voter) on every read/write by ID.
- [ ] Uploads: size/type validated, generated names, private storage.
- [ ] No `unserialize`, `eval`, `extract`, shell calls or `include` on input.
- [ ] Tokens via `random_bytes`; passwords via `password_hash`; secret comparison via `hash_equals`.
- [ ] No secrets in code, config or logs; `.env` not committed; `env()` only in config files (Laravel).
- [ ] `composer audit` clean; lockfile changes expected.

## Data and performance
- [ ] No queries in loops (eager loading / fetch joins); counts via `withCount`/aggregate queries.
- [ ] Unbounded queries paginated or chunked.
- [ ] Migrations reversible, safe on large tables (no long locks; add nullable column → backfill → constraint), reviewed SQL.
- [ ] Indexes for new foreign keys and filter columns.
- [ ] Slow/external work moved to queues; jobs idempotent with retries/timeouts; dispatched after commit.
- [ ] Caches invalidated when the data they hold changes.

## Tests and tooling
- [ ] Tests for new behaviour and the bug being fixed; edge cases (empty, limits, unicode).
- [ ] No real network or shared DB in tests; HTTP faked.
- [ ] PHPStan/Psalm pass at the project level without new baseline entries or ignores.
- [ ] Code style tool (PHP-CS-Fixer/Pint/PHPCS) passes.
