# C/C++ libraries and frameworks — notes

Prefer the standard library when it covers the need; add a dependency through the project's package manager (see [cmake.md](cmake.md)) and link its imported target.

## Standard library first (by version)

| Need | C++17 | C++20 | C++23 |
|---|---|---|---|
| optional values / sum types | `std::optional`, `std::variant` | | `std::expected` for errors |
| non-owning views | `std::string_view` | `std::span` | `std::mdspan` |
| formatting | — (use fmt) | `std::format` | `std::print` |
| filesystem | `std::filesystem` | | |
| bit manipulation | | `std::bit_cast`, `<bit>` | `std::byteswap` |
| ranges / algorithms | `<algorithm>`, parallel policies | `<ranges>` | more range adaptors |
| concurrency | `std::scoped_lock`, `std::shared_mutex` | `std::jthread`, `std::latch`, `std::barrier`, `std::stop_token` | |

Library support lags the standard flag — check the compiler and standard library versions the project supports before using a newer facility.

## fmt / spdlog

- `fmt::format("{} items", n)` with compile-time checked format strings; `FMT_STRING` or the default compile-time checks in recent versions. Never pass user input as the format string; use `fmt::runtime` only for trusted, dynamic formats.
- spdlog: one logger configured at startup; levels; don't log secrets; flush on shutdown. Async logging needs a bounded queue policy.

## Boost

- Many components are header-only; compiled ones (`filesystem`, `program_options`, `thread`, `log`) need linking: `find_package(Boost CONFIG REQUIRED COMPONENTS program_options)` → `Boost::program_options`.
- Asio (Boost or standalone): object lifetimes in async handlers — capture `shared_from_this()` in handlers so the connection lives until callbacks finish; one `io_context` per thread or strands for serialisation.
- Beast (HTTP/WebSocket): set body limits on parsers; use timeouts on streams.

## Abseil / Folly

- Abseil follows "live at head"; pin a release (LTS) through the package manager. `absl::flat_hash_map` is fast but iteration order is unspecified and changes — don't depend on it.
- `absl::StatusOr<T>` / `absl::Status` for error handling in projects that use them.

## Qt

- CMake: `find_package(Qt6 REQUIRED COMPONENTS Widgets)`, `qt_standard_project_setup()`, `qt_add_executable(app ...)`, link `Qt6::Widgets`. `AUTOMOC`/`AUTOUIC`/`AUTORCC` handle generated code.
- Ownership: `QObject` parent-child trees delete children; `new QPushButton(parent)` is not a leak. Don't also put such objects in `unique_ptr`. Top-level objects without parents need an owner.
- `Q_OBJECT` in classes with signals/slots; missing it causes link errors (`undefined reference to vtable`) or slots not found — rerun CMake so moc picks it up.
- Threads: GUI objects only on the GUI thread; move workers with `moveToThread`; cross-thread signals are queued.
- Connections: prefer the function-pointer `connect` syntax (compile-time checked) over `SIGNAL()/SLOT()` strings.
- Models/views: emit `beginInsertRows`/`endInsertRows` etc. correctly; wrong notifications corrupt views.

## Testing libraries

- **GoogleTest / GoogleMock:** `MOCK_METHOD(ReturnType, Name, (Args), (const, override))`; `EXPECT_CALL(mock, Name(_)).WillOnce(Return(x))`; prefer fakes for simple interfaces.
- **Catch2 v3:** `#include <catch2/catch_test_macros.hpp>`; matchers in `catch2/matchers/...`; `BENCHMARK` macros are available but use Google Benchmark for serious measurement.
- **doctest:** header-only, fast compile; same ideas as Catch2.

## Fuzzing and analysis

- libFuzzer (Clang): `add_executable(fuzz_parser fuzz/parser.cpp)` with `-fsanitize=fuzzer,address` on compile and link; seed corpus directory in the repo; dictionaries for formats with keywords.
- AFL++ for binaries and harder targets; OSS-Fuzz for open-source projects that qualify.
- clang-tidy: start from a narrow `Checks:` list and grow; `WarningsAsErrors` only for checks you have cleaned up. `NOLINT(check-name)` with a reason for exceptions.
- cppcheck, PVS-Studio, Coverity, GCC `-fanalyzer` (C-focused): useful extra signal; triage false positives rather than mass-suppressing.

## Embedded and freestanding

- Exceptions and RTTI often disabled (`-fno-exceptions -fno-rtti`): use error codes or `expected`-style types; avoid standard facilities that throw or allocate.
- No dynamic allocation after initialisation in many systems — static pools, `std::array`, fixed-capacity containers (ETL).
- `volatile` is for memory-mapped I/O, not thread synchronisation.
- Follow the required coding standard (MISRA C/C++, AUTOSAR, CERT) and its deviation process.
