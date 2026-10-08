# CMake, presets and package managers

Follow the existing build. If the project uses Meson, Bazel, Make or MSBuild, apply the same principles (per-target settings, no global flags, reproducible dependencies) in that tool.

## A modern target-based project

```cmake
cmake_minimum_required(VERSION 3.25)          # use the project's minimum; presets need 3.19+, newer features newer versions
project(parser VERSION 1.2.0 LANGUAGES CXX)

option(PARSER_BUILD_TESTS "Build tests" ${PROJECT_IS_TOP_LEVEL})

find_package(fmt CONFIG REQUIRED)

add_library(parser
  src/lexer.cpp
  src/parser.cpp)
add_library(parser::parser ALIAS parser)

target_compile_features(parser PUBLIC cxx_std_20)
target_include_directories(parser
  PUBLIC  $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
          $<INSTALL_INTERFACE:include>
  PRIVATE src)
target_link_libraries(parser PUBLIC fmt::fmt)

# Warnings are a private build concern, never forced on consumers
target_compile_options(parser PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wsign-conversion -Wnon-virtual-dtor -Wold-style-cast -Woverloaded-virtual -Wformat=2>
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /permissive->)

add_executable(parse-cli app/main.cpp)
target_link_libraries(parse-cli PRIVATE parser::parser)

if(PARSER_BUILD_TESTS)
  include(CTest)
  add_subdirectory(tests)
endif()
```

`tests/CMakeLists.txt`:

```cmake
find_package(GTest CONFIG REQUIRED)
add_executable(parser_tests lexer_test.cpp parser_test.cpp)
target_link_libraries(parser_tests PRIVATE parser::parser GTest::gtest_main)
include(GoogleTest)
gtest_discover_tests(parser_tests)
```

Rules:
- `PUBLIC` = needed by this target and its consumers (appears in public headers); `PRIVATE` = only this target; `INTERFACE` = only consumers (header-only libraries).
- Link to imported targets (`fmt::fmt`, `OpenSSL::SSL`, `Threads::Threads`), not to raw paths or `-l` flags; they carry include paths and definitions.
- Never `file(GLOB ...)` sources without `CONFIGURE_DEPENDS` (new files are not picked up); listing sources explicitly is preferred.
- Don't set `CMAKE_CXX_FLAGS`, `CMAKE_BUILD_TYPE` or compiler paths inside `CMakeLists.txt`; those belong to presets, toolchain files or the command line.
- `CMAKE_BUILD_TYPE` applies only to single-config generators (Make, Ninja); multi-config generators (Visual Studio, Xcode, Ninja Multi-Config) choose at build time with `cmake --build build --config Release`.
- Generated headers: `configure_file` into the binary dir and add it to the target's include directories.

## Presets

`CMakePresets.json` (committed) describes shared configurations; `CMakeUserPresets.json` (git-ignored) holds personal ones and can inherit shared presets.

```json
{
  "version": 6,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "generator": "Ninja",
      "binaryDir": "${sourceDir}/build/${presetName}",
      "cacheVariables": { "CMAKE_EXPORT_COMPILE_COMMANDS": "ON" }
    },
    { "name": "debug", "inherits": "base", "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" } },
    { "name": "release", "inherits": "base", "cacheVariables": { "CMAKE_BUILD_TYPE": "RelWithDebInfo" } },
    {
      "name": "asan",
      "inherits": "base",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_CXX_FLAGS": "-fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=undefined",
        "CMAKE_EXE_LINKER_FLAGS": "-fsanitize=address,undefined"
      }
    },
    {
      "name": "ci",
      "inherits": "debug",
      "cacheVariables": { "CMAKE_COMPILE_WARNING_AS_ERROR": "ON" }
    }
  ],
  "buildPresets": [
    { "name": "debug", "configurePreset": "debug" },
    { "name": "asan", "configurePreset": "asan" }
  ],
  "testPresets": [
    { "name": "debug", "configurePreset": "debug", "output": { "outputOnFailure": true } },
    { "name": "asan", "configurePreset": "asan", "output": { "outputOnFailure": true } }
  ]
}
```

Use: `cmake --preset debug`, `cmake --build --preset debug`, `ctest --preset debug`. `cmake --list-presets` shows what exists. Check the preset schema `version` your minimum CMake supports.

Putting sanitizer flags in a preset's cache variables is acceptable for a dev/CI-only build; for libraries meant to be consumed, keep them out of `CMakeLists.txt`.

## vcpkg (manifest mode)

- `vcpkg.json` lists dependencies (`"dependencies": ["fmt", { "name": "gtest", "host": false }]`) and a `builtin-baseline` (a vcpkg commit) pinning versions; `overrides` pin specific packages.
- Configure with the vcpkg toolchain on the **first** configure (changing it later requires a fresh build directory):
  `cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"`, or set `toolchainFile` in a preset.
- Triplets choose architecture/linkage (`x64-linux`, `x64-windows`, `x64-windows-static`); the static triplet also changes the MSVC runtime expectations — keep `CMAKE_MSVC_RUNTIME_LIBRARY` consistent.
- Binary caching speeds up CI; never put credentials for caches in the repository.

## Conan 2

- `conanfile.txt` (`[requires]`, `[generators] CMakeDeps CMakeToolchain`, `[layout] cmake_layout`) or `conanfile.py` for more control.
- `conan profile detect` once per machine (then review the generated profile), then `conan install . --build=missing` (with `-s build_type=Debug` for debug builds).
- Configure CMake with the generated `conan_toolchain.cmake` (Conan also generates CMake presets you can use with `cmake --preset`).
- Lockfiles (`conan lock create`) for reproducible CI.

## FetchContent

```cmake
include(FetchContent)
FetchContent_Declare(googletest
  URL https://github.com/google/googletest/archive/<commit-or-tag>.tar.gz
  URL_HASH SHA256=<hash>)
FetchContent_MakeAvailable(googletest)
```

- Pin a tag or commit and, for archives, a hash. Never track a moving branch.
- Good for small dependencies and test frameworks; for large dependency graphs use a package manager.
- `FIND_PACKAGE_ARGS` (CMake 3.24+) lets `FetchContent` prefer an installed package first.

## Installing and exporting a library

- `install(TARGETS parser EXPORT parserTargets ...)`, `install(EXPORT parserTargets NAMESPACE parser:: DESTINATION lib/cmake/parser)`, plus a `parserConfig.cmake` (via `CMakePackageConfigHelpers`) so consumers can `find_package(parser CONFIG)`.
- Use `GNUInstallDirs` variables (`CMAKE_INSTALL_LIBDIR`, `CMAKE_INSTALL_INCLUDEDIR`).
- Shared libraries: control symbol visibility (`CXX_VISIBILITY_PRESET hidden`, `GenerateExportHeader`) and version with `VERSION`/`SOVERSION`.

## Useful commands

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug     # configure
cmake --build build -j                                     # build (parallel)
cmake --build build --target parser_tests                  # one target
ctest --test-dir build --output-on-failure -R Lexer        # filtered tests
cmake --build build --verbose                              # show full compile/link commands
cmake -S . -B build --fresh                                # CMake 3.24+: reconfigure from an empty cache
cmake --install build --prefix ./out                       # install into a local prefix
```

Deleting the build directory (`rm -rf build`) is the blunt way to clear a stale cache — it discards all build outputs in that directory.
