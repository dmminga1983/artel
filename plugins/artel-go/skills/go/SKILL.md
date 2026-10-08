---
name: go
description: Go stack pack — modules, gofmt/vet/staticcheck/golangci-lint, project layout, error wrapping, context, goroutines and races, table-driven tests, fuzzing, benchmarks, security (SQL, templates, paths, govulncheck, timeouts), pprof, build-error playbook, review checklist; net/http, chi/gin/echo, gRPC, sqlc/GORM. Use for any Go code. Триггеры - «голанг», «горутины», «ошибка сборки go».
paths: "**/*.go, go.mod, go.sum, go.work, .golangci.yml, .golangci.yaml, .golangci.toml, sqlc.yaml, buf.yaml"
---

# Go

Reply in the user's language.

Follow the project's existing conventions over these defaults. Long material lives in reference files:
[build-errors.md](build-errors.md) · [security.md](security.md) · [review-checklist.md](review-checklist.md) · [frameworks.md](frameworks.md).

## 1. Detect the project

| Look at | It tells you |
|---|---|
| `go.mod` `module`, `go`, `toolchain`, `tool` directives | Module path, minimum language version (do not use newer features), pinned toolchain, tracked dev tools. |
| `go.work` | Multi-module workspace — commands resolve across listed modules. |
| `go.sum` | Committed checksums; must stay in sync with `go.mod`. |
| `.golangci.yml`/`.yaml`/`.toml` (check its `version` field) | Enabled linters and settings. |
| `Makefile`, `Taskfile.yml`, `magefile.go`, CI workflows | The real build/test/lint commands and flags (`-race`, tags, `CGO_ENABLED`). |
| `cmd/`, `internal/`, `pkg/` | Layout: binaries in `cmd/<name>/main.go`, private code in `internal/`. |
| `//go:build` lines, `_linux.go`-style suffixes | Build constraints that hide files from some builds. |
| Imports of `net/http`, chi, gin, echo, `google.golang.org/grpc`, sqlc output, GORM | Framework — then read [frameworks.md](frameworks.md). |
| `//go:generate` lines, `sqlc.yaml`, `buf.gen.yaml` | Generated code: edit the source (SQL, `.proto`), then regenerate; never hand-edit generated files. |

## 2. Defaults for new code

- **Toolchain:** a currently supported Go release (the two most recent majors are supported) — check go.dev rather than assuming. Set the `go` directive to the oldest version you need, not automatically the newest.
- **Formatting:** `gofmt` (or `goimports`) on save; never hand-format.
- **Static checks:** `go vet ./...` plus staticcheck, typically via golangci-lint with a committed config.
- **Dev tools:** track them in `go.mod` with the `tool` directive (`go get -tool`, run with `go tool <name>`) on Go versions that support it; otherwise a `tools.go` file or pinned `go install pkg@version` in CI.
- **Layout:** start flat (one package) and grow; `cmd/<app>/main.go` for binaries, `internal/` for code other modules must not import. Avoid `util`/`common`/`helpers` package names; name packages by what they provide.
- **Logging:** `log/slog` with a JSON handler in services.
- **HTTP:** standard `net/http` with the method/path-pattern `ServeMux` (Go 1.22+) unless the project uses a router.
- **Config:** env vars / flags parsed in `main`, passed down as typed structs — no package-level globals read at init.
- **Dependencies:** few and boring; the standard library covers most needs.

## 3. Idioms and design

