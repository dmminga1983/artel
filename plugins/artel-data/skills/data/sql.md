# SQL patterns, transactions and EXPLAIN

Reference for the `data` skill. Examples use PostgreSQL syntax unless noted; see [dialects.md](dialects.md) for differences.

## Parameterised queries by driver

The SQL text is constant; values travel separately. Placeholder styles differ by driver, not only by engine.

| Driver / library | Placeholder | Example |
|---|---|---|
| libpq, node-postgres (`pg`), pgx, asyncpg, sqlx (Postgres) | `$1, $2` | `client.query('SELECT id FROM users WHERE email = $1', [email])` |
| psycopg (2 and 3), PyMySQL, mysqlclient | `%s` or `%(name)s` | `cur.execute("SELECT id FROM users WHERE email = %s", (email,))` |
| Python `sqlite3` | `?` or `:name` | `con.execute("SELECT id FROM users WHERE email = ?", (email,))` |
| JDBC, ODBC, mysql2, Go `database/sql` with MySQL/SQLite | `?` | `ps.setString(1, email)` |
| SQLAlchemy `text()`, Doctrine DBAL, PDO | `:name` | `conn.execute(text("… WHERE email = :email"), {"email": email})` |
| ADO.NET (`Npgsql`, `SqlClient`) | `@name` | `cmd.Parameters.AddWithValue("email", email)` |

Psycopg `%s` is a driver placeholder, **not** Python `%` formatting — never write `"… %s" % value`.

### Dynamic identifiers

Placeholders cannot carry table names, column names, `ASC`/`DESC` or SQL keywords. Use an allow-list:

```python
SORTABLE = {"created_at": "created_at", "name": "name"}
col = SORTABLE.get(request_sort, "created_at")
direction = "DESC" if request_dir == "desc" else "ASC"
sql = f"SELECT id, name FROM products ORDER BY {col} {direction} LIMIT %s"
cur.execute(sql, (limit,))
```

When identifiers truly come from data (admin tools), use the driver's identifier quoting helper (e.g. `psycopg.sql.Identifier`, PostgreSQL `format('%I', …)` in PL/pgSQL).

### `IN` lists and `LIKE`

- PostgreSQL: pass an array — `WHERE id = ANY($1)` with a list parameter. Elsewhere generate one placeholder per element (`?, ?, ?`) — the count, not the values, goes into the SQL text.
- `LIKE`: the value is still a parameter, but escape `%`, `_` and the escape character in user input if they should match literally (`LIKE $1 ESCAPE '\'`).

## Joins

- `INNER JOIN` when the related row must exist; `LEFT JOIN` when optional — and put conditions on the optional table in the `ON` clause, not `WHERE`, or the left join silently becomes inner.
- Anti-join: `WHERE NOT EXISTS (SELECT 1 FROM b WHERE b.a_id = a.id)` — safe with NULLs, unlike `NOT IN`.
- Watch row multiplication: joining two one-to-many relations from the same parent multiplies rows (and inflates `SUM`/`COUNT`). Aggregate in subqueries/CTEs first, then join.

## CTEs

```sql
WITH recent_orders AS (
  SELECT customer_id, sum(total) AS spent
  FROM orders
  WHERE created_at >= now() - interval '30 days'
  GROUP BY customer_id
)
SELECT c.id, c.name, r.spent
FROM customers c
JOIN recent_orders r ON r.customer_id = c.id
ORDER BY r.spent DESC
LIMIT 20;
```

- PostgreSQL 12+ inlines side-effect-free, non-recursive CTEs referenced once; `AS MATERIALIZED` / `AS NOT MATERIALIZED` overrides that. Before 12 every CTE was an optimisation fence.
- Recursive CTEs for trees/graphs — always include a depth limit or cycle guard (`CYCLE` clause in PostgreSQL 14+, or a path array).
- Data-modifying CTEs (`WITH moved AS (DELETE … RETURNING *) INSERT … SELECT * FROM moved`) are PostgreSQL-specific.

## Window functions

