---
name: cpp
description: C and C++ stack guide - modern target-based CMake and presets, vcpkg/Conan, compiler warnings, RAII, smart pointers, rule of zero/five, move semantics, undefined behaviour, ASan/UBSan/TSan, clang-tidy, GoogleTest/Catch2, fuzzing, memory-safety pitfalls, perf profiling, linker error playbook. Use for any C/C++ code, CMakeLists.txt or build/link failure. Триггеры - "плюсы", "си", "не линкуется".
paths: "**/*.c, **/*.h, **/*.cc, **/*.cpp, **/*.cxx, **/*.hpp, **/*.hh, **/*.hxx, **/*.ipp, **/*.inl, **/CMakeLists.txt, **/*.cmake, CMakePresets.json, vcpkg.json, conanfile.txt, conanfile.py, meson.build, .clang-tidy, .clang-format"
---

Reply in the user's language.

# C and C++

Rule zero: **follow the project's existing conventions over these defaults.** Read before you write.

## 1. Detect the project

| Read | To learn |
|---|---|
| `CMakeLists.txt` (root and subdirs), `cmake/*.cmake` | CMake minimum version, targets, language standard, options, how dependencies are found |
| `CMakePresets.json` / `CMakeUserPresets.json` | named configure/build/test presets — use them instead of inventing flags |
| `vcpkg.json` (+ `vcpkg-configuration.json`) | vcpkg manifest mode, baseline, features |
| `conanfile.txt` / `conanfile.py`, Conan profiles | Conan dependencies and settings |
| `meson.build`, `Makefile`, `configure.ac`, `MODULE.bazel`/`BUILD`, `*.vcxproj` | other build systems — use them as they are; don't migrate unasked |
| `.clang-format`, `.clang-tidy`, `.editorconfig`, `compile_commands.json` | style, enabled checks, the real compile flags |
| CI files | compilers and versions, standard, sanitizer jobs, warning policy |
| headers style | C or C++, standard (`std::span`, concepts, `<format>` suggest C++20), exceptions/RTTI allowed?, naming |

Ask, or check CI, for the supported compilers (GCC, Clang, MSVC, Apple Clang) and platforms; portability limits what you may use.

## 2. Defaults for new code

- **Standard:** C++20 (or what the project uses) via `target_compile_features(<t> PUBLIC cxx_std_20)`; C17 for C (`c_std_17`). No compiler-specific extensions unless the project relies on them (`CMAKE_CXX_EXTENSIONS OFF`).
- **Build:** out-of-source, `cmake -S . -B build` then `cmake --build build`, or `cmake --preset <name>` + `cmake --build --preset <name>`. Personal presets go in `CMakeUserPresets.json` (git-ignored).
- **Modern CMake:** everything is a target; per-target `target_include_directories`, `target_link_libraries`, `target_compile_options`, `target_compile_definitions` with `PUBLIC`/`PRIVATE`/`INTERFACE`. No global `include_directories`, `link_libraries`, `add_definitions` or editing `CMAKE_CXX_FLAGS` in project files. Details: [cmake.md](cmake.md).
- **Dependencies:** the project's package manager (vcpkg manifest, Conan 2, or `FetchContent` for small header/source deps) consumed via `find_package(... CONFIG REQUIRED)` and imported targets (`fmt::fmt`).
- **Warnings:** GCC/Clang `-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wsign-conversion -Wnon-virtual-dtor -Wold-style-cast -Woverloaded-virtual -Wformat=2 -Wimplicit-fallthrough`; MSVC `/W4 /permissive-`. Warnings as errors in CI (`CMAKE_COMPILE_WARNING_AS_ERROR` or `-Werror` in a preset), not forced on consumers of a library.
- **Tooling:** `CMAKE_EXPORT_COMPILE_COMMANDS=ON` for clangd/clang-tidy; clang-format for formatting.
- **Libraries:** `fmt`/`std::format`, `spdlog` for logging, GoogleTest or Catch2 for tests — only if the project doesn't already have equivalents.

## 3. Idioms and design (C++)

