# C/C++ review checklist — full version

Run first: the project's build with its warning set (ideally on every supported compiler), tests under ASan+UBSan, TSan for concurrent code, clang-tidy on changed files, clang-format check.

## Ownership and lifetime

- [ ] Every resource has exactly one owner expressed in the type (`unique_ptr`, container, RAII wrapper); raw pointers and references are non-owning.
- [ ] No naked `new`/`delete`, `malloc`/`free` ownership outside low-level wrappers; C code frees on every path.
- [ ] `shared_ptr` only for real shared ownership; cycles broken with `weak_ptr`.
- [ ] Rule of zero, or all five special members considered and declared (`= default`/`= delete`).
- [ ] Move constructors/assignments `noexcept`; moved-from objects not used.
- [ ] No references, `string_view`, `span` or iterators that can outlive their source (temporaries, container growth, returned locals, captured `this` in async callbacks).
- [ ] Lambdas capturing by reference don't escape the scope (threads, callbacks, coroutines).

## Correctness

- [ ] Untrusted sizes, indexes and offsets validated before use; arithmetic on them checked for overflow.
- [ ] Signed/unsigned comparisons and narrowing conversions are deliberate.
- [ ] All variables initialised; no reads of indeterminate values.
- [ ] Return values of C APIs and `[[nodiscard]]` functions checked.
- [ ] `switch` over `enum class` handles all values (`-Wswitch`); no fall-through without `[[fallthrough]]`.
- [ ] Floating-point comparisons use tolerances where appropriate.
- [ ] No reliance on undefined, unspecified or implementation-defined behaviour without a comment (see [undefined-behaviour.md](undefined-behaviour.md)).

## API and design

- [ ] `const`-correct members and parameters; `explicit` constructors; `override`/`final`.
- [ ] Polymorphic bases have virtual (or protected) destructors; no virtual calls during construction.
- [ ] Parameters follow the conventions (value for cheap/sinks, `const&`/views for read-only).
- [ ] Error handling consistent with the project (exceptions vs `expected` vs codes); destructors don't throw; nothing throws across C boundaries.
- [ ] Headers self-contained, minimal includes, no `using namespace`, include guards.
- [ ] Public library ABI: no inline changes to exported class layouts without a version bump; symbol visibility controlled.

## Concurrency

- [ ] Shared mutable state guarded by a mutex or atomic; lock order consistent (`std::scoped_lock` for several).
- [ ] No data races on containers (`std::vector` is not thread-safe for concurrent writes).
- [ ] Threads joined or `jthread`; no detached threads touching freed objects.
- [ ] Condition variables used with a predicate.
- [ ] Atomics' memory orders justified when not `seq_cst`.

## Security

- [ ] No `gets`/`strcpy`/`strcat`/`sprintf`/`scanf("%s")`; bounded alternatives with truncation checks.
- [ ] No user-controlled format strings; printf-like wrappers annotated with the format attribute.
- [ ] No `system`/`popen` with user data; temp files via `mkstemp`; paths canonicalised and confined.
- [ ] Secrets wiped with non-elidable functions; CSPRNG for tokens; constant-time comparisons.
- [ ] Parsers of untrusted input have fuzz targets.
- [ ] Hardening flags present in release builds (as the project defines them).

## Build

- [ ] CMake changes target-based (`target_*`), correct `PUBLIC`/`PRIVATE`/`INTERFACE`; no global flags; no hard-coded absolute paths.
- [ ] New dependencies come through the project's package manager, pinned (baseline, lockfile, `URL_HASH`).
- [ ] Builds on all supported compilers/platforms; no compiler extensions sneaking in.
- [ ] Tests registered with CTest; sanitizer preset still passes.

## Performance

- [ ] No copies of large objects in hot paths; `reserve` where sizes are known; no per-iteration allocations.
- [ ] Data layout cache-friendly for hot loops; no false sharing.
- [ ] No `std::endl` in loops; buffered I/O.
- [ ] Claims backed by a profile (`perf`, VTune, Instruments) or Google Benchmark on optimised builds.

## Tests

- [ ] New behaviour and bug fixes have tests (GoogleTest/Catch2) that run in CI.
- [ ] Edge cases: empty input, maximum sizes, overflow boundaries, invalid UTF-8, error paths.
- [ ] Tests deterministic (no timing races, no dependence on uninitialised memory or iteration order of unordered containers).
