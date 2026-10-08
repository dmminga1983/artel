# Go build and run errors

Read the **first** compiler error (the compiler stops after a handful per package). For module errors, read the whole message — it usually names the exact module and version.

## First checks

```bash
go version                      # toolchain actually running
go env GOVERSION GOTOOLCHAIN GOPROXY GOPRIVATE GOFLAGS CGO_ENABLED GOOS GOARCH
go list -m all | head -50       # resolved module graph
go mod why -m <module>          # why is this module needed?
go mod graph | grep <module>    # who requires which version?
go build ./... && go vet ./...
```

## Modules

| Symptom | Likely cause | Fix |
|---|---|---|
| `missing go.sum entry for module providing package <pkg>` | `go.sum` lacks hashes (edited `go.mod`, new import) | `go mod tidy`; commit `go.mod` and `go.sum` together. |
| `no required module provides package <pkg>; to add it: go get <pkg>` | Import added without requiring the module | `go get <module>@<version>`, then `go mod tidy`. |
| `go: updates to go.mod needed` / `-mod=readonly` errors in CI | `go.mod` not tidy | Run `go mod tidy` locally and commit; CI should fail on a tidy diff, not modify files. |
| `go: go.mod requires go >= 1.N (running go 1.M; GOTOOLCHAIN=local)` | Older local Go and toolchain switching disabled | Install the required version or set `GOTOOLCHAIN=auto` so `go` downloads it. |
| `go: downloading go1.N ... toolchain not available` | Offline or proxy blocks toolchain download | Install that Go version manually; check `GOPROXY`. |
| `module declares its path as: X but was required as: Y` | Imported via a fork URL or old path | Import the declared path; use `replace X => <fork> <version>` for forks. |
| `invalid version: module contains a go.mod file, so module path must match major version ("…/v2")` | Major version ≥ 2 needs a `/vN` suffix in the module path and imports | Import `example.com/mod/v2`; library authors bump the `module` line. |
| `+incompatible` versions in `go.mod` | v2+ tag on a repo without a `/vN` module path | Prefer a properly versioned release; otherwise acceptable but fragile. |
| `ambiguous import: found package X in multiple modules` | Same package path provided by two modules (often a split/merged repo) | Require a version where only one module provides it; `go mod tidy`. |
| `unknown revision`, `410 Gone`, `terminal prompts disabled`, `reading https://sum.golang.org/...: 404` for private repos | Public proxy and checksum DB cannot see private modules | `go env -w GOPRIVATE=<your-module-prefix>/*`; configure git credentials (`.netrc` or a URL rewrite) for the host. |
| `verifying <module>: checksum mismatch` + `SECURITY ERROR` | Module contents differ from the recorded hash: retagged release, tampering, or a corrupted local cache | Do not delete `go.sum` lines blindly. Compare with a clean cache (`go clean -modcache` — destructive: re-downloads everything); if the upstream retagged, pin a new version deliberately. |
| `replace` works locally, fails for consumers | `replace` directives apply only in the main module | Publish the fix upstream or ask consumers to add the replace; do not ship a library relying on it. |
| `go.work` makes CI and local differ | Workspace file only local | Commit `go.work` deliberately or run CI with `GOWORK=off`. |

## Compiler

