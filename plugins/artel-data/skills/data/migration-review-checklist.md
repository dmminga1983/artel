# Migration review checklist

Use for every pull request that adds or changes a migration. Recipes for fixing findings: [migrations.md](migrations.md).

## Process

- [ ] The migration is **new** — no applied migration was edited, renamed, reordered or deleted (`git diff --stat` on the migrations folder shows only added files).
- [ ] Generated SQL was reviewed, not just the ORM/DSL code (`sqlmigrate`, `alembic upgrade --sql`, `prisma migrate diff`, `rails db:migrate` + `structure.sql` diff, or the tool's dry-run/SQL output).
- [ ] One logical change; schema change and large data change are separate.
- [ ] The schema snapshot (`schema.sql`, `structure.sql`, `schema.prisma`, model state) is updated and consistent.
- [ ] Runs in CI from an empty database **and** on top of the previous release's schema.

## Compatibility (old and new code at the same time)

- [ ] The currently deployed code keeps working after the migration runs (no dropped/renamed column or table it still uses, no new `NOT NULL` column without a default that it doesn't write).
- [ ] The new code keeps working if it starts before the migration has finished (or the deploy order is documented).
- [ ] Renames and type changes use expand → migrate → contract across releases.
- [ ] Drops happen at least one release after the code stopped using the object; the ORM is told to ignore the column first where needed.

## Locks and duration

- [ ] Each statement's lock level is known; nothing takes an exclusive lock on a large or hot table for more than a moment.
- [ ] `lock_timeout` (PostgreSQL) / `lock_wait_timeout` (MySQL) is set, and the migration can be retried safely.
- [ ] No table rewrite on a large table: no volatile default, no in-place type change, no `VACUUM FULL`.
- [ ] Indexes on existing large tables are built online (`CONCURRENTLY` outside a transaction in PostgreSQL; `ALGORITHM=INPLACE, LOCK=NONE` in MySQL), and a failed build's `INVALID` index is handled.
- [ ] New FKs/`CHECK`s on existing tables use `NOT VALID` + `VALIDATE CONSTRAINT` (PostgreSQL); `NOT NULL` is enforced via a validated check first.
- [ ] Duration was measured on production-sized data, or the table is known to be small.

## Data

- [ ] Backfills are batched, idempotent, resumable, throttled and run outside the deploy-blocking migration step when long.
- [ ] Data transformations are deterministic; no calls to external services; no use of current application models.
- [ ] Defaults and backfilled values are correct for existing rows (timezones, currencies, NULL vs empty string).
- [ ] Destructive operations (`DROP`, `TRUNCATE`, `DELETE` without a narrow `WHERE`, lossy type changes) are labelled, approved, and preceded by a verified backup.

## Integrity and design

- [ ] New columns have the right type, nullability, default and constraints; names follow project conventions; constraints and indexes are explicitly named.
- [ ] New FK columns are indexed (PostgreSQL/SQLite).
- [ ] Unique constraints account for soft-deleted rows and NULLs.
- [ ] No unnecessary index; new indexes match real queries (column order checked).
- [ ] SQLite: table rebuilds keep foreign keys, indexes and triggers, and `PRAGMA foreign_key_check` passes.

## Reversibility

- [ ] `down` exists and was run once, or the migration is marked irreversible with the reason.
- [ ] The rollback plan for the release (code, config, schema) is written in the PR.

## Security and privacy

- [ ] No secrets, real customer data or production dumps in migration files or fixtures.
- [ ] New PII columns are justified, documented with retention, and encrypted/hashed where needed; not added to logs or analytics exports by default.
- [ ] Grants follow least privilege: the app role gets only the privileges it needs on new objects; no `GRANT ALL`.
- [ ] Row-level security policies (if used) cover new tables.

## After deploy

- [ ] Migration status checked in each environment; no lingering locks or `INVALID` indexes.
- [ ] Error rate, latency and replication lag watched during and after the change.
