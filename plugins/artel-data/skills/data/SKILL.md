---
name: data
description: Relational databases and data safety — schema design, SQL (joins, CTEs, window functions, transactions, locking), PostgreSQL/MySQL/SQLite, indexes and EXPLAIN, ORM and N+1 pitfalls, safe zero-downtime migrations, backups, pooling, Redis caching, PII. Use for SQL, schemas, migrations, slow queries; "база данных", "миграция", "запрос".
paths: "**/*.sql, **/migrations/**, **/migrate/**, **/db/**, **/schema.prisma, **/alembic.ini, **/redis*.conf"
---

Reply in the user's language.

Data outlives code: a bad deploy is rolled back in minutes, a bad migration or lost backup can be permanent. Prefer boring, reversible, measured changes.

## 1. Detect the project

Read before writing anything:
- **Engine and version** — `docker-compose*.yml`/`compose.yaml` image tags, connection URLs in `.env.example`, IaC, `SELECT version();`. Behaviour differs a lot between versions (see [dialects.md](dialects.md)).
- **Migration tool** — `migrations/`, `alembic/`, `db/migrate/`, `prisma/migrations/`, Flyway/Liquibase/goose/sqlx/Knex/Django/EF Core folders. Use the tool; never apply ad-hoc DDL to shared environments.
- **ORM / query layer** and the driver's placeholder style.
- **Schema source of truth** — `schema.sql`, `structure.sql`, `schema.prisma`, models.
- **Pooler** (PgBouncer, RDS Proxy, built-in pool settings) and **cache** (Redis or a compatible server).

Rule: *follow the project's existing conventions (naming, migration tool, ORM) over these defaults.*

## 2. Defaults for new work

- PostgreSQL for new server-side apps; SQLite for embedded, local-first, tests of SQLite apps and small single-writer services. Check the current supported major version rather than assuming one.
- Surrogate primary key: `bigint GENERATED ALWAYS AS IDENTITY` (PostgreSQL), `BIGINT AUTO_INCREMENT` (MySQL), `INTEGER PRIMARY KEY` (SQLite). Use UUIDs when IDs are created client-side or exposed publicly; prefer time-ordered UUIDs (v7) for index locality.
- Timestamps in UTC: `timestamptz` (PostgreSQL), `DATETIME(6)` stored as UTC (MySQL), ISO-8601 text or integer epoch (SQLite). Columns `created_at`, `updated_at`.
- Money and exact quantities: `numeric`/`DECIMAL`, or integer minor units — never float.
- Text encoding: UTF-8 everywhere; in MySQL that means `utf8mb4`, not `utf8`.
- Migrations: versioned files, one logical change each, applied by CI/CD, reviewed like code.

## 3. Schema design

- **Every table has a primary key.** Natural keys (email, SKU) get a `UNIQUE` constraint, not the PK role, because they change.
- **Constraints are documentation the database enforces:** `NOT NULL` by default, `FOREIGN KEY` with an explicit `ON DELETE` choice, `UNIQUE`, `CHECK` for enums/ranges. Application validation is a UX layer, not integrity.
- **Index every foreign key column** you join or cascade on (PostgreSQL and SQLite do not create them automatically; InnoDB does).
- **Normalise to 3NF first;** denormalise deliberately for a measured read path, and write down who keeps the copy in sync (trigger, job, or same transaction).
- **Naming:** `snake_case`, consistent singular or plural tables, `<referenced>_id` for FKs, `is_`/`has_` booleans, `_at` timestamps, named constraints/indexes (`orders_customer_id_fkey`, `orders_status_idx`) so migrations can reference them. Avoid reserved words (`user`, `order`, `group`).
- **Enums:** a lookup table or a `CHECK` constraint is easier to evolve than a native enum type.
- **Soft delete** (`deleted_at`) complicates every unique constraint and query — use partial unique indexes or an archive table, and only when there is a real requirement.
- **JSON columns** for genuinely schemaless attributes, not to avoid modelling; anything you filter, join or constrain on belongs in a column.
- **Multi-tenant:** `tenant_id` on every tenant-owned table, in composite keys and indexes; consider PostgreSQL row-level security as a second line of defence.

## 4. SQL idioms

