# Go frameworks and libraries

Check the project's `go.mod` for which of these it uses and their major versions. Prefer what the project already has; do not add a router or ORM to a codebase that uses the standard library.

## net/http (standard library)

```go
mux := http.NewServeMux()
mux.HandleFunc("GET /items/{id}", getItem)      // method + pattern, Go 1.22+
mux.HandleFunc("POST /items", createItem)
mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServerFS(staticFS)))

func getItem(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    // ...
}
```

- Patterns: `{name}` segment wildcards, `{rest...}` for the remainder, trailing `/` matches a subtree, `{$}` matches only the exact path. More specific patterns win; conflicting patterns panic at registration.
- **Middleware** is `func(http.Handler) http.Handler`; compose explicitly (logging → recovery → auth → handler).
- Put request-scoped values (user, request ID) in `r.Context()` with unexported key types; read them through typed accessor functions.
- **Server:** explicit `http.Server` with `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout`.
- **Graceful shutdown:**

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
go func() {
    if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
        slog.Error("listen", "err", err)
        stop()
    }
}()
<-ctx.Done()
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
_ = srv.Shutdown(shutdownCtx)
```

- Write the status code before the body (`w.WriteHeader` then `w.Write`); after the first `Write`, headers can no longer change.
- JSON helpers: one `writeJSON(w, status, v)` and one `decodeJSON(r, &v)` with size limits and error mapping, reused everywhere.
- Tests: `httptest.NewRecorder()` + `handler.ServeHTTP(rec, req)` for handlers; `httptest.NewServer` for clients.

## chi

- Router built on `net/http` types — handlers are plain `http.HandlerFunc`, middleware is `func(http.Handler) http.Handler`, so stdlib middleware works.
- `r.Route("/items", func(r chi.Router) { r.Get("/{id}", getItem) })`; read params with `chi.URLParam(r, "id")`.
- Bundled middleware covers request ID, real IP, recoverer, timeouts; use the real-IP middleware only behind a trusted proxy.

## gin

- `*gin.Context` wraps the request; bind and validate with `c.ShouldBindJSON(&dto)` (returns an error you handle) rather than `c.BindJSON` (which writes a 400 itself) when you want consistent error responses; validation via `binding:"required"` struct tags.
- Pass `c.Request.Context()` to downstream calls (DB, HTTP) so cancellation follows the client.
- Do not use `*gin.Context` in goroutines after the handler returns; if needed, pass `c.Copy()` or extract values first.
- Run in release mode in production (`GIN_MODE=release`); configure trusted proxies explicitly (`SetTrustedProxies`) before relying on `c.ClientIP()`.
- `gin.New()` plus chosen middleware rather than `gin.Default()` if you need control over logging/recovery.

## echo

- Handlers return `error`; a central `HTTPErrorHandler` maps errors to responses — return `echo.NewHTTPError(status, msg)` for client errors.
- `c.Bind(&dto)` then validate (register a validator); `c.Param("id")`, `c.QueryParam("q")`.
- Request context: `c.Request().Context()`.
- Configure IP extraction (`IPExtractor`) to match the deployment's proxy setup.

## gRPC

- Define APIs in `.proto`; generate with `protoc` plugins or buf (`buf generate`, `buf lint`, `buf breaking` against the main branch to catch incompatible changes).
- **Never** change the number or type of an existing field; delete fields by adding them to `reserved` (numbers and names). Add new fields with new numbers.
- **Deadlines:** every client call uses a context with a timeout; servers respect `ctx.Done()` and propagate the context downstream.
- **Errors:** return `status.Error(codes.NotFound, "...")` / `status.Errorf`; map domain errors to codes in one place; clients inspect with `status.FromError` / `status.Code(err)`. Do not leak internal error text.
- **Interceptors** (unary and stream) for auth, logging, metrics, recovery, chained in a fixed order.
- **Connections:** create one client connection per target and reuse it (it multiplexes); close on shutdown.
- **Security:** TLS credentials in production (insecure credentials only for local dev); per-RPC auth via metadata validated in an interceptor; message size limits set deliberately.
- Health checking via the standard health service; reflection only where appropriate.
- Tests: in-memory connections with `bufconn` (`google.golang.org/grpc/test/bufconn`).

## sqlc

- Write SQL in `.sql` files with annotated queries (`-- name: GetUser :one`), configure `sqlc.yaml`, run `sqlc generate`; generated code gives typed params and rows. Commit generated code (or generate in CI consistently with the project).
- `sqlc vet` / `sqlc verify` (where configured) check queries against the schema.
- Schema comes from migration files (golang-migrate, goose, atlas, etc.) — point sqlc at them so code and schema stay in sync.
- Use the generated `Queries` with a `*sql.DB` or `pgx` pool; for transactions, `q.WithTx(tx)`.
- Dynamic filters/sorting are awkward in sqlc: use `sqlc.narg` with `COALESCE`/`CASE` patterns, or a small query builder for those few queries.
- N+1: write the join or `= ANY(...)` batch query explicitly instead of looping single-row queries.

## GORM

- **SQL safety:** placeholders `db.Where("name = ?", name)`, `db.Where(&User{Name: name})`. Never pass user input as the raw SQL string to `Where`, `Order`, `Select`, `Group`, `Raw`, or `Exec`.
- **N+1:** `Preload("Orders")` (one extra query per association) for associations used in loops; `Joins("Company")` loads belongs-to / has-one associations in the same query.
- **Zero values:** `db.Model(&u).Updates(User{Active: false})` skips zero-value fields — use a `map[string]any` or `Select("Active")` to update them.
- **Not found:** `First`/`Take`/`Last` return `gorm.ErrRecordNotFound`; `Find` returns no error for empty results. Check with `errors.Is`.
- **Errors:** always check `result.Error` (and `RowsAffected` where meaningful).
- **Soft delete:** models with `gorm.DeletedAt` are soft-deleted; queries filter them automatically; `Unscoped()` to include/hard-delete.
- **Migrations:** `AutoMigrate` is convenient in development but does not drop or rename columns safely — use versioned migrations in production.
- **Context:** `db.WithContext(ctx)` on every request path.
- **Hooks** (`BeforeSave`, etc.) hide side effects — keep them minimal.
- Batch: `CreateInBatches`; `FindInBatches` for large reads.

## database/sql and pgx

- `*sql.DB` is a pool — create once, share, configure `SetMaxOpenConns`, `SetMaxIdleConns`, `SetConnMaxLifetime`, `SetConnMaxIdleTime`.
- Use the `Context` variants (`QueryContext`, `ExecContext`, `BeginTx`).
- `defer rows.Close()` and check `rows.Err()` after the loop; `sql.ErrNoRows` from `QueryRow().Scan` means not found.
- Transactions: `defer tx.Rollback()` right after `BeginTx` (no-op after a successful `Commit`).
- pgx native interface (`pgxpool`) offers better PostgreSQL support (COPY, batch, types); `pgx.CollectRows` with `pgx.RowToStructByName` reduces scanning boilerplate.
- `NULL` columns: `sql.Null[T]` / `sql.NullString` or pointer fields.

## Configuration, CLI, observability

- Flags via `flag` or a CLI library already in use; env vars parsed in `main` into a config struct and validated before starting.
- `log/slog` for structured logging; OpenTelemetry for tracing/metrics if the project uses it — propagate `ctx` so spans connect.
- Expose health/readiness endpoints separately from pprof/metrics, which belong on an internal port.