1. **Accept interfaces, return structs.** Define small interfaces where they are *consumed*, not next to the implementation. No interface until there are two implementations or a test seam needs it.
2. **Errors are values** — handle each one or return it with context. No `panic` for expected failures; `panic` only for programmer errors at init.
3. **`context.Context` is the first parameter** of anything that does I/O or may block; never store it in a struct; never pass `nil` (use `context.TODO()` while refactoring).
4. **Every goroutine has an owner and an exit.** Whoever starts it knows how it stops (context cancellation, closed channel) and waits for it (`sync.WaitGroup`, `errgroup.Group`). No fire-and-forget in libraries.
5. **Channels for ownership transfer and signalling; mutexes for protecting state.** The sender closes a channel, never the receiver. Do not over-channel what a `sync.Mutex` does simply.
6. **Make the zero value useful** (`var buf bytes.Buffer`, `sync.Mutex` without init). Constructors `NewX` only when invariants need them.
7. **Do not copy values containing locks** (`go vet` copylocks). Pointer receivers for types with mutexes or large state; be consistent per type.
8. **Slices and maps alias.** Appending to a sub-slice can overwrite the original; copy (`slices.Clone`, `maps.Clone`) before retaining or returning internal state. Maps are not safe for concurrent writes.
9. **Generics** for container-like code and algorithms over types (`slices`, `maps`, `cmp` packages); not as a replacement for interfaces.
10. **`defer` for cleanup** right after acquiring a resource (`defer rows.Close()`, `defer resp.Body.Close()`, `defer cancel()`); check `Close` errors on writes.
11. **Short names in small scopes, descriptive names for exports.** Doc comments on every exported identifier, starting with its name.
12. **Package-level state is a smell:** no mutable globals, no `init()` doing I/O.
13. **Time:** `time.Duration` in APIs (not `int` seconds); monotonic clock via `time.Since`; inject a clock for tests if timing logic matters.

## 4. Errors and logging

- Wrap with context: `fmt.Errorf("load user %d: %w", id, err)` — lowercase, no trailing punctuation, no "failed to" chains.
- Inspect with `errors.Is(err, ErrNotFound)` (sentinels) and `errors.As(err, &target)` (typed errors) — never compare `err.Error()` strings. `errors.Join` to combine several errors.
- Use `%w` only when callers may depend on the wrapped error (it becomes API); `%v` to hide implementation details.
- Sentinel errors `var ErrNotFound = errors.New("not found")` for conditions callers branch on; custom types when they need fields.
- Handle an error **once**: either log it or return it, not both at every layer.
- `slog` with key-value attributes (`slog.Info("order created", "order_id", id)`); put request IDs in context-aware handlers; never log secrets or full request bodies.
- `log.Fatal`/`os.Exit` only in `main` — they skip deferred functions.
- Recover from panics at goroutine/request boundaries in servers (net/http recovers handler panics per request, but goroutines you start do not).

## 5. Testing

- `go test ./...`; tests in `x_test.go` next to the code; `package x` for white-box, `package x_test` for black-box API tests.
- **Table-driven tests** with `t.Run(tc.name, ...)` subtests; since Go 1.22 the loop variable is per-iteration, so capturing `tc` in parallel subtests is safe.
- Helpers call `t.Helper()`; use `t.Cleanup`, `t.TempDir()`, `t.Setenv`; `t.Context()` on Go versions that have it.
- `t.Parallel()` for independent tests — not with `t.Setenv` or shared global state.
- Compare structs with `reflect.DeepEqual` or `github.com/google/go-cmp/cmp` (`cmp.Diff` gives readable output). testify (`require`/`assert`) is fine if the project already uses it — do not introduce it into a project that does not.
- **Fakes over mocks:** small hand-written fakes satisfying a consumer-side interface; `httptest.NewServer` / `httptest.NewRecorder` for HTTP.
- **Race detector:** `go test -race ./...` in CI (needs cgo; slower). Any reported race is a bug.
- **Fuzzing:** `func FuzzParse(f *testing.F)` with `f.Add` seeds; run `go test -run '^$' -fuzz '^FuzzParse$' -fuzztime 30s ./pkg`; failing inputs land in `testdata/fuzz/` — commit them as regression tests.
- **Benchmarks:** `func BenchmarkX(b *testing.B)` (use `b.Loop()` on Go versions that have it, else `for i := 0; i < b.N; i++`); run `go test -run '^$' -bench . -benchmem`; compare runs with `benchstat`.
- **Run one test:** `go test ./pkg -run '^TestParse$/^empty_input$' -v -count=1` (`-count=1` bypasses the test cache).
- **Coverage:** `go test -coverprofile=cover.out ./...` then `go tool cover -html=cover.out`.
- Golden files in `testdata/` with an `-update` flag defined by the test package.
- Integration tests behind a build tag or `testing.Short()` check; real databases in containers.

