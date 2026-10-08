---
name: rust
description: Rust stack guide - cargo workspaces and editions, ownership and lifetimes, thiserror/anyhow errors, tokio async, traits, unsafe review, tests and proptest, clippy, cargo-audit/deny, performance, borrow-checker and linker error playbook; axum, actix-web, serde, sqlx, diesel, clap. Use for any Rust code, Cargo.toml or build failure. Триггеры - "раст", "ошибка компиляции".
paths: "**/*.rs, **/Cargo.toml, Cargo.lock, rust-toolchain.toml, rust-toolchain, clippy.toml, rustfmt.toml, .rustfmt.toml, deny.toml"
---

Reply in the user's language.

# Rust

Rule zero: **follow the project's existing conventions over these defaults.** Read before you write.

## 1. Detect the project

| Read | To learn |
|---|---|
| `Cargo.toml` (root) | single crate or `[workspace]`; `members`, `resolver`, `[workspace.dependencies]`, `[workspace.lints]`, `[profile.*]` |
| each member `Cargo.toml` | `edition`, `rust-version` (MSRV), `[features]`, `[lib]`/`[[bin]]`, `[[bench]]`, dev-dependencies |
| `rust-toolchain.toml` / `rust-toolchain` | pinned channel, components (clippy, rustfmt), targets |
| `Cargo.lock` | resolved versions; whether it is committed |
| `rustfmt.toml`, `clippy.toml`, `deny.toml`, `.cargo/config.toml` | formatting, lint config, dependency policy, target/linker/rustflags overrides |
| `build.rs`, `*-sys` deps | native libraries, codegen, extra toolchain needs |
| CI files | the exact commands that must pass (fmt, clippy flags, test runner, MSRV job) |

Run `cargo metadata --format-version 1 --no-deps` for a machine-readable view of a workspace, and `cargo tree` to see the dependency graph.

## 2. Defaults for new code

- **Edition:** the newest stable edition the project's MSRV allows (2024 needs Rust 1.85+). Do not bump the edition of an existing crate as a side effect — use `cargo fix --edition` as a separate change.
- **Workspace** once there are two crates: a virtual root manifest with `members`, an explicit `resolver` (`"3"` for edition 2024, otherwise `"2"`), shared versions in `[workspace.dependencies]` (members write `serde = { workspace = true }`), shared lints in `[workspace.lints]` with `[lints] workspace = true` in members.
- **Toolchain:** stable, pinned in `rust-toolchain.toml` for apps; set `rust-version` for libraries.
- **Format and lint:** `cargo fmt --all` and `cargo clippy --all-targets --all-features -- -D warnings`. Fix lints rather than `#[allow]`; when an allow is right, scope it narrowly and give a reason (`#[expect(clippy::..., reason = "...")]` on toolchains that support it).
- **Errors:** `thiserror` in libraries, `anyhow` in binaries. **Logging:** `tracing` + `tracing-subscriber`. **Async:** `tokio`. **CLI:** `clap` (derive). **Serialisation:** `serde`. **HTTP server:** `axum`; client: `reqwest`.
- **Lockfile:** commit `Cargo.lock` for binaries and, by current Cargo guidance, usually for libraries too.
- Check the current stable version of each crate on crates.io or with `cargo add <crate>` (it picks the newest compatible). Enable only the features you need.

## 3. Idioms and design

