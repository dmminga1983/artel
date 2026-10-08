# Rust build and run errors — playbook

Read the **first** error. `rustc --explain E0502` prints the official explanation with examples for any code. Run `cargo check` for the fastest feedback loop; `cargo clippy` often suggests the exact fix.

## Borrow checker classics

### E0382 — use of moved value

```rust
let names = vec![String::from("a")];
for n in names { println!("{n}"); }   // `names` moved into the loop
println!("{}", names.len());           // E0382
```

Fixes, in order of preference:
- Iterate by reference: `for n in &names`.
- Pass a reference to the function: `fn show(v: &[String])`.
- Move later, or restructure so the last use is the move.
- `.clone()` if the data is small or the clone is rare.
- `Rc`/`Arc` if ownership is truly shared.

Closures: a `move` closure takes ownership of everything it captures. Clone *before* the closure (`let tx2 = tx.clone(); thread::spawn(move || ... tx2 ...)`).

### E0499 — cannot borrow as mutable more than once

Two `&mut` to the same value are alive at once.
- Shrink the first borrow's scope (non-lexical lifetimes end a borrow at its last use).
- Borrow disjoint fields directly (`let a = &mut s.a; let b = &mut s.b;`) instead of through `&mut self` methods.
- Slices: `split_at_mut`, `chunks_mut`, `iter_mut`.
- Collections: store indices or keys, then look up again; `HashMap::entry` instead of `get` + `insert`.

### E0502 — cannot borrow as mutable because it is also borrowed as immutable

```rust
let first = &v[0];
v.push(4);          // E0502: push may reallocate and invalidate `first`
println!("{first}");
```

- Copy/clone the value you need out first (`let first = v[0];` for `Copy` types).
- Collect what to change, then apply: `let to_add: Vec<_> = v.iter().filter(..).cloned().collect(); v.extend(to_add);`.
- `retain`, `retain_mut`, `drain`, `iter_mut` express "mutate while iterating" safely.

### E0597 — borrowed value does not live long enough / E0716 temporary value dropped while borrowed

The reference outlives the owner.
- Move the owner to an outer scope (`let s = make(); let r = &s;`).
- Bind temporaries: `let s = get_string(); let t = s.trim();` instead of `let t = get_string().trim();`.
- Return owned data (`String`, `Vec<T>`) instead of a reference to a local (that is E0515).
- Spawned threads/tasks need `'static`: move owned data or `Arc` into them, or use `std::thread::scope`.

### Other ownership errors

| Code | Meaning | Usual fix |
|---|---|---|
| E0505 | move out while borrowed | end the borrow first or clone |
| E0506 | assign to borrowed value | end the borrow first |
| E0507 | cannot move out of borrowed content / index | `.clone()`, `std::mem::take`, `Option::take`, `std::mem::replace`, or match on `&` |
| E0515 | return reference to local | return the owned value |
| E0596 | cannot borrow as mutable | declare `let mut`, take `&mut self`, or interior mutability if justified |
| E0384 | assign twice to immutable variable | `let mut` or shadow with a new `let` |
| E0373 | closure may outlive the function | `move` closure; `Arc` for shared data; `thread::scope` for borrowed data |
| E0106 | missing lifetime specifier | `fn f<'a>(x: &'a str, y: &str) -> &'a str` or return owned |
| E0621 / lifetime mismatch | signature promises a longer lifetime than the body provides | fix the signature or own the data |

## Trait and type errors

| Symptom | Cause | Fix |
|---|---|---|
| E0277 `the trait bound X: Y is not satisfied` | missing impl/derive, wrong type, generic missing a bound | read "required by a bound in"; add `#[derive(...)]`, the impl, or `where T: Y` |
| E0277 `` `?` couldn't convert the error `` | no `From<SourceErr> for YourErr` | `#[from]` in thiserror, `map_err`, or `anyhow::Result` in apps |
| `future cannot be sent between threads safely` | a non-`Send` value (`Rc`, `RefCell` borrow, `std::sync::MutexGuard`) is held across `.await` inside `tokio::spawn` | drop it before `.await` (put it in an inner block), use `Arc`/`tokio::sync::Mutex`, or `spawn_local` |
| E0599 no method found | trait not imported, or bound missing on a generic | `use` the trait (`std::io::Write`, `futures::StreamExt`, `std::str::FromStr`); add the bound |
| E0308 mismatched types | `&String` vs `&str`, `Option<T>` vs `T`, `()` from a trailing `;` | `.as_str()`, `?`/`ok_or`, remove the semicolon |
| E0282 / E0283 type annotations needed | `collect()`, `parse()`, `into()`, `Default::default()` | turbofish (`collect::<Vec<_>>()`) or annotate the `let` |
| E0038 trait is not dyn compatible (object safe) | generic methods, `Self` returns, `async fn` in the trait | add `where Self: Sized` to that method, split the trait, or use generics |
| E0117 / E0210 orphan rule | implementing a foreign trait for a foreign type | newtype wrapper |
| E0119 conflicting implementations | blanket impl overlaps | narrow the blanket impl or use a newtype |
| "Handler<_, _> is not implemented" (axum) | an extractor is not `FromRequestParts`, body extractor not last, return type not `IntoResponse`, or future not `Send` | annotate the handler with `#[axum::debug_handler]` for a precise message |
| expected `Foo`, found `Foo` (same name) | two semver-incompatible versions of one crate | `cargo tree -d` / `cargo tree -i foo`; align versions, use the re-export from the crate that owns the type |