| Symptom | Likely cause | Fix |
|---|---|---|
| `declared and not used: x` | Unused local variable (error in Go) | Remove it, or use `_ = x` temporarily while developing. |
| `"pkg" imported and not used` | Unused import | Remove; `goimports` does it automatically. |
| `import cycle not allowed` | Package A imports B and B imports A (possibly via test files in the same package) | Extract shared types; define the interface on the consumer side; for tests, use an external `_test` package. |
| `undefined: X` | Defined in a file excluded by `//go:build` or a `_GOOS`/`_GOARCH` file suffix; generated file missing; unexported name used across packages | `go list -f '{{.GoFiles}} {{.IgnoredGoFiles}}' ./pkg`; `go generate ./...`; export or move. |
| `found packages a (a.go) and b (b.go) in <dir>` | Two package names in one directory | One package per directory (except `_test` package). |
| `cannot use x (variable of type T) as I value: T does not implement I (method M has pointer receiver)` | Method set: value does not have pointer-receiver methods | Pass `&x`, or change receiver consistently. |
| `invalid memory address or nil pointer dereference` (runtime) | Nil pointer/map/interface holding nil pointer | Check constructor paths; note an interface holding a typed nil pointer is not `== nil`. |
| `assignment to entry in nil map` (runtime panic) | Map declared but not `make`d | `m := make(map[K]V)`. |
| `all goroutines are asleep - deadlock!` | Unbuffered send/receive with no partner, or `WaitGroup` never reaching zero | Ensure a receiver exists, close channels from the sender, match `Add`/`Done`. |
| `concurrent map writes` / `concurrent map read and map write` (fatal) | Map shared across goroutines | `sync.Mutex`/`RWMutex` around it, or `sync.Map` for append-mostly caches. |
| `WARNING: DATA RACE` under `-race` | Unsynchronised shared memory | Fix with mutex/channels/atomic; never ignore. |
| Generics: `cannot infer T` / `T does not satisfy constraint` | Inference limits or wrong constraint | Specify type args explicitly; use `cmp.Ordered`/`comparable` or a custom constraint. |
| `go vet: copylocks: ... passes lock by value` | Struct containing a mutex copied | Use pointer receivers/parameters. |

## cgo, cross-compilation, linking

| Symptom | Likely cause | Fix |
|---|---|---|
| `cgo: C compiler "gcc" not found` | cgo enabled (default on native builds) and a dependency uses cgo | Install a C toolchain, or `CGO_ENABLED=0` if the code allows (e.g. pure-Go SQLite driver instead of a cgo one). |
| `-race requires cgo` / race detector unsupported on platform | Race detector needs cgo and a supported OS/arch | Enable cgo in the test job; run `-race` on a supported platform. |
| Binary works locally, `not found` / `no such file` in a scratch/distroless container | Dynamically linked against glibc because of cgo (`net`, `os/user`, cgo deps) | `CGO_ENABLED=0` for static builds, or use a base image with libc. |
| `exec format error` | Wrong `GOOS`/`GOARCH` for the target | `GOOS=linux GOARCH=arm64 go build ./cmd/app`. |
| TLS `x509: certificate signed by unknown authority` in containers | No CA bundle in a scratch image | Copy CA certificates into the image or use a base image that has them. |
| Embedded files missing (`//go:embed`: `pattern x: no matching files found`) | Path relative to the package directory, files outside the module, or hidden files excluded | Keep embedded files under the package dir; use `all:` prefix to include dot/underscore files. |

## Tests

| Symptom | Likely cause | Fix |
|---|---|---|
| Test result `(cached)` hides a change in external state | Test cache | `-count=1`. |
| `panic: test timed out after 10m0s` | Deadlock or hanging I/O | Read the goroutine dump in the output; add contexts with timeouts; set `-timeout` deliberately. |
| `flag provided but not defined: -update` | Custom flag defined only in some packages but passed to `./...` | Run the flag only for the package that defines it. |
| Flaky with `t.Parallel()` | Shared state, `t.Setenv` in parallel tests (panics), ports, temp files | Isolate state; `t.TempDir()`; `httptest` servers on random ports. |
| Loop-variable capture bugs in older code | Pre-1.22 semantics when `go.mod` says `go 1.21` or older | Raise the `go` directive (changes semantics per module) or copy the variable inside the loop. |
| `testing: warning: no tests to run` | `-run` regex does not match (subtest names use `_` for spaces) | Check names with `go test -list '.*' ./pkg`. |

## Linters

| Symptom | Fix |
|---|---|
| golangci-lint config errors after upgrading | Config format changed between majors; check the `version` key and migrate with the tool's migration command per its docs. |
| `errcheck`: unchecked error | Handle the error; for intentionally ignored `Close` on read-only resources, document it. |
| staticcheck `SA*` findings | These are usually real bugs — fix, do not suppress. |
| `//nolint` everywhere | Require `//nolint:<linter> // reason`; enable `nolintlint`. |
