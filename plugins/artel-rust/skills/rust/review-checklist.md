# Rust review checklist — full version

Run first: `cargo fmt --all -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo test --workspace --all-features`, and `cargo deny check` / `cargo audit` if configured.

## Correctness and API

- [ ] No `unwrap()`, `expect()`, `panic!`, slicing `[a..b]` or indexing `[i]` on data that comes from users, files or the network.
- [ ] Integer arithmetic on untrusted values uses `checked_*`/`saturating_*`; narrowing casts use `try_from`, not `as`.
- [ ] `match` on own enums is exhaustive (no catch-all hiding new variants).
- [ ] Public types derive/implement the expected standard traits (`Debug`, `Clone`, `PartialEq`, `Default`, `Display` for errors).
- [ ] Public API takes borrowed or generic inputs (`&str`, `impl AsRef<Path>`) and is semver-aware; new public enums considered for `#[non_exhaustive]`.
- [ ] `#[must_use]` on builder methods and pure functions where ignoring the result is a bug.
- [ ] Docs on public items, with runnable examples where helpful.

## Errors and logging

- [ ] Libraries return typed errors (thiserror); applications add `.context(...)`.
- [ ] Errors are not silently discarded (`let _ = fallible();` has a comment explaining why).
- [ ] No secrets, tokens or personal data in logs, error messages or `Debug` impls; `#[instrument]` uses `skip(...)` for them.

## Ownership and design

- [ ] No `.clone()` added only to silence the borrow checker where a borrow or restructure works.
- [ ] `Rc<RefCell<_>>` / `Arc<Mutex<_>>` justified; no shared mutable state where message passing is clearer.
- [ ] Lifetimes are elided where possible; structs that own data are not forced to borrow.
- [ ] Features are additive; code compiles with default features, with no default features, and with all features.

## Async and concurrency

- [ ] No blocking I/O, `std::thread::sleep` or heavy CPU inside async code (use `spawn_blocking`).
- [ ] No `std::sync::MutexGuard` or `RefCell` borrow held across `.await`.
- [ ] Timeouts on network calls; bounded channels and concurrency limits.
- [ ] `select!` branches are cancellation-safe; spawned tasks' `JoinHandle`s are awaited or deliberately detached.
- [ ] Graceful shutdown handles in-flight work.

## `unsafe`

- [ ] The crate needs `unsafe` at all; otherwise `#![forbid(unsafe_code)]`.
- [ ] Each `unsafe` block is minimal and has a `// SAFETY:` comment addressing every precondition of every unsafe operation in it.
- [ ] Each `pub unsafe fn` and unsafe trait documents a `# Safety` section with caller obligations.
- [ ] Unsafe code is wrapped in a safe abstraction whose public API cannot cause UB from safe callers (soundness, not just "works in tests").
- [ ] Raw pointers: non-null, aligned, valid for the access size, pointing to initialised memory, and not aliased by a live `&mut`.
- [ ] `from_raw_parts`/`set_len`: length and capacity are proven; elements initialised.
- [ ] No `mem::transmute` where `from_ne_bytes`, `cast`, `bytemuck` or `as` would do; no transmuting between types without a guaranteed layout (`#[repr(C)]`/`#[repr(transparent)]`).
- [ ] Manual `unsafe impl Send/Sync` is justified in a comment.
- [ ] FFI: pointers from C are checked; ownership across the boundary is documented; strings via `CStr`/`CString`; panics do not unwind across `extern "C"` (catch them or use `extern "C-unwind"` deliberately).
- [ ] Tests run under Miri (`cargo +nightly miri test`) where feasible.

## Security

- [ ] SQL uses bind parameters / query macros; identifiers are whitelisted.
- [ ] `Command` uses `.arg()`; no `sh -c` with interpolated input.
- [ ] User-supplied paths are normalised and confined to a base directory.
- [ ] Request bodies, uploads, decompression and recursion are size-limited.
- [ ] Crypto uses maintained crates; secrets compared in constant time; randomness from `rand`'s OS/CSPRNG sources for security purposes.
- [ ] New dependencies: maintained, minimal features, licence acceptable, `build.rs`/proc-macros reviewed, no advisories.

## Performance

- [ ] No allocation or clone per iteration in hot loops; capacities reserved when known.
- [ ] No intermediate `collect()` where an iterator chain works.
- [ ] Buffered I/O; one DB query per request rather than per row.
- [ ] Claims of speedups come with a `criterion` benchmark or profile, run in release mode.

## Tests

- [ ] New behaviour has unit tests; public API has an integration or doc test.
- [ ] Bug fixes include a regression test.
- [ ] Parsers and encoders have property tests or fuzz targets.
- [ ] Tests are deterministic (no real time, network or ordering dependencies).
