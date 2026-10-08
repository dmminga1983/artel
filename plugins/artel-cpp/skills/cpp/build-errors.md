# C/C++ build and link errors — playbook

Get the real error:
- `cmake --build build --verbose` (or `make VERBOSE=1`, `ninja -v`) shows the exact compiler and linker command lines.
- Read the **first** `error:`. In template errors, find the first line that points into your code (`required from here` in GCC, `in instantiation of` in Clang).
- Distinguish phases: **configure** (CMake messages), **compile** (`file.cpp:12:5: error:`), **link** (`ld:`, `collect2`, `LNK`), **runtime loader** (`error while loading shared libraries`).
- `compile_commands.json` (with `CMAKE_EXPORT_COMPILE_COMMANDS=ON`) shows the flags each file really gets.

## Configure (CMake) errors

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find a package configuration file provided by "Foo"` | package not installed, not on the search path, or package manager toolchain not used | install it (vcpkg/Conan/system `-dev`); pass `CMAKE_TOOLCHAIN_FILE` at **first** configure; or `-DCMAKE_PREFIX_PATH=/path/to/prefix` |
| `No CMAKE_CXX_COMPILER could be found` | no compiler or not on `PATH` (Windows: not in a developer prompt) | install a toolchain; use a VS developer shell or a preset with the right generator |
| `CMake 3.x or higher is required` | CMake too old | upgrade CMake (pip, package manager, official binaries) |
| changing the toolchain/compiler has no effect | cached values in the build dir | `cmake --fresh` (3.24+) or a new build directory (deleting the old one removes its build outputs) |
| `Target "x" links to target "Foo::Foo" but the target was not found` | `find_package` missing or failed quietly, or wrong target name | add `find_package(Foo CONFIG REQUIRED)`; check the package's documented target names |
| `add_subdirectory given source which is not an existing directory` | missing submodule | `git submodule update --init --recursive` |
| policy warnings (`CMP0xxx`) | behaviour changes between CMake versions | raise `cmake_minimum_required` deliberately or set the policy explicitly |

## Compile errors

| Symptom | Cause | Fix |
|---|---|---|
| `fatal error: foo.h: No such file or directory` | include dir not on the target; dependency not linked as a target; system dev package missing | `target_link_libraries(t PRIVATE Foo::Foo)` (brings include dirs); `target_include_directories`; install `libfoo-dev` / `foo-devel` |
| `'xxx' is not a member of 'std'` / `'uint8_t' does not name a type` | missing include that used to come transitively | include `<cstdint>`, `<string>`, `<algorithm>`, `<memory>`, etc. directly |
| `use of deleted function` | copying move-only type (`unique_ptr`, `thread`, `mutex`), or a class with a deleted special member | `std::move`, pass by reference, `emplace`, or add the missing move operations |
| `invalid use of incomplete type` / `sizeof` on incomplete type | forward declaration where the full type is needed; `unique_ptr<Impl>` destructor instantiated in the header | include the header; declare the destructor in the header and `= default` it in the `.cpp` |
| `no matching function for call to` | wrong argument types/constness, missing overload, ADL issue | read the candidate list; fix const/ref qualifiers |
| `passing 'const X' as 'this' discards qualifiers` | calling a non-const member on a const object | make the member `const` if it doesn't mutate |
| `redefinition of` / `multiple definition` at compile time | header included twice without guards | `#pragma once` or include guards |
| `expected ';' before ...` far from the real problem | missing `;` after a class definition in a header, or a macro clash | check the previously included header; `#undef` conflicting macros (`min`/`max` on Windows: define `NOMINMAX`) |
| `'auto' not allowed` / concepts / `<format>` unknown | wrong language standard or old standard library | `target_compile_features(t PUBLIC cxx_std_20)`; check compiler/library support |
| `-Werror` breaks after compiler upgrade | new warnings | fix the code; don't drop `-Werror` from CI |
| Windows `C4996 'fopen': This function or variable may be unsafe` | MSVC CRT deprecation | use the safer API or a portable alternative; define `_CRT_SECURE_NO_WARNINGS` only with team agreement |

## Link errors