## Resolution, features and toolchain

| Symptom | Cause | Fix |
|---|---|---|
| E0432/E0433 unresolved import | wrong path; crate missing; item behind a feature; `crate::` vs crate name | fix path; `cargo add`; enable the feature in `Cargo.toml` |
| item "is gated behind the `x` feature" | feature not enabled | `cargo add crate --features x` or edit `features = [...]` |
| E0658 use of unstable feature | needs nightly or a newer stable | upgrade toolchain or avoid the API; don't switch to nightly casually |
| `package requires rustc 1.xx or newer` | dependency MSRV above your toolchain | `rustup update`, or pin an older dependency (`cargo update -p crate --precise <ver>`) |
| `failed to select a version for` | conflicting version requirements | `cargo tree -i crate`; relax/align requirements; `[patch]` as a temporary measure |
| `the lock file needs to be updated but --locked was passed` | `Cargo.toml` changed without updating `Cargo.lock` | run `cargo update -w` (or a plain build) locally and commit the lockfile |
| builds alone, breaks in workspace (or vice versa) | feature unification across members | declare every feature the crate itself uses; `cargo tree -e features`; `cargo hack --each-feature check` |
| edition errors after upgrade (`gen` keyword, `unsafe extern`, `expr` fragment, RPIT capture) | edition 2024 rules | `cargo fix --edition`, then review the diff |
| `error: no such command: nextest` / `audit` / `deny` | cargo subcommand not installed | `cargo install cargo-nextest` (etc.) or the project's documented installer |

## Linker and native dependencies

| Symptom | Cause | Fix |
|---|---|---|
| `linker 'cc' not found` | no C toolchain | Debian/Ubuntu: `sudo apt install build-essential`; macOS: `xcode-select --install`; Windows MSVC target: install "Desktop development with C++" Build Tools |
| `link.exe` not found / `LNK1181` | MSVC tools or Windows SDK missing | install Build Tools; or use the GNU target consistently |
| `Could not find directory of OpenSSL installation` (openssl-sys) | missing headers / `pkg-config` | `sudo apt install pkg-config libssl-dev` (dnf: `openssl-devel`); or enable the dependency's `rustls` feature and drop native TLS |
| `undefined reference to ...` / `ld: library not found for -lfoo` | system lib missing or `build.rs` link directives wrong | install the `-dev` package; check `cargo:rustc-link-lib` / `cargo:rustc-link-search` output |
| cross-compile fails at link | no linker for the target | add `[target.<triple>] linker = "..."` in `.cargo/config.toml`, or use `cross` / `cargo zigbuild` |
| `failed to run custom build command for xxx-sys` | the `build.rs` needs a tool (cmake, clang for bindgen, protoc) | read the stderr section; install the named tool |
| huge debug binaries / slow links | full debuginfo | `debug = "line-tables-only"` in dev profile, or a faster linker (`lld`, `mold`) via `.cargo/config.toml` |

## Runtime panics and async

| Symptom | Cause | Fix |
|---|---|---|
| `there is no reactor running, must be called from the context of a Tokio runtime` | tokio API used outside a runtime, or a different runtime | `#[tokio::main]`/`#[tokio::test]`; don't mix runtimes |
| `Cannot start a runtime from within a runtime` | `block_on` or `#[tokio::main]` nested | `.await` instead; `spawn_blocking` for sync code that must block |
| `#[tokio::main]` errors about missing features | tokio features | enable `macros` and `rt-multi-thread` (or use `flavor = "current_thread"` with `rt`) |
| `already borrowed: BorrowMutError` | `RefCell` double borrow | shorten borrow guards; rethink the shared mutability |
| `attempt to subtract with overflow` | debug overflow check | `checked_sub`/`saturating_sub`, or fix the logic |
| task hangs / deadlock | lock held across `.await`, or a full bounded channel with no reader | release guards before awaiting; check channel ownership |
| `index out of bounds` | unchecked indexing | `.get(i)`, iterate, or validate length first |

Run with `RUST_BACKTRACE=1` for a backtrace of a panic.