1. **RAII for every resource** (memory, files, sockets, locks, handles). No naked `new`/`delete`; wrap C handles in `std::unique_ptr<T, Deleter>` or a small owning class.
2. **Ownership in types:** `std::unique_ptr` = sole owner (default), `std::shared_ptr` = genuinely shared (rare; beware cycles → `std::weak_ptr`), raw pointer / reference = non-owning observer. Create with `std::make_unique` / `std::make_shared`.
3. **Rule of zero:** let members manage resources so the class needs no destructor/copy/move. If you write any of destructor, copy ctor/assignment, move ctor/assignment, think about all five (**rule of five**), and `= default` / `= delete` explicitly.
4. **Move semantics:** moved-from objects are valid but unspecified — don't use them except to assign or destroy. Mark move constructors `noexcept` (containers fall back to copying otherwise). Don't `std::move` a return of a local (blocks copy elision), and never `std::move` from a `const` object.
5. **Parameters:** cheap types by value; read-only large types by `const T&` or `std::string_view` / `std::span<const T>`; sink parameters by value then `std::move`. Never store a `string_view`/`span` that outlives its source.
6. **const-correctness:** `const` member functions, `const` locals by default, `constexpr` where possible; `[[nodiscard]]` on functions whose result must be used.
7. **Polymorphic bases:** public virtual destructor (or protected non-virtual); `override` on overrides, `final` where intended; no virtual calls in constructors/destructors.
8. **Explicit:** single-argument constructors `explicit`; `enum class` over plain enums; `static_cast` etc. over C casts; `nullptr` not `NULL`/`0`.
9. **Containers and algorithms:** `std::vector` by default; `<algorithm>`/ranges over hand-written loops; `.at()` or checked access at trust boundaries; watch iterator/reference invalidation after `push_back`, `insert`, `erase`.
10. **Error strategy is a project decision:** exceptions, `std::expected` (C++23)/`tl::expected`, or error codes — be consistent. Destructors and move operations don't throw.
11. **Headers:** include what you use; include guards or `#pragma once`; no `using namespace` in headers; keep headers light (forward declarations, pimpl for ABI-stable libraries).
12. **Concurrency:** `std::jthread`/`std::thread` joined, `std::scoped_lock` for multiple mutexes, `std::atomic` for simple flags/counters; shared mutable data is either guarded or immutable. Data races are UB.
13. **C code:** check every return value; one clear owner per allocation, freed on all paths (`goto cleanup` is idiomatic); sizes in `size_t`; bounds passed alongside pointers; `static` for file-local functions; no VLAs from untrusted sizes.

Undefined behaviour you must not rely on, with examples: [undefined-behaviour.md](undefined-behaviour.md).

## 4. Errors and logging

- Don't ignore errors: `[[nodiscard]]` on error-returning functions; check `errno`-based APIs immediately; convert C error codes into the project's error type at the boundary.
- Exceptions: throw by value, catch by `const&`; derive from `std::exception`; catch at boundaries (thread entry, `main`, API surface). Never let exceptions escape destructors, `noexcept` functions, C callbacks or across a C ABI.
- `assert` for internal invariants (disabled with `NDEBUG`); real validation for external input regardless of build type.
- Logging: the project's logger (spdlog, glog, custom); format with `fmt`/`std::format` — never pass user data as a format string. Don't log secrets or full buffers.

## 5. Testing

- **GoogleTest:** `TEST(Suite, Case)`, fixtures with `TEST_F`, `EXPECT_*` (continues) vs `ASSERT_*` (stops), parameterised `TEST_P`; register with `include(GoogleTest)` + `gtest_discover_tests(<target>)`; link `GTest::gtest_main`.
- **Catch2 (v3):** `TEST_CASE("name", "[tag]")`, `SECTION`, `REQUIRE`/`CHECK`, generators; link `Catch2::Catch2WithMain`, register with `catch_discover_tests`.
- **Layout:** `tests/` with its own `CMakeLists.txt`, guarded by an option or `BUILD_TESTING` (`include(CTest)`); the library is a target the test links against — don't recompile sources into the test.
- **Commands:**
  - all: `ctest --test-dir build --output-on-failure` (or `ctest --preset <name>`)
  - by name: `ctest --test-dir build -R 'Parser'`
  - GoogleTest directly: `./build/tests/unit_tests --gtest_filter='Parser.*'`
  - Catch2 directly: `./build/tests/unit_tests "[parser]"`
