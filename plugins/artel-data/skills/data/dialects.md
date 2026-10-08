# PostgreSQL vs MySQL vs SQLite

Reference for the `data` skill. Version numbers mark when a feature arrived; always check the version the project actually runs (`SELECT version();`, `SELECT sqlite_version();`).

## At a glance

| Topic | PostgreSQL | MySQL (InnoDB) | SQLite |
|---|---|---|---|
| Auto-increment PK | `bigint GENERATED ALWAYS AS IDENTITY` (10+); `serial` is legacy | `BIGINT UNSIGNED AUTO_INCREMENT` | `INTEGER PRIMARY KEY` (alias of rowid); `AUTOINCREMENT` only to forbid id reuse |
| UUID type | `uuid`; `gen_random_uuid()` built in (13+); `uuidv7()` built in from 18 | `BINARY(16)` with `UUID_TO_BIN(uuid, 1)` for ordering, or `CHAR(36)` | `BLOB` or `TEXT` |
| Strings | `text` (no performance penalty vs `varchar(n)`) | `VARCHAR(n)` with `utf8mb4`; `TEXT` can't have a default before 8.0.13 and needs prefix indexes | `TEXT`; length not enforced |
| Booleans | `boolean` | `TINYINT(1)` (`BOOLEAN` is an alias) | integer 0/1 |
| Timestamps | `timestamptz` (stores UTC instant) | `DATETIME(6)` (no tz) or `TIMESTAMP` (UTC-converted, ends in 2038) | no type: ISO-8601 `TEXT`, Unix `INTEGER` or Julian `REAL` |
| JSON | `jsonb` (indexable with GIN), `json` | `JSON` (binary), index via generated columns or functional indexes (8.0.13+) | JSON functions (`json_extract`, `->`/`->>` from 3.38); stored as `TEXT` (JSONB blob format from 3.45) |
| Typing | strict | strict only with strict SQL mode (default in 5.7+/8.0; check `sql_mode`) | type affinity — anything goes into any column unless the table is `STRICT` (3.37+) |
| `CHECK` constraints | enforced | enforced from 8.0.16 (parsed and ignored before) | enforced |
| Foreign keys | enforced | enforced (InnoDB) | **off by default** — `PRAGMA foreign_keys = ON` on every connection |
| FK column index | not automatic — create it | created automatically | not automatic |
| Transactional DDL | yes (except `CREATE INDEX CONCURRENTLY`, `VACUUM`, some `ALTER TYPE … ADD VALUE` cases) | **no** — each DDL statement implicitly commits | yes |
| `RETURNING` | yes | no (MariaDB has it for some statements) | yes (3.35+) |
| Upsert | `ON CONFLICT … DO UPDATE` / `DO NOTHING` | `ON DUPLICATE KEY UPDATE`, `INSERT IGNORE` (swallows other errors too) | `ON CONFLICT … DO UPDATE` (3.24+), `INSERT OR REPLACE` (deletes then inserts — fires deletes, changes rowid) |
| `MERGE` | 15+ | no | no |
| Window functions / CTEs | yes / yes | 8.0+ / 8.0+ | 3.25+ / 3.8.3+ |
| Partial / expression indexes | yes / yes | no / functional key parts (8.0.13+) | yes / yes |
| Covering index | `INCLUDE (cols)` (11+) | add columns to the key; secondary indexes include the PK | add columns to the key |
| Full-text | `tsvector` + GIN | `FULLTEXT` indexes | FTS5 extension |
| Default isolation | READ COMMITTED | REPEATABLE READ | SERIALIZABLE |
| `SKIP LOCKED` | 9.5+ | 8.0+ | n/a (single writer) |
| Identifier quoting | `"name"`; unquoted folded to lower case | `` `name` ``; table-name case sensitivity depends on OS / `lower_case_table_names` | `"name"` |
| Strings vs identifiers | `'string'`, `"identifier"` | `"…"` is a string unless `ANSI_QUOTES` | double-quoted string fallback for unknown identifiers (legacy misfeature; can be disabled at compile time) |
| Concatenation | `\|\|` | `CONCAT()` (`\|\|` is OR unless `PIPES_AS_CONCAT`) | `\|\|` |
| `NULL`-safe equality | `IS NOT DISTINCT FROM` | `<=>` | `IS` (and `IS NOT DISTINCT FROM` from 3.39) |
| Case-insensitive match | `ILIKE`, `citext`, or `lower()` + expression index | depends on collation (`_ci` collations are case-insensitive by default) | `LIKE` is ASCII case-insensitive; `COLLATE NOCASE` |
| Unique with NULLs | NULLs distinct; `NULLS NOT DISTINCT` (15+) | NULLs distinct | NULLs distinct |
| Concurrency | MVCC, many writers | MVCC + row/gap locks, many writers | one writer; readers concurrent in WAL mode |