```sql
-- latest order per customer
SELECT *
FROM (
  SELECT o.*, row_number() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS rn
  FROM orders o
) t
WHERE rn = 1;

-- running total and change from previous day
SELECT day,
       revenue,
       sum(revenue) OVER (ORDER BY day) AS running_total,
       revenue - lag(revenue) OVER (ORDER BY day) AS delta
FROM daily_revenue;
```

- `row_number` (unique), `rank` (gaps on ties), `dense_rank` (no gaps). Make `ORDER BY` deterministic with a tie-breaker.
- Default frame with `ORDER BY` is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — peers with equal sort keys are included together. Use `ROWS BETWEEN …` for strict row counts (moving averages).
- PostgreSQL also has `DISTINCT ON (customer_id)` for the "latest per group" case.
- Available in MySQL 8.0+ and SQLite 3.25+.

## Pagination

```sql
-- keyset: stable and O(page) regardless of depth
SELECT id, created_at, title
FROM posts
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 50;
```

Needs an index on `(created_at, id)`. Row-value comparison works in PostgreSQL, MySQL and SQLite 3.15+, but MySQL may not use the index for it — expand to `created_at < ? OR (created_at = ? AND id < ?)` there and check the plan.

## Upserts

```sql
-- PostgreSQL / SQLite 3.24+
INSERT INTO inventory (sku, qty) VALUES ($1, $2)
ON CONFLICT (sku) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty;

-- MySQL 8.0.19+ (row alias; VALUES() in this clause is deprecated)
INSERT INTO inventory (sku, qty) VALUES (?, ?) AS new
ON DUPLICATE KEY UPDATE qty = inventory.qty + new.qty;
```

The conflict target must be backed by a unique index/constraint.

## Transactions and locking

### Isolation levels

| Level | PostgreSQL | MySQL InnoDB | Anomalies prevented |
|---|---|---|---|
| READ UNCOMMITTED | behaves as READ COMMITTED | dirty reads possible | — |
| READ COMMITTED | **default**; each statement sees a fresh snapshot | per-statement snapshot; fewer gap locks | dirty reads |
| REPEATABLE READ | snapshot for the whole transaction; concurrent update → serialization error | **default**; consistent snapshot for plain reads, but locking reads/updates see latest committed rows; next-key locks | + non-repeatable reads (and phantoms for snapshot reads) |
| SERIALIZABLE | SSI: true serializability, may abort with 40001 | plain `SELECT` becomes a locking read | all |

SQLite transactions are serializable: one writer at a time. Use `BEGIN IMMEDIATE` for transactions that will write, to take the write lock up front and avoid a lock-upgrade deadlock (`SQLITE_BUSY`) halfway through.

### Lost update and how to prevent it

```sql
-- WRONG under READ COMMITTED: two requests read 10, both write 9
SELECT stock FROM products WHERE id = $1;      -- app computes stock - 1
UPDATE products SET stock = $2 WHERE id = $1;

-- Atomic update
UPDATE products SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock;

-- Pessimistic lock
BEGIN;
SELECT stock FROM products WHERE id = $1 FOR UPDATE;
UPDATE products SET stock = stock - 1 WHERE id = $1;
COMMIT;

-- Optimistic lock (0 rows updated = someone else won; reload and retry or report conflict)
UPDATE products SET stock = $2, version = version + 1 WHERE id = $1 AND version = $3;
```

### Row locks

