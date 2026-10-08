# Python review checklist

Mark each finding with severity: **blocker** (security, data loss, broken behaviour), **major** (bug risk, missing tests), **minor** (style, naming). Quote the line and propose the fix.

## Project and dependencies
- [ ] Dependencies changed only through the project's tool (uv/Poetry/PDM/pip-tools); lockfile updated in the same change.
- [ ] New dependency is maintained, licensed compatibly, not a typosquat, and actually needed.
- [ ] Library code declares ranges, not exact pins; application code is locked.
- [ ] No syntax or stdlib API newer than `requires-python`.

## Correctness
- [ ] No mutable default arguments; no shared module-level mutable state mutated per request.
- [ ] `is None` checks; `Optional` values narrowed before use.
- [ ] Timezone-aware datetimes; `Decimal` for money.
- [ ] Files opened with `encoding=` and context managers.
- [ ] Integer division, rounding and float comparisons are deliberate.
- [ ] Iterators/generators are not consumed twice by accident.
- [ ] `async def` never calls blocking I/O; every coroutine is awaited; created tasks are kept and their exceptions observed.
- [ ] Concurrency has limits (semaphore, pool size) and timeouts.

## Types and style
- [ ] Public functions and methods annotated; no `Any` leaking into public APIs.
- [ ] Type checker and `ruff check` / `ruff format --check` (or the project's tools) pass.
- [ ] No new `# type: ignore` / `# noqa` without a specific code and reason.
- [ ] Names say what things are; functions do one thing; no dead code or commented-out blocks.

## Errors and logging
- [ ] No bare `except:`; broad `except Exception` only at boundaries and logged.
- [ ] `raise ... from err` when wrapping.
- [ ] Domain errors are exception classes, not magic strings or return codes.
- [ ] Logging via module logger with lazy `%s` args; no `print` in library/service code.
- [ ] No secrets, tokens, passwords or personal data in logs or error messages.

## Security
- [ ] SQL through ORM or bound parameters; identifiers whitelisted.
- [ ] No `pickle`/`yaml.load`/`eval`/`exec`/`torch.load` without `weights_only` on untrusted data.
- [ ] `subprocess` with argument lists, no `shell=True` with input; `--` before user positional args.
- [ ] User-controlled paths checked for containment; archives extracted safely.
- [ ] Outbound requests to user URLs protected against SSRF; all HTTP calls have timeouts.
- [ ] Django: `DEBUG` off, `ALLOWED_HOSTS` set, `SECRET_KEY` from env, CSRF intact, queries scoped to the user.
- [ ] Templates keep autoescaping; `mark_safe`/`|safe` justified.
- [ ] Secrets from env/secret manager; `.env` ignored; `.env.example` updated.
- [ ] `pip-audit` clean or findings triaged.

## Performance
- [ ] No N+1 queries (check loops over querysets/relationships); bulk operations for batches.
- [ ] Large data streamed or paginated, not loaded fully.
- [ ] HTTP clients / DB connections reused.
- [ ] Hot paths measured (cProfile, py-spy) before being "optimised".

## Tests
- [ ] New behaviour and bug fixes have tests; the bug test fails without the fix.
- [ ] Error paths and edge cases (empty, unicode, limits, time zones) covered.
- [ ] Parametrize instead of copy-pasted tests; fixtures not wider-scoped than safe.
- [ ] Mocks patch where names are looked up; external services mocked at the transport layer.
- [ ] Tests are independent of order and wall-clock time.
- [ ] The command that runs the suite was run and is green.

## Migrations and data (Django / Alembic)
- [ ] Migration generated and committed with the model change.
- [ ] Safe on a populated table: no long locks, defaults for new non-null columns, data migrations reversible or explicitly irreversible.
- [ ] Deploy order considered (code tolerant of both schemas during rollout).