## 6. Security pitfalls

Full list with snippets: [security.md](security.md).

- **SQL:** `db.QueryContext(ctx, query, args...)` with placeholders (`?` or numbered, depending on the driver) — never `fmt.Sprintf` user values into SQL. Identifiers via whitelist.
- **Templates:** `html/template` for anything rendered in a browser (context-aware escaping); `text/template` does no escaping. Converting input to `template.HTML`/`template.JS`/`template.URL` disables escaping.
- **Paths:** `filepath.Join(base, userPath)` does not prevent `..` escape. Use `os.Root` (`os.OpenRoot`) where available, or `filepath.IsLocal` checks; check archive entry names (zip slip).
- **Commands:** `exec.CommandContext(ctx, "git", "log", "--", branch)` — no `sh -c` with input.
- **HTTP timeouts:** `http.Client{Timeout: ...}` (the default client has none); `http.Server` with `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout`; `http.MaxBytesReader` on bodies. `http.ListenAndServe` with no server struct has no timeouts.
- **SSRF:** validate user URLs; block private/loopback/link-local IPs in a custom `net.Dialer` `Control` func so redirects and DNS rebinding are covered.
- **Crypto:** `crypto/rand` for tokens (never `math/rand`); `crypto/subtle.ConstantTimeCompare`; no `InsecureSkipVerify: true` outside tests; bcrypt/argon2 for passwords.
- **pprof:** do not expose `net/http/pprof` on a public listener — importing it registers handlers on `http.DefaultServeMux`.
- **Dependencies:** `govulncheck ./...` (reports only vulnerabilities your code actually reaches); keep `go.sum` committed; `GOPRIVATE` for private modules so they bypass the public proxy and checksum database.

## 7. Performance pitfalls

- **Measure first:** benchmarks with `-benchmem`; profiles with `go test -cpuprofile cpu.out -memprofile mem.out` or `net/http/pprof` on an internal port; analyse with `go tool pprof -http=localhost:8080 cpu.out`. Traces (`runtime/trace`, `go tool trace`) for latency and scheduling issues.
- **Allocations:** preallocate (`make([]T, 0, n)`, `make(map[K]V, n)`); `strings.Builder`/`bytes.Buffer` for concatenation; avoid `fmt.Sprintf` in hot loops; check escapes with `go build -gcflags=-m`.
- **Pointers vs values:** small structs by value are often faster (no heap escape); measure.
- **`sync.Pool` caveats:** only for frequently allocated, short-lived, same-size objects; always reset before reuse; pooled objects can be dropped at any GC; do not pool huge buffers unbounded (return only buffers under a size cap); it is not a cache or connection pool.
- **Goroutines are cheap, not free:** bound concurrency (`errgroup.SetLimit`, worker pools, semaphores); leaked goroutines are memory leaks.
- **I/O:** `bufio` for many small reads/writes; stream with `io.Copy` instead of `io.ReadAll` on large bodies; reuse `http.Client` (connection pooling) and always drain/close `resp.Body`.
- **DB:** avoid N+1 (join or batch `WHERE id IN`/`= ANY`); tune `SetMaxOpenConns`/`SetMaxIdleConns`/`SetConnMaxLifetime`; always close `rows` and check `rows.Err()`.
- **Runtime:** `GOMEMLIMIT` for containers with memory limits; profile-guided optimisation (`default.pgo` in the main package) once profiles exist; recent Go versions set `GOMAXPROCS` from container CPU limits — older ones do not.