- **Sanitizers in tests:** a dedicated preset/build with `-fsanitize=address,undefined -fno-omit-frame-pointer -g` (Clang/GCC); TSan in a separate build (`-fsanitize=thread`, cannot be combined with ASan); MSVC supports `/fsanitize=address`. Make UBSan fatal with `-fno-sanitize-recover=undefined`.
- **Fuzzing:** libFuzzer target `extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)` built with `-fsanitize=fuzzer,address` (Clang), or AFL++. Fuzz every parser of untrusted input; keep crashing inputs as regression tests.
- **Coverage:** `--coverage` (gcov/lcov/gcovr) or Clang source-based coverage (`-fprofile-instr-generate -fcoverage-mapping`, `llvm-cov`).
- **Static analysis:** `clang-tidy -p build <file>` (or `run-clang-tidy -p build`), driven by `.clang-tidy` (common sets: `bugprone-*`, `cert-*`, `cppcoreguidelines-*`, `modernize-*`, `performance-*`); `cppcheck`; compiler `-fanalyzer` (GCC) where useful.

## 6. Security pitfalls

- **Buffer overflows:** no `gets`, `strcpy`, `strcat`, `sprintf`, `scanf("%s")`, unchecked `memcpy`. Use `std::string`, `std::vector`, `std::span` with sizes, `snprintf` (check its return for truncation), `std::format`. Every pointer + length pair is validated before use.
- **Format strings:** `printf(user_input)` is an exploit — always `printf("%s", s)`; enable `-Wformat=2 -Wformat-security`; `fmt`/`std::format` check format strings at compile time.
- **Integer overflow:** size computations (`count * sizeof(T)`, `a + b` before allocation) must be checked (`__builtin_mul_overflow`, C23 `ckd_mul`, or explicit limits); signed overflow is UB; mixing signed/unsigned in comparisons (`-Wsign-compare`, `-Wsign-conversion`). `std::atoi` has no error reporting — use `std::from_chars` or `strtol` with checks.
- **Memory lifetime:** use-after-free, double free, dangling references/views/iterators — prevented by RAII and ownership types, detected by ASan.
- **Unsafe C APIs:** `system`/`popen` with user data (shell injection — use `execve`-family with argument arrays); `rand()` for secrets (use the OS CSPRNG: `getrandom`, `BCryptGenRandom`, or a vetted library); `tmpnam`/`mktemp` (use `mkstemp`); TOCTOU between `access()` and `open()`.
- **Secrets in memory:** wipe with `explicit_bzero` / `memset_s` / `SecureZeroMemory` — plain `memset` before free may be optimised away.
- **Hardening** (release builds, where supported): `-D_FORTIFY_SOURCE=2` or `3` (needs optimisation), `-fstack-protector-strong`, `-fstack-clash-protection`, PIE, full RELRO (`-Wl,-z,relro,-z,now`), `-D_GLIBCXX_ASSERTIONS` or libc++ hardening mode in debug/test builds; MSVC `/GS`, `/guard:cf`, `/sdl`.
- **Dependencies:** pin versions via vcpkg baseline or Conan lockfiles; track advisories for vendored code (zlib, OpenSSL, libpng, etc.); don't copy-paste third-party code without its licence and an update path.

Full UB catalogue and checks: [undefined-behaviour.md](undefined-behaviour.md).

## 7. Performance pitfalls

- **Measure on optimised builds with symbols:** `RelWithDebInfo` (or `-O2 -g -fno-omit-frame-pointer`). Linux: `perf stat ./app`, `perf record -g ./app` then `perf report`; flame graphs from `perf script`. Also `valgrind --tool=callgrind`, `heaptrack`, VTune, Instruments, Visual Studio profiler. Micro-benchmarks with Google Benchmark (`benchmark::DoNotOptimize`).
- **Cache-friendly data:** contiguous containers (`std::vector`, flat maps) over node-based (`std::list`, `std::map`) in hot paths; struct-of-arrays for hot fields; avoid pointer chasing; keep hot data small; avoid false sharing between threads (pad or separate per-thread counters).
- **Allocations:** `reserve()` known sizes; reuse buffers; avoid `std::shared_ptr` churn (atomic refcounts); `std::string_view` to avoid copies; small-buffer-friendly types.
- **Copies:** pass large objects by `const&`; move into sinks; `emplace_back` for in-place construction; return by value (RVO).
- **I/O:** `'\n'` instead of `std::endl` (flushes); buffered writes; `std::ios::sync_with_stdio(false)` in iostream-heavy tools.
- **Dispatch:** virtual calls or `std::function` in tight loops block inlining; templates/CRTP or batching help.
- **Build-level:** LTO (`CMAKE_INTERPROCEDURAL_OPTIMIZATION`), PGO for hot binaries; `-march=native` only for binaries that run on the build machine.