- **Parameterised queries, always.** Values go through driver placeholders (`?`, `%s`, `:name`, or PostgreSQL's numbered dollar placeholders). Never build SQL with string concatenation, f-strings or template literals. Identifiers (table/column names, sort direction) cannot be parameters — map them through an allow-list. Examples per driver: [sql.md](sql.md).
- Name columns explicitly; no `SELECT *` in application code.
- Know `NULL`: `NOT IN (subquery)` with a NULL returns no rows — use `NOT EXISTS`. `NULL = NULL` is not true; use `IS [NOT] DISTINCT FROM` (PostgreSQL, SQLite has `IS`).
- Prefer `EXISTS` over `COUNT(*) > 0`; keyset pagination (`WHERE (created_at, id) < (…) ORDER BY … LIMIT n`) over large `OFFSET`.
- CTEs (`WITH`) for readability and recursion; window functions (`ROW_NUMBER`, `LAG`, `SUM() OVER`) for top-N-per-group, running totals and dedup — instead of self-joins or app-side loops.
- Upserts with the engine's native syntax (`ON CONFLICT`, `ON DUPLICATE KEY UPDATE`) backed by a unique constraint, never "select then insert".
- Batch writes: multi-row `INSERT`, `COPY`/`LOAD DATA` for bulk loads, chunked updates (see migrations).

## 5. Transactions, isolation and locking

- One business operation = one transaction; keep it short. **No network calls, user waits or file uploads inside a transaction.**
- Defaults: PostgreSQL `READ COMMITTED`, MySQL InnoDB `REPEATABLE READ`, SQLite serializable (single writer). Read-modify-write under `READ COMMITTED` loses updates — use `SELECT … FOR UPDATE`, an atomic `UPDATE … SET x = x + 1`, optimistic locking (`version` column) or `SERIALIZABLE`.
- Under `REPEATABLE READ`/`SERIALIZABLE` the engine may abort with a serialization failure or deadlock — **retry the whole transaction** with backoff; the code must be idempotent.
- Lock rows in a consistent order to avoid deadlocks. Job queues: `FOR UPDATE SKIP LOCKED`.
- External side effects (emails, messages) after commit, or via an outbox table written in the same transaction.
- Details and per-engine behaviour: [sql.md](sql.md) → *Transactions and locking*.

## 6. Indexes and EXPLAIN

- Add an index for a query you have, not one you imagine. Composite index column order: equality columns first, then range/sort columns. A covering index (`INCLUDE` in PostgreSQL) avoids table lookups.
- Partial indexes (`WHERE deleted_at IS NULL`) and expression indexes (`lower(email)`) where supported.
- Every index slows writes and costs space; drop unused ones (PostgreSQL: `pg_stat_user_indexes.idx_scan`).
- Read the plan: PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)`, MySQL `EXPLAIN ANALYZE` / `EXPLAIN FORMAT=TREE`, SQLite `EXPLAIN QUERY PLAN`. **`EXPLAIN ANALYZE` executes the statement** — for writes wrap it in `BEGIN; … ROLLBACK;` and never run it against production without thought. How to read plans: [sql.md](sql.md) → *Reading EXPLAIN*.
- Red flags: sequential/full scan on a large table with a selective filter, estimated vs actual rows off by 10×+ (stale statistics → `ANALYZE`), nested loop over many outer rows, sort spilling to disk, functions on indexed columns (`WHERE date(created_at) = …`), leading-wildcard `LIKE '%x'`, implicit casts.

## 7. ORMs and N+1

- N+1: one query for a list, then one per row for a relation. Detect by logging SQL in tests/dev and counting queries per request; fix with eager loading (`select_related`/`prefetch_related`, `includes`, `Include`, `JOIN FETCH`, `with`, Prisma `include`) or a single join/`IN` query.
- Load only needed columns; paginate; stream large results instead of materialising them.
- Know when the ORM opens transactions and when lazy loading hits the database after the session closed.
- Raw SQL escape hatches (`raw()`, `text()`, `$queryRawUnsafe`, `FromSqlRaw`) still need bound parameters.
- Framework specifics live in the language packs: `/artel-python:python`, `/artel-typescript:typescript`, `/artel-jvm:jvm`, `/artel-ruby:ruby`, `/artel-php:php`, `/artel-dotnet:dotnet`, `/artel-go:go`.

## 8. Safe migrations

The running application version and the new one must both work against the schema at every step. Full recipes with SQL: [migrations.md](migrations.md). Review with [migration-review-checklist.md](migration-review-checklist.md).

1. **Expand → migrate → contract.** Add new structures (nullable column, new table, new index) → deploy code that writes both / reads new → backfill → deploy code that uses only the new → remove the old in a later release. Renames and type changes are always done this way, never in place.
2. **Never edit a migration that has been applied anywhere shared.** Write a new one.
3. **Every migration is reversible** or explicitly marked irreversible with the reason and a restore plan (data-destroying `DROP`s cannot really be reversed — take a backup).
4. **Adding a NOT NULL column:** add it nullable or with a constant default (metadata-only in PostgreSQL 11+ and MySQL 8.0 `INSTANT`), backfill in batches, then enforce `NOT NULL` (in PostgreSQL via a `CHECK … NOT VALID` + `VALIDATE` first to avoid a long exclusive lock).
5. **Avoid long locks:** set `lock_timeout` (PostgreSQL) / `lock_wait_timeout` (MySQL) so DDL fails fast instead of queuing every query behind it; retry. Know which operations rewrite the table (most type changes, volatile defaults).
6. **Create indexes without blocking writes:** `CREATE INDEX CONCURRENTLY` (PostgreSQL, outside a transaction), InnoDB online DDL `ALGORITHM=INPLACE, LOCK=NONE` (MySQL). SQLite has no online DDL — keep tables small or schedule downtime.
7. **Backfills in batches** (e.g. 1–10k rows by primary-key range), each in its own short transaction, idempotent, resumable, throttled; never one giant `UPDATE`.
8. **Foreign keys and constraints on big tables:** add as `NOT VALID`, then `VALIDATE CONSTRAINT` (PostgreSQL).
9. **Separate schema and data migrations;** don't import application models in migrations (they change later).
10. Test on a production-sized copy, measure duration, and take a backup before destructive steps.

## 9. Backups and restore

- A backup that has never been restored is a hope. **Schedule restore tests** into a scratch environment and check row counts and app smoke tests.
- PostgreSQL: physical base backups plus WAL archiving for point-in-time recovery (managed services do this — verify retention); `pg_dump -Fc` for logical copies. MySQL: physical backup tools or binlog-based PITR; `mysqldump --single-transaction` for InnoDB logical dumps. SQLite: `.backup` or `VACUUM INTO` — never copy the file while it is being written.
- Keep backups encrypted, off the primary account/region, with retention that matches requirements; know your RPO/RTO.
- Before any destructive change in production: fresh backup, confirmed restorable.

## 10. Connections and pooling

- Each PostgreSQL connection is a process; use an app-side pool sized to what the database can serve (often tens, not hundreds) and a server-side pooler (PgBouncer, RDS Proxy) for many app instances or serverless.
- PgBouncer **transaction** pooling breaks session state: session `SET`, session advisory locks, `LISTEN`, temp tables, and (on older versions) prepared statements. Use `SET LOCAL`, transaction-level locks, or session pooling for those clients.
- Set connect, statement and idle-in-transaction timeouts; return connections promptly; close result sets.
- SQLite: one writer at a time — enable WAL mode and a busy timeout, keep write transactions short.

## 11. Redis

- Use the right type: strings (with `SET key value EX seconds NX` for locks/flags), hashes (objects), sorted sets (leaderboards, rate windows), lists/streams (queues), sets (membership). Details: [redis.md](redis.md).
- **Every cache key gets a TTL**; namespace keys (`app:v2:user:42`), version the prefix when the format changes.
- Cache-aside: read cache → on miss read DB, then set with TTL. On write: commit to DB, then delete the key. Protect hot keys from stampedes (single-flight lock or early refresh with jitter).
- **Not a primary store** unless persistence (AOF/RDB), replication and `maxmemory-policy noeviction` are deliberately configured and backed up. Eviction policies silently delete data.
- Never `KEYS *` in production — use `SCAN`. Avoid huge keys and unbounded collections.
- Require auth and TLS, never expose the port publicly, disable or rename dangerous commands where possible.

## 12. Data privacy

- **Minimise:** collect only what a feature needs; don't log PII, tokens or full payloads; mask in non-production copies (no raw production dumps on laptops).
- **Retention:** every PII table has a documented retention and a deletion job; deletion requests must reach backups' retention horizon, replicas, caches, search indexes and analytics.
- **Encryption:** TLS in transit with certificate verification (e.g. `sslmode=verify-full` in libpq clients); encryption at rest (disk/managed service); application-level encryption or hashing for especially sensitive fields; passwords only with a password-hashing function (Argon2id, bcrypt, scrypt), never reversible encryption.
- Least privilege: the app's database role owns no schema, cannot `DROP`, and migrations run as a separate role.

## 13. Testing

- Run tests against the **same engine and major version** as production (containers, e.g. Testcontainers or Compose), not SQLite standing in for PostgreSQL.
- Isolate tests with a transaction rolled back per test, or truncate between tests; build data with factories, not shared fixtures.
- Test migrations: apply from empty, apply on a snapshot of the previous release, and run the down migration where one exists.
- Assert query counts on critical endpoints to catch N+1 regressions.

## 14. Security pitfalls

- SQL injection through concatenated values, dynamic `ORDER BY`/column names, `LIKE` patterns, and ORM raw-SQL helpers.
- Connection strings and passwords in code or committed files — keep them in environment/secret stores, with `.env.example` placeholders only.
- Overprivileged roles (app as superuser/`root`), databases or Redis reachable from the internet, default credentials.
- Mass assignment: ORM models updated straight from request bodies.
- Unencrypted backups and verbose errors leaking SQL or schema to clients.

## 15. Performance pitfalls

N+1 queries; missing FK indexes; `OFFSET` pagination on large tables; `SELECT *` pulling large columns; long transactions blocking vacuum (PostgreSQL bloat) or purge (InnoDB history list); one giant `UPDATE`/`DELETE`; chatty per-row writes instead of batches; cache without TTL or invalidation; too many connections.

## 16. Errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `deadlock detected` / `Deadlock found` | Rows locked in different orders | Consistent lock order, shorter transactions, retry |
| `could not serialize access` (SQLSTATE 40001) | Concurrent conflict under REPEATABLE READ/SERIALIZABLE | Retry the whole transaction |
| Migration hangs, then everything times out | DDL waiting for a lock and queueing all queries behind it | Kill it; set `lock_timeout`; find the long transaction (`pg_stat_activity`) |
| `too many connections` / `remaining connection slots are reserved` | Pool too large × instances, leaked connections | Smaller pools, server-side pooler, fix leaks |
| `database is locked` (SQLite) | Concurrent writers, long write transaction | WAL mode, busy timeout, short writes, one writer |
| `duplicate key value violates unique constraint` on insert | Race in select-then-insert, or sequence behind after manual import | Native upsert; reset the sequence to the max id |
| `prepared statement … does not exist` | Transaction pooler with session prepared statements | Pooler prepared-statement support, or disable driver-side prepares |
| Query fast in dev, slow in prod | Different data distribution, stale stats, missing index | `EXPLAIN ANALYZE` on prod-like data, `ANALYZE`, index |
| Index build left `INVALID` | `CREATE INDEX CONCURRENTLY` failed | `DROP INDEX CONCURRENTLY`, then rebuild |
| `Incorrect string value` (MySQL) | `utf8` (3-byte) column with emoji | Convert to `utf8mb4` |

## 17. Review checklist

- [ ] Values parameterised; identifiers allow-listed.
- [ ] Keys, `NOT NULL`, FKs, uniques and checks express the invariants; FK columns indexed.
- [ ] Transactions short, no I/O inside; retries for serialization failures; upserts native.
- [ ] New queries checked with `EXPLAIN` on realistic data; no N+1.
- [ ] Migrations: expand/contract, no edits to applied files, reversible or justified, lock-safe, batched backfills — full list in [migration-review-checklist.md](migration-review-checklist.md).
- [ ] Backups exist and a restore was tested recently.
- [ ] Cache keys have TTLs and invalidation; Redis not used as an unconfigured primary store.
- [ ] PII minimised, not logged, encrypted in transit and at rest, retention defined.