## 8. Build and run errors

Full table: [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `missing go.sum entry for module providing package` | `go.sum` out of sync | `go mod tidy` (or `go mod download <module>`), commit both files. |
| `no required module provides package x` | Import not in `go.mod`, or wrong module path | `go get x@<version>` then `go mod tidy`; check spelling and major version suffix (`/v2`). |
| `go: go.mod requires go >= X (running go Y; GOTOOLCHAIN=local)` | Local toolchain older than `go.mod` requires and auto-download disabled | Install the required Go, or allow toolchain switching (`GOTOOLCHAIN=auto`). |
| `import cycle not allowed` | Two packages import each other | Move shared types to a third package, or invert with an interface at the consumer. |
| `declared and not used` / `"x" imported and not used` | Compiler-enforced | Remove, or use `_` deliberately; run `goimports`. |
| `undefined: X` though X exists | File excluded by build tags/OS suffix, different package name, or generated file not generated | Check `//go:build` and file suffixes; `go generate ./...`; `go list -f '{{.GoFiles}}' ./pkg`. |
| `cgo: C compiler "gcc" not found` / `-race requires cgo` | cgo needed but no C toolchain | Install a C compiler, or build with `CGO_ENABLED=0` if no cgo dependency is needed (race detector requires cgo). |
| `module declares its path as A but was required as B` | Fork/rename or wrong import path | Use the declared path; `replace` directive for forks. |
| `verifying module: checksum mismatch` / `SECURITY ERROR` | Module content changed for the same version, or corrupted cache | Investigate before bypassing; `go clean -modcache` if local cache is corrupt; never delete `go.sum` lines to "fix" it. |
| `use of internal package ... not allowed` | Importing another module's `internal/` | Use the public API or move the code. |
| Private module fetch fails (`410 Gone`, auth prompt, `unknown revision`) | Proxy/checksum DB cannot see private repos | `GOPRIVATE=<your module prefix>`; git credentials for the host. |

## 9. Review checklist

Full checklist: [review-checklist.md](review-checklist.md).

- [ ] `gofmt` clean, `go vet` and golangci-lint pass; `go mod tidy` produces no diff.
- [ ] Every error checked, wrapped with context (`%w`), handled once; no `err.Error()` string comparisons.
- [ ] `ctx` first, propagated to all I/O, not stored in structs; `defer cancel()` after `WithTimeout`/`WithCancel`.
- [ ] Every goroutine has an exit path and is waited for; concurrency bounded; `go test -race` green.
- [ ] `defer resp.Body.Close()` / `rows.Close()` + `rows.Err()`; HTTP clients and servers have timeouts.
- [ ] SQL parameterised; `html/template` for HTML; user paths contained; no `sh -c` with input.
- [ ] No exported API without doc comments; no new mutable globals or `init` side effects.
- [ ] Table-driven tests cover the change and edge cases; benchmarks for performance claims.

## 10. Frameworks

Details: [frameworks.md](frameworks.md).

- **net/http:** method + path patterns and `r.PathValue` (Go 1.22+); middleware as `func(http.Handler) http.Handler`; configured `http.Server` with timeouts and graceful `Shutdown`.
- **chi / gin / echo:** chi stays `net/http`-compatible; gin and echo have their own context types — pass the request context downstream (chi `r.Context()`, gin `c.Request.Context()`, echo `c.Request().Context()`).
- **gRPC:** deadlines on every call, `status.Error(codes.X, ...)`, interceptors for auth/logging; never reuse or renumber proto fields — `reserved` them.
- **sqlc / GORM:** sqlc generates typed code from SQL (edit queries, then regenerate); GORM: bind parameters with `?`, `Preload` to avoid N+1, beware zero-value fields skipped by struct updates.