1. **Borrow, don't own, in parameters:** take `&str`, `&[T]`, `&Path`, `impl AsRef<Path>` or `impl IntoIterator`; return owned types. Use `Cow<'_, str>` when you sometimes allocate.
2. **Lifetimes:** rely on elision; add named lifetimes only where the compiler asks or the API must express a relationship. If a struct needs lots of lifetimes, it probably should own its data.
3. **Fighting the borrow checker is a design signal.** Shrink borrow scopes, split structs so fields borrow independently, use indices/IDs instead of references in graphs, or restructure into "compute, then mutate". `Rc<RefCell<_>>` / `Arc<Mutex<_>>` are last resorts, not defaults.
4. **`.clone()` is fine when it is cheap or rare** — but not as the reflex answer to E0382. Prefer `Arc` for shared immutable data.
5. **Make invalid states unrepresentable:** enums over boolean flags, newtypes (`struct UserId(u64)`) over raw primitives, builders or `Default` for many optional fields.
6. **Exhaustive `match`**; avoid `_ =>` on your own enums so new variants cause compile errors. Mark public enums/structs `#[non_exhaustive]` when you expect to extend them.
7. **Traits and generics:** generics (`impl Trait` / `T: Trait`) for static dispatch; `dyn Trait` for heterogeneous collections or to cut compile time and code size. Implement standard traits (`Debug`, `Clone`, `PartialEq`, `Default`, `From`, `Display`) where they make sense. Keep trait bounds on `impl` blocks and functions, not on struct definitions.
8. **Conversions:** implement `From` (you get `Into` free), `TryFrom` for fallible ones. Use `as` only for numeric casts you have reasoned about; prefer `try_from` for narrowing.
9. **Iterators over index loops**; they are as fast and avoid bounds-check and off-by-one bugs.
10. **Visibility:** smallest possible (`pub(crate)` by default); every `pub` item in a library is a semver promise. Document public items with examples (they become doc tests).
11. **`#[must_use]`** on functions whose result must not be ignored; `Result` already is.
12. **No panics in library code paths** reachable from user input: no `unwrap()`, slicing or indexing on unchecked data, or integer overflow assumptions. `expect("why this cannot fail")` documents real invariants.
13. **Async:** never block the runtime (no `std::thread::sleep`, blocking I/O, or heavy CPU in `async fn` — use `tokio::task::spawn_blocking`). Don't hold a `std::sync::Mutex` guard across `.await`; use `tokio::sync::Mutex` only when the lock must span an await. Bound concurrency (`Semaphore`, `JoinSet`, buffered streams); give every network call a timeout (`tokio::time::timeout`); know which futures are cancellation-safe inside `tokio::select!`.
14. **Async in traits:** native `async fn` in traits works on modern stable but is not `dyn`-compatible and does not promise `Send`; use the `async-trait` crate or a boxed-future signature when you need `dyn Trait` or `Send` across `tokio::spawn`.
15. **Features are additive.** A feature must only add API, never change or remove behaviour; Cargo unifies features across the graph.

## 4. Errors and logging

- **Library:** one error enum per module or crate with `#[derive(Debug, thiserror::Error)]`, `#[error("...")]` messages (lowercase, no trailing period), `#[from]` for wrapped sources. Never expose `anyhow::Error` in a public library API.
- **Application:** `anyhow::Result<T>` in `main` and glue code; add context at each boundary with `.context("reading config")` / `.with_context(|| format!("opening {}", path.display()))`; use `bail!` and `ensure!` for early exits.
- **Propagate with `?`.** Convert with `map_err` only when you add information. Don't `match` just to re-wrap.
- **Panics** are for bugs, not for expected failures. `main` returning `anyhow::Result<()>` prints the error chain.
- **Logging:** `tracing` with structured fields (`info!(user_id, "login")`), spans via `#[tracing::instrument(skip(password, body))]` — always `skip` secrets and large values. Configure once in `main` with `tracing_subscriber`; filter with `RUST_LOG` through `EnvFilter` (needs the `env-filter` feature). Libraries emit events but never install a subscriber.
- Never log tokens, passwords, full request bodies or personal data; for secret-holding types implement `Debug` by hand or use a wrapper like `secrecy::SecretString`.

## 5. Testing

- **Unit tests:** in the same file, `#[cfg(test)] mod tests { use super::*; ... }` — they can test private items.
- **Integration tests:** `tests/*.rs`, each file is a separate crate that sees only the public API; shared helpers go in `tests/common/mod.rs`.
- **Doc tests:** examples in `///` comments are compiled and run by `cargo test` (`cargo test --doc` for only them). Use `no_run` for examples that need a network, `ignore` sparingly.
- **Async:** `#[tokio::test]`; for time-dependent code, `#[tokio::test(start_paused = true)]` with tokio's `test-util` feature, then `tokio::time::advance`.
- **Property tests:** `proptest` (`proptest! { #[test] fn roundtrip(s in ".*") { prop_assert_eq!(decode(&encode(&s)), s); } }`) for parsers, encoders, invariants. **Snapshots:** `insta` (`cargo insta review`). **Fuzzing:** `cargo fuzz` (nightly) for parsers of untrusted input.
- **Mocks:** prefer traits at I/O boundaries with hand-written fakes; `mockall` if the project already uses it. For HTTP, a local test server (`wiremock`) beats mocking the client.
- **Database tests:** `#[sqlx::test]` gives each test its own database; or Testcontainers.
- **Commands:**
  - all: `cargo test --workspace --all-features`
  - one test: `cargo test -p my_crate test_name` (substring filter); exact: `cargo test test_name -- --exact`
  - one integration file: `cargo test --test api`
  - see output: `cargo test test_name -- --nocapture`
  - faster runner: `cargo nextest run` if the project uses it (it does not run doc tests — keep `cargo test --doc` in CI)
  - coverage: `cargo llvm-cov` (cargo-llvm-cov) or `cargo tarpaulin`, whichever the project has.
