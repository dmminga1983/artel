# Undefined behaviour and memory safety — catalogue

Undefined behaviour (UB) means the compiler may assume it never happens; optimised builds can delete checks, reorder code or "work" until a compiler upgrade. Tests passing is not proof of absence. Build test configurations with sanitizers.

## Sanitizers

| Tool | Flags (GCC/Clang) | Finds | Notes |
|---|---|---|---|
| AddressSanitizer | `-fsanitize=address -fno-omit-frame-pointer -g` | out-of-bounds (heap, stack, globals), use-after-free, double free, use-after-return (with runtime option), leaks (LeakSanitizer, on by default on Linux) | ~2x slowdown; MSVC: `/fsanitize=address` |
| UndefinedBehaviorSanitizer | `-fsanitize=undefined` (+ `-fno-sanitize-recover=undefined` to abort) | signed overflow, bad shifts, null/misaligned access, invalid enum/bool values, out-of-bounds array indexing with known bounds, invalid casts with `-fsanitize=vptr` | cheap; combine with ASan |
| ThreadSanitizer | `-fsanitize=thread -g` | data races, some deadlocks | separate build; not combinable with ASan/MSan |
| MemorySanitizer | `-fsanitize=memory` (Clang, Linux) | reads of uninitialised memory | all code including dependencies must be instrumented |
| `_GLIBCXX_ASSERTIONS` / libc++ hardening | `-D_GLIBCXX_ASSERTIONS` or libc++ hardening mode | precondition checks in the standard library (`operator[]` bounds, empty `front()`) | cheap enough for test and many production builds |
| Valgrind memcheck | none (runs the binary) | invalid reads/writes, leaks, uninitialised values | slower; useful when you can't rebuild |

Runtime options (environment variables): `ASAN_OPTIONS=detect_leaks=1:abort_on_error=1`, `UBSAN_OPTIONS=print_stacktrace=1`, `TSAN_OPTIONS=second_deadlock_stack=1`. Use `-O1` or higher with `-g` for readable but realistic reports.

## The common UB list

| UB | Example | Prevent / detect |
|---|---|---|
| Out-of-bounds access | `v[v.size()]`, `buf[len]`, pointer arithmetic beyond one-past-the-end | `.at()` at boundaries, `std::span`, ranges; ASan, hardened stdlib |
| Use after free / dangling pointer | returning `&local`, keeping a pointer into a `vector` across `push_back` | RAII, ownership types, re-fetch after mutation; ASan |
| Dangling views | `std::string_view sv = make_string();` / `std::span` over a temporary vector | never bind views to temporaries; views as parameters, owners as members; Clang `-Wdangling` warnings |
| Iterator invalidation | `for (auto& x : v) if (...) v.push_back(...)` | erase-remove idiom / `std::erase_if` (C++20), index loops when growing |
| Double free / mismatched free | `delete` on `new[]`, `free` on `new`, two owners | `unique_ptr`, `vector`; ASan |
| Null dereference | unchecked pointer from lookup/API | references for non-null, `std::optional`, checks; UBSan/ASan |
| Uninitialised read | `int x; if (cond) x = 1; return x;` | initialise at declaration; `-Wuninitialized`, `-Wmaybe-uninitialized`; MSan, Valgrind |
| Signed integer overflow | `int a = INT_MAX; a + 1`, `INT_MIN / -1`, `-INT_MIN` | wider types, checked arithmetic (`__builtin_add_overflow`, C23 `<stdckdint.h>`), limits; UBSan |
| Division by zero | `x / n` with untrusted `n` | check `n`; UBSan |
| Invalid shifts | `1 << 32` on 32-bit int, negative shift amount, shifting negative values (before C++20) | mask/validate shift counts; use unsigned; UBSan |
| Strict aliasing violation | `*(float*)&some_int`, casting buffers to structs | `std::memcpy`, `std::bit_cast` (C++20); `-fno-strict-aliasing` only as a project-wide decision |
| Misaligned access | `*(uint32_t*)(buf + 1)` | `memcpy` into a local; UBSan `alignment` |
| Data race | two threads, one writes, no synchronisation | mutexes, atomics, message passing; TSan |
| Missing return | non-void function falling off the end | `-Wreturn-type` (make it an error) |
| Modifying a string literal or `const` object | `char* s = "abc"; s[0] = 'x';` | `const char*`, `std::string`; `-Wwrite-strings` (C) |
| Object lifetime errors | using an object after its destructor, placement-new misuse, `reinterpret_cast` to an object that was never created | RAII; `std::launder`/`std::start_lifetime_as` only with expertise |
| Unsequenced modifications | `i = i++ + 1` (pre-C++17 rules), `f(i++, i++)` | one side effect per expression; `-Wsequence-point` |
| Infinite loop without side effects (C++) | `while (true) {}` with no I/O, volatile or atomics | forward-progress rules — the loop may be removed |
| Calling a pure virtual from a constructor/destructor | base constructor calling a virtual implemented in derived | don't call virtuals during construction/destruction |
| ODR violation | two TUs define `struct Config` differently, or the same inline function compiled with different macros | one definition per header; consistent flags; GCC `-Wodr` with LTO, ASan `detect_odr_violation` |
| Overlapping `memcpy` | source and destination overlap | `memmove` |
| `va_arg` type mismatch / format mismatch | `printf("%d", some_long)` | `-Wformat`; `fmt`/`std::format` |
| Exceptions across C or `noexcept` boundaries | throwing through a C callback | catch at the boundary; `noexcept` calls `std::terminate` |

