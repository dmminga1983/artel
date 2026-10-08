# Safe migrations — recipes

Reference for the `data` skill. Goal: every step is safe while the **old and new application versions run at the same time** (rolling deploys, canaries, workers lagging behind), takes only brief locks, and can be undone. Review each migration with [migration-review-checklist.md](migration-review-checklist.md).

## Ground rules

1. Never edit, reorder or delete a migration that has run in any shared environment. Fix forward with a new migration.
2. One logical change per migration; schema changes and large data changes in separate migrations (and often separate deploys).
3. Don't import application models into migrations — they will change. Use plain SQL or the tool's migration-local schema API.
4. Write the down migration, or mark the migration irreversible with the reason. A `down` that drops a column full of data is not a real rollback: the rollback plan is "restore from backup" or "keep the column until the next release".
5. Run migrations from CI/CD with a dedicated role, not from a laptop. Running them before or after the code deploy is part of the expand/contract plan.
6. Test on a copy with production-like size; record how long each step takes and what locks it takes.

## Expand → migrate → contract

Example: rename `users.fullname` to `users.display_name`.

| Release | Schema | Code |
|---|---|---|
| 1 (expand) | add `display_name` nullable | write both columns, read old |
| — | backfill `display_name` from `fullname` in batches | — |
| 2 | (optional) add `NOT NULL` safely | read new, still write both |
| 3 | — | read and write only new |
| 4 (contract) | drop `fullname` | — |

Each release can be rolled back to the previous one without schema changes. The same pattern covers type changes (new column of the new type), splitting tables, and moving data between services. ORMs that cache column lists (e.g. Rails) need the column ignored in code one release before it is dropped.

## Lock safety in PostgreSQL

Most `ALTER TABLE` forms take an `ACCESS EXCLUSIVE` lock. Even a metadata-only change must wait for every running transaction on the table, and **while it waits, every new query on that table queues behind it** — a 1 ms DDL behind a 10-minute report is a 10-minute outage. Always:

```sql
SET lock_timeout = '3s';          -- give up quickly instead of blocking traffic
SET statement_timeout = '15min';  -- bound the step itself
-- DDL here; on lock_timeout failure, retry later (the tool or a wrapper loop)
```

Mostly safe (brief lock, no rewrite): add nullable column; add column with a non-volatile default (11+); drop column (data stays on disk until rewrite); rename column/table (but breaks running code — use expand/contract); `varchar(n)` → larger `n` or → `text`; drop `NOT NULL`; add `CHECK`/FK as `NOT VALID`; create/drop index `CONCURRENTLY`.