| Symptom | Cause | Fix |
|---|---|---|
| `undefined reference to 'foo()'` (GNU ld/lld) / `Undefined symbols for architecture` (Apple ld) / `LNK2019 unresolved external symbol` (MSVC) | definition not compiled into any linked target; library not linked; declaration and definition signatures differ (const, namespace, calling convention) | add the `.cpp` to the target; `target_link_libraries`; compare signatures character by character |
| undefined reference to a C function from C++ (`foo` vs `_Z3foov`) | C++ name mangling | wrap C headers: `#ifdef __cplusplus extern "C" { #endif ... ` |
| undefined reference to a template member | template defined in a `.cpp` | move the definition to the header, or explicitly instantiate the needed types in the `.cpp` |
| `undefined reference to 'vtable for X'` | the first non-inline, non-pure virtual function (the "key function", often the destructor) isn't defined | define it (e.g. `X::~X() = default;` in the `.cpp`); make sure that `.cpp` is in the target |
| `undefined reference to 'typeinfo for X'` | same as above, or mixing `-fno-rtti` code | define the key function; consistent RTTI flags |
| `undefined reference to 'X::count'` (static data member) | declared in class, never defined (pre-C++17) | `inline static` member (C++17) or define in one `.cpp` |
| order-dependent failures with static libraries | GNU ld resolves left to right | let CMake handle order via target dependencies; circular deps: fix the design or use `LINK_GROUP` (CMake 3.24+) |
| `undefined reference to 'pthread_create'` | thread library not linked | `find_package(Threads REQUIRED)` + `Threads::Threads` |
| `undefined reference to 'dlopen'` / `'clock_gettime'` / math functions | `libdl`, `librt`, `libm` not linked (older glibc) | `${CMAKE_DL_LIBS}`, link `m` for C math |
| `multiple definition of 'foo'` / `LNK2005 already defined` | non-inline function or variable defined in a header included by several TUs; same source in two linked libraries | `inline` functions/variables; `extern` declaration + one definition; remove duplicates |
| `LNK1169 one or more multiply defined symbols found` | consequence of LNK2005 | fix the first LNK2005 |
| `relocation R_X86_64_32 against ... can not be used when making a shared object; recompile with -fPIC` | static library objects built without PIC linked into a `.so` | `CMAKE_POSITION_INDEPENDENT_CODE ON` (or `POSITION_INDEPENDENT_CODE` on the target) |
| `file format not recognized` / `incompatible target` / `skipping incompatible libfoo.so` | wrong architecture (32 vs 64-bit, arm64 vs x86_64) | build dependencies for the same architecture/triplet |

## ABI mismatches

| Symptom | Cause | Fix |
|---|---|---|
| undefined `std::__cxx11::basic_string<...>` or `std::__cxx11::list` symbols | prebuilt library compiled with the other libstdc++ ABI setting (`_GLIBCXX_USE_CXX11_ABI`) | rebuild the dependency with your toolchain and the same setting; don't set the macro differently per target |
| `LNK2038 mismatch detected for 'RuntimeLibrary'` | `/MD` vs `/MT` (or `/MDd` vs `/MTd`) | one runtime for all code: `CMAKE_MSVC_RUNTIME_LIBRARY` (policy CMP0091), matching vcpkg triplet |
| `LNK2038 mismatch detected for '_ITERATOR_DEBUG_LEVEL'` | Debug and Release objects mixed | link Debug with Debug libraries; multi-config generators pick per configuration |
| crashes when passing STL types across a DLL/.so boundary | different compilers, standard libraries or flags on each side | build both sides with the same toolchain, or use a C ABI / stable types at the boundary |
| `symbol lookup error` / `version 'GLIBCXX_3.4.xx' not found` at runtime | binary built with a newer libstdc++/glibc than the target system | build on the oldest supported system (or container), ship the runtime, or link statically where licensing allows |
| libc++ vs libstdc++ mismatch (Clang on Linux) | some objects built with `-stdlib=libc++`, others not | choose one standard library for the whole build |

## ODR violations

The One Definition Rule: every inline function, class, template and inline variable must have identical definitions in all translation units. Violations are often silent and produce crashes or "impossible" behaviour.

Typical causes:
- A header's content depends on a macro (`#ifdef DEBUG_FIELDS`) defined differently in different targets.
- Two libraries vendor different versions of the same third-party header.
- Same class name in the global namespace in two `.cpp` files (use anonymous namespaces for file-local types and functions).
- Different compile flags changing layout (`-fpack-struct`, `#pragma pack`, `_ITERATOR_DEBUG_LEVEL`, `-D_GLIBCXX_DEBUG` on only part of the program).

Detection: GCC `-Wodr` with LTO, `-flto -Wodr`; ASan's ODR check for globals (`ASAN_OPTIONS=detect_odr_violation=2`); review defines in `compile_commands.json`.

## Runtime loader errors

| Symptom | Cause | Fix |
|---|---|---|
| `error while loading shared libraries: libfoo.so.1: cannot open shared object file` | library not on the loader path | install it system-wide, set RPATH (`CMAKE_INSTALL_RPATH`, `$ORIGIN`-relative), or `LD_LIBRARY_PATH` for local testing only |
| macOS `Library not loaded: @rpath/libfoo.dylib` | missing `LC_RPATH` | set `INSTALL_RPATH` (`@loader_path/../lib`) |
| Windows: app exits immediately, "DLL not found" (0xc0000135) | dependent DLL not next to the exe or on `PATH` | copy runtime DLLs (`$<TARGET_RUNTIME_DLLS:app>` with a post-build copy, CMake 3.21+) |

## Diagnostics commands

```bash
nm -C libfoo.a | grep 'foo'           # symbols in an archive/object (T = defined, U = undefined)
nm -D --defined-only libfoo.so        # exported dynamic symbols
objdump -p app | grep -E 'NEEDED|RUNPATH|RPATH'   # needed libraries and rpaths (Linux)
ldd ./app                             # resolved shared libraries (don't run ldd on untrusted binaries)
readelf -d app                        # dynamic section
otool -L app                          # macOS dependencies
dumpbin /DEPENDENTS app.exe           # Windows dependencies (VS developer prompt)
c++filt _ZN3foo3barEv                 # demangle a symbol
```