## C-specific pitfalls

- `gets` (removed from C11), `strcpy`, `strcat`, `sprintf`, `vsprintf`, `scanf("%s", ...)`: unbounded writes. Use `fgets`, `snprintf`, `strnlen` with explicit limits, or a vetted string library. `strncpy` does not always NUL-terminate — it is not a safe `strcpy`.
- `strtok` is not reentrant (`strtok_r` / `strtok_s`); `atoi`/`atol` return 0 on error — use `strtol` with `errno` and end-pointer checks.
- `realloc` failure returns `NULL` and keeps the old block — assign to a temporary first: see the snippet below.
- `malloc(n * size)` overflow — use `calloc(n, size)` (checks the multiplication) or check before multiplying.
- Every `malloc`/`fopen`/`open` has a matching release on every path, including errors.
- Variable-length arrays from untrusted sizes can overflow the stack.

```c
void *tmp = realloc(buf, new_size);
if (tmp == NULL) {
    /* buf is still valid; handle the error and free(buf) where appropriate */
    return -1;
}
buf = tmp;
```

## Integer handling

- Sizes and indices: `size_t` (or `std::ptrdiff_t` for differences); compare like with like; `std::ssize()` (C++20) for signed sizes.
- Narrowing: `static_cast` only after range checks; `gsl::narrow` or a checked helper throws on loss.
- `std::cmp_less` and friends (C++20) compare signed and unsigned values correctly.
- Untrusted lengths in file formats or protocols: check against the remaining buffer **before** reading, and against a sane maximum before allocating.

## Format strings

```c
printf(user);            /* BAD: %n and %s in user data read/write memory */
printf("%s", user);      /* good */
syslog(LOG_INFO, user);  /* BAD for the same reason */
```

Enable `-Wformat=2 -Wformat-security` and mark your own printf-like functions with `__attribute__((format(printf, N, M)))` (GCC/Clang) so the compiler checks callers.

## Command execution and files

- `system()` / `popen()` run a shell: never build their strings from input. Use `posix_spawn`/`execve` with an argument vector, or a library that does.
- Temporary files: `mkstemp` (POSIX) or `std::filesystem::temp_directory_path` + exclusive creation; never `tmpnam`/`mktemp`.
- TOCTOU: open first, then check properties on the file descriptor (`fstat`), with `O_NOFOLLOW`/`O_EXCL` where relevant.
- Path traversal: canonicalise (`std::filesystem::weakly_canonical`) and verify the result stays under the base directory.

## Randomness and secrets

- `rand()`, `std::mt19937`, `std::random_device` (implementation-defined quality) are not for keys or tokens. Use `getrandom`/`getentropy` (Linux/BSD), `BCryptGenRandom` (Windows), `arc4random_buf` (BSD/macOS), or a crypto library (libsodium, OpenSSL).
- Zero secrets after use with `explicit_bzero`, `memset_s` (C11 Annex K where available), `SecureZeroMemory`, or `sodium_memzero`.
- Compare MACs/tokens in constant time (`CRYPTO_memcmp`, `sodium_memcmp`).
