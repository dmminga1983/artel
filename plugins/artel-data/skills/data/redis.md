# Redis reference

Reference for the `data` skill. Applies to Redis and wire-compatible servers (for example Valkey); check the server's version and documentation for command availability.

## Data types — pick by access pattern

| Type | Use for | Key commands | Watch out |
|---|---|---|---|
| String | cached values, counters, flags, simple locks | `GET`, `SET key val EX 60 NX`, `INCR`, `MGET` | Values up to 512 MB — keep them small (KBs) |
| Hash | an object's fields | `HSET`, `HGET`, `HGETALL`, `HINCRBY` | `HGETALL` on huge hashes blocks; per-field TTL only on newer versions (`HEXPIRE`) |
| List | simple queues, recent-N lists | `LPUSH`, `RPOP`, `BLMOVE`, `LTRIM` | No acknowledgement — a crashed consumer loses the item unless you use a move-to-processing list |
| Set | membership, tags, uniqueness | `SADD`, `SISMEMBER`, `SMEMBERS`, `SINTER` | `SMEMBERS` on big sets — use `SSCAN` |
| Sorted set | leaderboards, priority queues, sliding-window rate limits, time indexes | `ZADD`, `ZRANGE … BYSCORE`, `ZREMRANGEBYSCORE`, `ZINCRBY` | Trim old members or it grows forever |
| Stream | durable-ish event log, consumer groups with acks | `XADD … MAXLEN ~ n`, `XREADGROUP`, `XACK`, `XAUTOCLAIM` | Cap length; handle pending entries of dead consumers |
| Bitmap / HyperLogLog | flags per id, approximate unique counts | `SETBIT`, `BITCOUNT`, `PFADD`, `PFCOUNT` | HLL is approximate (~0.81% standard error) |
| Geo | radius queries | `GEOADD`, `GEOSEARCH` | — |

Pub/Sub is fire-and-forget: subscribers that are offline miss messages. Use streams when delivery matters.

## TTLs and expiry

- Set the TTL atomically with the value: `SET key value EX 300` — not `SET` followed by `EXPIRE` (a crash in between leaves an immortal key).
- `SET` without `KEEPTTL` **removes** an existing TTL. `INCR` on a key keeps its TTL; on a new key there is none — set it explicitly (`SET key 0 EX 60 NX` then `INCR`, or a small Lua script).
- Add jitter to TTLs of keys populated at the same time to avoid synchronized expiry storms.
- `TTL key` returns -1 for no expiry and -2 for missing key — useful in audits (`SCAN` + `TTL` sample to find keys without TTL).

## Key design

- Namespaced, versioned: `app:v3:user:42:profile`. Bump the version to invalidate a whole format at once.
- Cluster: multi-key commands require keys in the same hash slot — use hash tags `{user:42}:profile`, `{user:42}:settings`. Don't put everything under one tag (hot slot).
- Avoid big keys (multi-MB values, collections with millions of members): they block the single-threaded command loop on read, delete (`UNLINK` deletes asynchronously) and migration.

## Caching patterns

**Cache-aside (default):**

1. `GET key` → hit: return.
2. Miss: read from the database, `SET key value EX ttl`, return.
3. On write: commit the database transaction **first**, then `DEL key` (delete rather than update, so concurrent writers can't leave a stale value). If the cache delete can fail, the TTL bounds the staleness; for stricter needs publish invalidations from an outbox/CDC.

**Stampede protection** for expensive hot keys: single-flight (`SET lock:key token NX PX 5000`; others wait briefly or serve stale), probabilistic early refresh, or serve-stale-while-revalidate with a soft TTL stored in the value.

**Negative caching:** cache "not found" briefly to protect the database from repeated misses, with a short TTL.

**What not to cache:** per-user authorization decisions with long TTLs (revocation lag), data that must be strongly consistent with the database (balances, stock levels used for decisions).

## Locks and rate limits

- Lock acquire: `SET lock:resource <random-token> NX PX 10000`. Release only if you still own it — compare-and-delete atomically with a Lua script:

  ```lua
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
  ```

- A Redis lock can expire while the holder is paused (GC, network); for correctness-critical mutual exclusion use a database lock or fencing tokens checked by the protected resource. Redis locks are fine for efficiency (avoid duplicate work).
- Fixed-window rate limit: `INCR` + TTL on `rl:{user}:{window}`. Sliding window: sorted set of timestamps with `ZREMRANGEBYSCORE` + `ZCARD`, inside `MULTI` or a Lua script.

## Durability and memory

- Persistence options: RDB snapshots (periodic, can lose minutes), AOF (`appendonly yes`; `appendfsync everysec` loses up to ~1 s; `always` is slow), or both. No persistence = cache only.
- `maxmemory` + `maxmemory-policy`: `allkeys-lru`/`allkeys-lfu` for pure caches; `volatile-*` evicts only keys with TTL; `noeviction` (writes fail when full) for data you must not lose. **If Redis holds anything that is not a cache, eviction must be off and persistence, replication and backups must be configured and tested.**
- Replication is asynchronous: an acknowledged write can be lost on failover. `WAIT` reduces but doesn't remove this.
- Managed services differ in persistence and eviction defaults — read them, don't assume.

## Operations and performance

- Never run `KEYS *`, `FLUSHALL`, `FLUSHDB` or `DEBUG` on production (the last three are **destructive**). Iterate with `SCAN 0 MATCH app:v3:* COUNT 1000`.
- Pipeline or `MGET`/`MSET` to cut round trips; Lua scripts / functions for atomic multi-step logic (keep them short — they block the server).
- `SLOWLOG GET`, `INFO memory`, `MEMORY USAGE key`, `LATENCY DOCTOR`, and `redis-cli --bigkeys` / `--memkeys` (which use `SCAN`) for diagnosis.
- Connection pooling in the client; set timeouts; handle reconnects and `READONLY`/`MOVED` errors in cluster/replica setups via a cluster-aware client.

## Security

- Bind to private interfaces only; never expose port 6379 to the internet.
- Require authentication (ACL users with least privilege via `ACL SETUSER`, not just a shared `requirepass`); disable the `default` user or give it no permissions.
- Enable TLS for traffic leaving the host.
- Restrict dangerous commands per ACL user (`-@dangerous`, `-flushall`, `-config`, `-debug`).
- Don't store secrets or raw PII in cache keys or values unless necessary; keys appear in monitoring tools and `MONITOR` output.