## PostgreSQL notes

- `VACUUM`/autovacuum reclaims dead tuples; long-running transactions (including idle-in-transaction sessions and abandoned replication slots) stop it and cause bloat and eventually transaction-ID wraparound risk. Monitor `pg_stat_activity` and `pg_replication_slots`.
- Sequences are not transactional: rolled-back inserts leave gaps. Don't rely on gapless IDs.
- `ALTER TABLE` lock levels matter — most forms take `ACCESS EXCLUSIVE`. See [migrations.md](migrations.md).
- Prefer `text` + `CHECK (char_length(x) <= n)` over `varchar(n)` when the limit may change; `varchar(n)` increase is metadata-only though.
- Extensions are per database (`CREATE EXTENSION pg_trgm;`); managed services allow a subset.
- Row-level security: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`. Table owners and superusers bypass it unless `FORCE ROW LEVEL SECURITY`.
- TLS from clients: `sslmode=verify-full` (with the CA) prevents MITM; `require` encrypts but does not verify the server.

## MySQL notes

- Always `utf8mb4` with a modern collation (8.0 default `utf8mb4_0900_ai_ci`). `utf8` is an alias of the 3-byte `utf8mb3`, which cannot store emoji.
- Check `sql_mode` includes `STRICT_TRANS_TABLES` (or `STRICT_ALL_TABLES`); without it invalid values are truncated with only a warning.
- Online DDL: `ALTER TABLE … , ALGORITHM=INSTANT` (add/drop column in 8.0.29+; add column 8.0.12+), `ALGORITHM=INPLACE, LOCK=NONE` (most index builds), else `COPY` (table rebuild, blocks writes). Specify the algorithm explicitly so MySQL errors instead of silently falling back to a blocking copy. For large tables tools such as `gh-ost` or `pt-online-schema-change` copy in the background.
- Every DDL needs a metadata lock: a long-running transaction on the table blocks the `ALTER`, and the waiting `ALTER` blocks all later queries. Set `lock_wait_timeout` low for migrations.
- InnoDB clusters rows by primary key: random UUID PKs fragment inserts; use auto-increment or time-ordered IDs. Secondary indexes carry the PK, so keep it small.
- `GROUP BY` with non-aggregated columns is rejected under `ONLY_FULL_GROUP_BY` (default in 5.7+) — keep it enabled.
- Replication is via binlog; large single transactions cause replica lag.

## SQLite notes

- Per-connection settings to apply on open:
  ```sql
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;      -- persistent, set once per database
  PRAGMA busy_timeout = 5000;     -- ms to wait for the write lock
  PRAGMA synchronous = NORMAL;    -- safe with WAL; FULL for maximum durability
  ```
- One writer at a time. Use `BEGIN IMMEDIATE` for write transactions; keep them short; serialise writes in the app if needed.
- `ALTER TABLE` supports `RENAME TABLE`, `RENAME COLUMN` (3.25+), `ADD COLUMN` (with restrictions: no `PRIMARY KEY`/`UNIQUE`, no non-constant default), `DROP COLUMN` (3.35+, with restrictions). Anything else (change type, add constraint) needs the documented rebuild: create new table → copy → drop old → rename, inside a transaction with foreign keys disabled and a `PRAGMA foreign_key_check` before commit. Many migration tools (Alembic "batch mode", Prisma, Django) do this for you.
- Prefer `STRICT` tables for new schemas to get real type checking.
- Backups: `sqlite3 app.db ".backup backup.db"` or `VACUUM INTO 'backup.db'` (3.27+); copying the file while it is written (and without its `-wal` file) can produce a corrupt copy. Replication/streaming backup tools exist for production SQLite — use one rather than cron'd file copies.
- Network filesystems (NFS, SMB) break SQLite locking — keep the database on local disk.

## Testing across engines

Do not test a PostgreSQL or MySQL app on SQLite: types, constraints, locking, case sensitivity and SQL syntax all differ. Run the real engine in a container at the production major version.