- `FOR UPDATE` (exclusive), `FOR NO KEY UPDATE` (PostgreSQL, doesn't block FK inserts), `FOR SHARE`.
- `NOWAIT` fails immediately; `SKIP LOCKED` skips locked rows — the standard job-queue pattern (PostgreSQL 9.5+, MySQL 8.0+):

```sql
WITH job AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY run_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs SET status = 'running', started_at = now()
FROM job WHERE jobs.id = job.id
RETURNING jobs.*;
```

- Advisory/application locks: PostgreSQL `pg_advisory_xact_lock(key)` (released at commit; works with transaction poolers), `pg_advisory_lock` (session — not with transaction pooling); MySQL `GET_LOCK(name, timeout)`.

### Retry loop

Retry on serialization failure (SQLSTATE `40001`) and deadlock (`40P01` in PostgreSQL; MySQL error 1213; lock-wait timeout 1205 is retryable too) — retry the **whole transaction** a bounded number of times with jittered backoff. Never retry a transaction that already triggered an external side effect.

### Timeouts (PostgreSQL)

```sql
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
-- server or role level:
ALTER ROLE app SET idle_in_transaction_session_timeout = '60s';
```

MySQL: `max_execution_time` (SELECT only, milliseconds), `innodb_lock_wait_timeout`, `lock_wait_timeout` (metadata locks, i.e. DDL).

### Who is blocking whom (PostgreSQL)

```sql
SELECT pid, pg_blocking_pids(pid) AS blocked_by, state, now() - xact_start AS xact_age, left(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY xact_start;
```

`pg_cancel_backend(pid)` cancels the query; `pg_terminate_backend(pid)` kills the session (**destructive** for that client's open transaction). MySQL: `SHOW PROCESSLIST`, `performance_schema.data_locks`, `sys.innodb_lock_waits`, `KILL <id>`.

## Reading EXPLAIN

### PostgreSQL

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT …;          -- executes the query!
BEGIN; EXPLAIN (ANALYZE, BUFFERS) UPDATE …; ROLLBACK;   -- for writes
```

Each node shows `cost=startup..total rows=estimate width=…` and with ANALYZE `actual time=… rows=… loops=…`. Read inside-out, bottom-up. Multiply `rows` and time by `loops` for the real total.

| You see | It means | Try |
|---|---|---|
| `Seq Scan` on a big table, filter removes most rows | No usable index or the predicate isn't sargable | Index matching the predicate; rewrite `date(col) = x` as a range; expression index |
| Estimated rows ≪ actual (or ≫) | Stale or insufficient statistics, correlated columns | `ANALYZE table`; raise statistics target; extended statistics (`CREATE STATISTICS`) |
| `Nested Loop` with a large outer side and inner index scan × many loops | Misestimate led to wrong join type | Fix estimates first; check join columns are indexed |
| `Sort Method: external merge  Disk:` | Sort spilled | Index that provides the order, or more `work_mem` for that query |
| `Rows Removed by Filter` high in an `Index Scan` | Index only partially matches | Composite index with the filter column |
| `Heap Fetches` high in `Index Only Scan` | Visibility map not current | Vacuum the table (autovacuum tuning) |
| `Buffers: shared read` large | Data not cached; I/O bound | Smaller working set, better index, covering index |

### MySQL

- `EXPLAIN SELECT …` (tabular): check `type` (`ALL` = full scan; `range`, `ref`, `eq_ref`, `const` better), `key` (chosen index), `rows`, `Extra` (`Using filesort`, `Using temporary` are warnings; `Using index` = covering).
- `EXPLAIN FORMAT=TREE` and `EXPLAIN ANALYZE` (8.0.18+, executes the query) show the iterator tree with actual timings.

### SQLite

- `EXPLAIN QUERY PLAN SELECT …`: `SCAN table` = full scan; `SEARCH table USING INDEX …` = index lookup; `USE TEMP B-TREE FOR ORDER BY` = sort without an index.
- Run `ANALYZE` (or `PRAGMA optimize` periodically) so the planner has statistics.

## Index design notes

- B-tree composite index `(a, b, c)` serves filters on `a`, `a,b`, `a,b,c` and `ORDER BY` in index order; a range on `b` stops `c` from being used for filtering.
- PostgreSQL index types: B-tree (default), GIN (arrays, `jsonb`, full-text, trigram with `pg_trgm`), GiST (ranges, geometry, exclusion constraints), BRIN (huge append-only tables ordered by time), hash.
- Partial unique index for soft delete: `CREATE UNIQUE INDEX users_email_live_key ON users (lower(email)) WHERE deleted_at IS NULL;`
- Unused/duplicate indexes (PostgreSQL): `SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan;` — check replicas too before dropping, stats are per server.
