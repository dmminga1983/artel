# Go review checklist

Severity: **blocker** (security, data loss, race, crash), **major** (bug risk, leak, missing tests), **minor** (style, naming). Quote the line and propose the fix.

## Module and tooling
- [ ] `gofmt -l .` prints nothing; `go vet ./...` and golangci-lint (project config) pass.
- [ ] `go mod tidy` leaves no diff; `go.sum` committed with `go.mod`.
- [ ] `go` directive not raised without reason (it changes language semantics, e.g. loop variables).
- [ ] New dependency justified (stdlib alternative considered), maintained, license compatible.
- [ ] Generated code regenerated from its source (`go generate`, sqlc, buf), not hand-edited.

## API and design
- [ ] Exported identifiers have doc comments starting with the name; unexported where possible.
- [ ] Interfaces small and defined at the consumer; functions accept interfaces and return concrete types.
- [ ] Zero values usable or constructors enforce invariants.
- [ ] No mutable package-level state; no I/O in `init()`.
- [ ] Package names short, lowercase, meaningful (no `util`, `common`); no stutter (`user.UserService` → `user.Service`).
- [ ] `internal/` used for code that must not be imported by other modules.

## Errors
- [ ] Every returned error is checked (including `Close` on writers, `rows.Err()`).
- [ ] Wrapped with context via `%w` where callers may inspect; `errors.Is`/`errors.As` instead of string or `==` comparisons on wrapped errors.
- [ ] Error handled once — not logged and returned at every layer.
- [ ] No `panic` for expected conditions; `log.Fatal`/`os.Exit` only in `main`.
- [ ] Error strings lowercase, no trailing punctuation.

## Context and concurrency
- [ ] `ctx context.Context` is the first parameter of blocking/I/O functions and is passed down; not stored in structs.
- [ ] `defer cancel()` right after `WithTimeout`/`WithCancel`/`WithDeadline`.
- [ ] Every goroutine has a clear termination condition and an owner that waits for it (`WaitGroup`, `errgroup`).
- [ ] Concurrency bounded; no goroutine per item for unbounded input.
- [ ] Channels closed only by the sender; no send on possibly-closed channel; `select` includes `ctx.Done()` where blocking.
- [ ] Shared maps/slices/struct fields protected; no lock copying; `go test -race ./...` green.
- [ ] Timers/tickers stopped; `time.After` not used in hot loops on older Go versions.

## Resources and I/O
- [ ] `defer resp.Body.Close()`, `defer rows.Close()`, `defer f.Close()` immediately after success checks.
- [ ] HTTP clients have timeouts and are reused; servers configured with timeouts and graceful shutdown.
- [ ] Request bodies limited (`http.MaxBytesReader`); large data streamed (`io.Copy`), not `io.ReadAll`.

## Security
- [ ] SQL uses placeholders; dynamic identifiers whitelisted; GORM/raw queries not built with `Sprintf`.
- [ ] `html/template` for HTML; no `template.HTML(...)` on user data.
- [ ] User paths confined (`os.Root` or `filepath.IsLocal`); archive entries validated.
- [ ] `exec.Command` without shell; `--` before user arguments.
- [ ] Outbound requests to user URLs protected against SSRF at dial time.
- [ ] `crypto/rand` for secrets; constant-time comparisons; no `InsecureSkipVerify`.
- [ ] pprof/expvar not reachable on public listeners.
- [ ] No secrets in code, logs or error messages.
- [ ] `govulncheck ./...` clean or findings triaged.

## Performance
- [ ] Claims backed by benchmarks (`-benchmem`, `benchstat`) or profiles.
- [ ] Slices/maps preallocated when size is known; no string concatenation in loops.
- [ ] `sync.Pool` objects reset before reuse and size-capped.
- [ ] No N+1 queries; DB pool settings sensible.

## Tests
- [ ] Table-driven tests with named subtests covering success, error and edge cases.
- [ ] Helpers use `t.Helper()`; cleanup via `t.Cleanup`/`t.TempDir`.
- [ ] Fakes or `httptest` instead of heavy mocking frameworks (unless the project standardises one).
- [ ] No sleeps for synchronisation; deterministic time where it matters.
- [ ] Fuzz tests for parsers/decoders; committed corpus entries for found bugs.
- [ ] `go test -race ./...` was run and is green.