- **Miri** (`cargo +nightly miri test`) for crates with `unsafe` — it detects many kinds of UB at test time.

## 6. Security pitfalls

- **`unsafe` review rules:** every `unsafe` block has a `// SAFETY:` comment proving each precondition; every `pub unsafe fn` documents a `# Safety` section; keep blocks minimal and wrapped in a safe API; crates that need no unsafe get `#![forbid(unsafe_code)]`. Red flags: `mem::transmute`, `set_len`, `from_raw_parts` with unchecked lengths, `&mut` aliasing via raw pointers, `static mut`, unchecked `str::from_utf8_unchecked`, `Send`/`Sync` impls by hand, FFI pointers outliving their owner. Full checklist in [review-checklist.md](review-checklist.md).
- **SQL:** use bind parameters (`sqlx::query(...).bind(x)`, `query!` macros, diesel's DSL); never `format!` user input into SQL. For dynamic SQL use `sqlx::QueryBuilder::push_bind`.
- **Command execution:** `std::process::Command::new(prog).arg(x)` — never build a shell string with `sh -c` from input.
- **Paths:** reject `..` and absolute components before joining user input to a base directory; `Path::join` with an absolute path replaces the base.
- **Denial of service:** cap body sizes (axum `DefaultBodyLimit`, tower-http `RequestBodyLimitLayer`, actix payload config), recursion depth and collection sizes for untrusted input; `with_capacity(untrusted_len)` can exhaust memory. Fast non-SipHash hashers (`ahash`, `rustc-hash`) are not HashDoS-resistant for attacker-controlled keys.
- **Integer overflow** panics in debug and wraps silently in release. Use `checked_*`/`saturating_*` for untrusted arithmetic, or set `overflow-checks = true` in the release profile.
- **Secrets:** read from the environment or a secrets manager at runtime; keep them out of `Debug` output, logs and error messages; `.env` stays git-ignored.
- **Crypto and TLS:** use maintained crates (`rustls`, `ring`/`aws-lc-rs`, RustCrypto); never roll your own; compare MACs in constant time.
- **Supply chain:** `cargo audit` (RustSec advisories) and `cargo deny check` (advisories, licenses, bans, sources; config in `deny.toml`, start with `cargo deny init`). Review new dependencies' `build.rs` and proc-macros — they run at build time with your privileges. Use `--locked` in CI so the lockfile is honoured.

## 7. Performance pitfalls

- **Measure first:** always profile `--release` builds. Benchmarks with `criterion` (`[[bench]] harness = false`, run `cargo bench`); flame graphs with `cargo flamegraph` (cargo-flamegraph) or `perf` — set `debug = "line-tables-only"` (or `true`) in `[profile.release]` to get symbols.
- **Allocations:** `Vec::with_capacity`/`String::with_capacity` when the size is known; reuse buffers in loops (`clear()` keeps capacity); return iterators instead of collecting intermediate `Vec`s; `&str` over `String` in hot paths.
- **Clones:** look for `.clone()` / `.to_string()` / `.to_owned()` inside loops; borrow or use `Arc`. Clippy's `perf` lints (`redundant_clone`, `needless_collect`) help.
- **Iterators:** chains compile to tight loops; avoid `collect::<Vec<_>>()` just to call `.len()` or iterate again.
- **Dispatch:** `Box<dyn Trait>` in a hot loop prevents inlining; generics do, at the cost of code size.
- **Locks:** contention on a global `Mutex` serialises async tasks; shard, use `RwLock`, channels, or message passing.
- **I/O:** wrap files and sockets in `BufReader`/`BufWriter`; lock `stdout` once when printing in a loop.
- **Release profile:** consider `lto = "thin"` or `true` and `codegen-units = 1` for final binaries; `panic = "abort"` only if nothing relies on unwinding.
- **Compile time:** too many generics or proc-macros, heavy default features. `cargo build --timings` shows where time goes.

## 8. Build and run errors

The first error is the real one. Full playbook in [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| E0382 use of moved value | value moved into a call, closure or loop iteration | pass `&x`, iterate `&v`, clone if cheap, or restructure ownership |
| E0499 more than one mutable borrow | two live `&mut` to the same data | narrow scopes, split borrows by field, `split_at_mut`, or use indices |
| E0502 borrow as mutable while also borrowed as immutable | holding a reference (often from `.iter()` / `get`) while mutating | copy out what you need first, or collect then mutate |
| E0597 / E0716 does not live long enough / temporary dropped | reference outlives its owner or a temporary | bind the value to a `let` in an outer scope, or own the data |
| E0505 / E0506 move or assign while borrowed | borrow still live | end the borrow before moving/assigning |
| E0106 missing lifetime specifier | returned reference with ambiguous source | add a named lifetime tying output to one input, or return owned |
| E0373 closure may outlive the current function | thread/task closure borrows locals | `move` closure; share with `Arc` |
| E0277 trait bound not satisfied | missing impl, missing derive, wrong type, or future not `Send` | read the "required by" note; add derive/impl, change type, drop non-`Send` values before `.await` |
| E0599 no method named ... found | trait not in scope, or bound missing | `use` the trait (e.g. `std::io::Write`), add the bound |
| E0432 / E0433 unresolved import / failed to resolve | wrong path, crate not in `Cargo.toml`, feature not enabled, edition path rules | fix the path, `cargo add`, enable the feature |
| "expected `Foo`, found `Foo`" from two crates | two versions of one crate in the graph | `cargo tree -d`, align versions |
| `linker 'cc' not found` / `link.exe` not found | no system C toolchain | install build-essential / Xcode CLT / MSVC Build Tools |
| openssl-sys build failure | missing OpenSSL dev headers or `pkg-config` | install them, or switch the dependency to its rustls feature |
| works alone, fails in workspace (or the reverse) | feature unification | `cargo tree -e features -i <crate>`; declare the features you use |
| `there is no reactor running` / cannot start a runtime from within a runtime | tokio called outside, or `block_on` inside, a runtime | enter the runtime once in `main`; use `.await` or `spawn_blocking` |

## 9. Review checklist

- [ ] `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` and tests pass.
- [ ] No `unwrap()`/`expect()`/indexing on untrusted data in non-test code.
- [ ] Errors carry context; library errors are typed; no `anyhow` in public lib APIs.
- [ ] Every `unsafe` has a `// SAFETY:` justification and a safe wrapper.
- [ ] No blocking calls or `std` mutex guards across `.await`; timeouts on I/O.
- [ ] SQL and shell commands use parameters/args, not string building.
- [ ] No needless `clone()`/`collect()` in hot paths; no secrets in logs or `Debug`.
- [ ] New dependencies justified, minimal features, `cargo deny`/`cargo audit` clean.
- [ ] Public API changes are semver-aware and documented.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **axum:** handlers are async fns of extractors; the body extractor (`Json`, `Form`, `Bytes`) must be the last argument; shared state via `State<AppState>` + `.with_state(...)`; app errors implement `IntoResponse`. Use `#[axum::debug_handler]` (macros feature) to decode "handler does not implement Handler" errors. Path syntax changed between major versions — check the project's version.
- **actix-web:** create `web::Data` outside the `HttpServer::new` closure and clone it in, or each worker gets its own state; configure payload/JSON limits explicitly.
- **serde:** `#[serde(rename_all = "camelCase")]`, `#[serde(default)]`, `skip_serializing_if = "Option::is_none"`, `deny_unknown_fields` for strict input; separate DTOs from domain types.
- **sqlx:** compile-time `query!`/`query_as!` need `DATABASE_URL` or offline data from `cargo sqlx prepare` (commit the `.sqlx` directory); migrations with `sqlx migrate` or `sqlx::migrate!()`.
- **diesel:** synchronous — use `diesel-async` or run queries on `spawn_blocking` from async code; `schema.rs` is generated by the CLI, don't hand-edit it.
- **clap:** derive `Parser`/`Subcommand`/`ValueEnum`; add a test that calls `Cli::command().debug_assert()`.

Details, examples and gotchas: [frameworks.md](frameworks.md).