## 8. Build and link errors

Read the **first** error; for template walls find the first `error:` and the `required from here` line in your code. Full playbook: [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `undefined reference to 'foo'` / MSVC LNK2019 unresolved external symbol | source not in the target, library not linked, C/C++ mangling mismatch, template defined in `.cpp`, static library order | add the source / `target_link_libraries`; `extern "C"` in C headers; templates in headers; let CMake order libraries |
| `undefined reference to 'vtable for X'` | first non-inline virtual function (often the destructor) declared but never defined | define it (or `= default` in the `.cpp`) |
| `multiple definition of 'foo'` / LNK2005 | non-inline function or global variable defined in a header | mark `inline` (C++17 inline variables), or declare `extern` in the header and define once |
| `fatal error: foo.h: No such file or directory` | include path missing or dependency not linked as a target | `target_link_libraries` to the imported target (carries include dirs); install the `-dev` package |
| `Could not find a package configuration file provided by "Foo"` | package not installed, or vcpkg/Conan toolchain not passed | install it; pass the toolchain file at first configure; set `CMAKE_PREFIX_PATH` |
| undefined `std::__cxx11::basic_string` symbols | libstdc++ dual ABI mismatch between your code and a prebuilt library | rebuild the library with the same compiler/`_GLIBCXX_USE_CXX11_ABI` setting |
| LNK2038 mismatch detected for 'RuntimeLibrary' / '_ITERATOR_DEBUG_LEVEL' | mixing `/MD` and `/MT`, or Debug and Release libraries | build everything with the same runtime (`CMAKE_MSVC_RUNTIME_LIBRARY`) and configuration |
| `relocation R_X86_64_32 ... recompile with -fPIC` | static code linked into a shared library | `set(CMAKE_POSITION_INDEPENDENT_CODE ON)` or the target property |
| `error while loading shared libraries: libfoo.so` | runtime loader can't find the library | install it, set RPATH (CMake install RPATH settings), or `LD_LIBRARY_PATH` for local runs |
| strange crashes, different behaviour per TU | ODR violation (two definitions differ: macros, flags, struct layout) | one definition per entity; same defines/flags everywhere; GCC `-Wodr` with LTO, ASan ODR detection |
| `use of deleted function` (copy of `unique_ptr`, mutex) | copying a move-only type | `std::move`, pass by reference, or redesign ownership |
| `invalid application of 'sizeof' to incomplete type` with `unique_ptr` pimpl | destructor generated where the type is incomplete | declare the destructor in the header, define it `= default` in the `.cpp` |
| `'xxx' is not a member of 'std'` after a compiler upgrade | relied on a transitive include | include the right header (`<cstdint>`, `<algorithm>`, ...) |

## 9. Review checklist

- [ ] Builds warning-free with the project's warning set on all supported compilers; tests pass under ASan+UBSan (and TSan for concurrent code).
- [ ] No naked `new`/`delete`/`malloc` ownership; RAII everywhere; rule of zero or complete rule of five.
- [ ] No dangling references, views, iterators; no use of moved-from objects.
- [ ] All untrusted sizes, indexes and integer arithmetic checked; no unsafe C string APIs; no user-controlled format strings.
- [ ] `const`, `explicit`, `override`, `noexcept` moves, `[[nodiscard]]` used consistently.
- [ ] CMake changes are target-based; no global flags; new dependencies via the project's package manager.
- [ ] Headers self-contained; no `using namespace` in headers; ABI considerations for public libraries.
- [ ] clang-tidy findings fixed or justified.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **CMake, presets, vcpkg, Conan, FetchContent:** [cmake.md](cmake.md).
- **Qt:** `qt_add_executable`/`qt_standard_project_setup` with `AUTOMOC`; parent-child ownership (`new QWidget(parent)` is fine — the parent deletes it); never touch widgets off the GUI thread (signals/slots with queued connections).
- **Boost / Abseil / fmt / spdlog:** consume through imported targets; check which parts are already standard in your C++ version (`std::optional`, `std::variant`, `std::format`, `std::span`) before adding them.
- **Embedded / freestanding:** often no exceptions, RTTI or heap — check flags (`-fno-exceptions`) and keep to the project's allocator and coding standard (MISRA/AUTOSAR if required).

More library notes: [frameworks.md](frameworks.md).