Dangerous on big tables: add column with a volatile default (`clock_timestamp()`, `random()`; note `now()` is stable, so it's fine); most column type changes (rewrite + exclusive lock); `SET NOT NULL` without a validated check (full scan under exclusive lock); add FK or `CHECK` without `NOT VALID` (scan under lock); `CREATE INDEX` without `CONCURRENTLY` (blocks writes); `VACUUM FULL`, `CLUSTER` (rewrite under exclusive lock); add `PRIMARY KEY`/`UNIQUE` constraint directly (builds index under lock — build the index concurrently first, then `ADD CONSTRAINT … USING INDEX`).

## Recipe: add a NOT NULL column (PostgreSQL)

```sql
-- 1. expand (fast): nullable, or with a constant default
ALTER TABLE orders ADD COLUMN currency text;
-- or: ALTER TABLE orders ADD COLUMN currency text NOT NULL DEFAULT 'EUR';  -- metadata-only on 11+, done in one step

-- 2. deploy code that writes currency for new rows

-- 3. backfill in batches (see below)

-- 4. enforce without a long exclusive lock
ALTER TABLE orders ADD CONSTRAINT orders_currency_not_null CHECK (currency IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_currency_not_null;   -- scans, but only SHARE UPDATE EXCLUSIVE
ALTER TABLE orders ALTER COLUMN currency SET NOT NULL;              -- 12+: uses the valid CHECK, no scan
ALTER TABLE orders DROP CONSTRAINT orders_currency_not_null;
```

## Recipe: add a foreign key (PostgreSQL)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);
ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_fkey;
```

## Recipe: create an index without blocking writes

PostgreSQL:

```sql
-- cannot run inside a transaction block: disable the tool's per-migration transaction
--   (Rails: disable_ddl_transaction! + algorithm: :concurrently; Django: atomic = False or AddIndexConcurrently;
--    Alembic: op.get_context().autocommit_block(); other tools: check their non-transactional migration option)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_status_created_idx ON orders (status, created_at);

-- if it fails it leaves an INVALID index; find and remove it, then retry:
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
DROP INDEX CONCURRENTLY IF EXISTS orders_status_created_idx;
```

Unique constraint without a blocking build:

```sql
CREATE UNIQUE INDEX CONCURRENTLY users_email_key_idx ON users (email);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_key_idx;
```

MySQL (InnoDB):

```sql
SET SESSION lock_wait_timeout = 5;
ALTER TABLE orders ADD INDEX orders_status_created_idx (status, created_at), ALGORITHM=INPLACE, LOCK=NONE;
```

If MySQL cannot satisfy the requested algorithm/lock it raises an error instead of falling back to a blocking copy — which is what you want. Very large tables or replicas sensitive to lag: use an online schema-change tool (`gh-ost`, `pt-online-schema-change`).

SQLite: `CREATE INDEX` locks the database for writes while it builds. Keep it in a maintenance window for large databases.

## Recipe: change a column type

Don't `ALTER COLUMN … TYPE` on a large table (rewrite under exclusive lock). Use expand/contract: new column of the new type → dual-write (in code or with a trigger) → batch backfill → switch reads → drop old. Exceptions that are metadata-only in PostgreSQL: `varchar(n)` → `varchar(m)` with `m > n`, `varchar` → `text`, and some binary-compatible casts.

## Recipe: batched backfill

```sql
-- PostgreSQL: one batch; repeat from the application/job until 0 rows updated
UPDATE orders
SET currency = 'EUR'
WHERE id IN (
  SELECT id FROM orders
  WHERE currency IS NULL
  ORDER BY id
  LIMIT 5000
  FOR UPDATE SKIP LOCKED
);
```

Or walk the primary key range so each batch is an index range scan:

```sql
UPDATE orders SET currency = 'EUR'
WHERE id >= $1 AND id < $1 + 5000 AND currency IS NULL;
```

Rules: each batch in its own short transaction; idempotent (`WHERE currency IS NULL`) so it can be resumed; sleep between batches and watch replication lag, lock waits and I/O; log progress; run as a job, not inside the deploy's migration step if it takes more than seconds. In MySQL keep batches small to avoid replica lag and huge undo logs.

## Recipe: drop a column or table

1. Release N: stop reading and writing it in code (and tell the ORM to ignore it).
2. Release N+1: drop it. Take a backup or keep a renamed copy (`ALTER TABLE x RENAME TO x_deprecated_2026`) for a while if the data might be needed.

Dropping is irreversible for the data — label it clearly in the migration and the PR.

## Recipe: rename a table

Expand/contract, or in PostgreSQL rename and leave a compatibility view (`CREATE VIEW old_name AS SELECT * FROM new_name;` — simple views are auto-updatable) until all code uses the new name.

## Enums

- PostgreSQL native enum: `ALTER TYPE … ADD VALUE` is cheap (on 12+ it can run in a transaction, but the new value cannot be used in that same transaction); removing or renaming values is hard. A lookup table or `CHECK (status IN (…))` is easier to evolve (`NOT VALID` + `VALIDATE` when tightening).
- MySQL `ENUM`: appending a value at the end is usually `INSTANT`/in-place; reordering or removing rebuilds the table.

## Data migrations

- Deterministic and idempotent; safe to re-run.
- Don't call external services from migrations.
- For huge transforms, ship a background job with progress tracking instead of a migration file, and gate the contract step on its completion.

## Zero-downtime deploy ordering

- **Additive schema changes:** migrate first, then deploy code.
- **Removals:** deploy code that no longer uses the thing, then migrate.
- **Never** deploy code that requires a column the database might not have yet, or remove a column that running code still selects (ORM `SELECT *` with cached column lists will fail).

## Rollback

- Before running: know the rollback for code (previous image), config, and schema (down migration, or "leave expanded schema in place — it is backward-compatible").
- Prefer fix-forward for data changes; rollback via restore loses writes made since the backup.
- After a failed `CONCURRENTLY` or partially applied non-transactional migration (MySQL DDL is non-transactional), check the actual schema state before retrying.
