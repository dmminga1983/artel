---
name: flutter
description: Flutter/Dart stack pack — pubspec and flutter/dart CLI, lints, project structure, state management (Provider/Riverpod/Bloc, follows the project), async and isolates, rebuild performance, navigation, platform channels, unit/widget/integration/golden tests, app security, Gradle/CocoaPods/pub error playbook. Use for Flutter or Dart code, or when the user says "Flutter", "Dart", "флаттер", "дарт".
paths: "**/*.dart, pubspec.yaml, pubspec.lock, analysis_options.yaml, android/**/*.gradle*, ios/Podfile, .fvmrc"
---
Reply in the user's language.

# Flutter and Dart

Long material lives next to this file: [frameworks.md](frameworks.md) (state management, navigation, platform channels, codegen), [build-errors.md](build-errors.md) (Android/iOS build details), [review-checklist.md](review-checklist.md).

## 1. Detect the project

Read before changing anything — **follow the project's existing conventions over these defaults.**

- **SDK versions:** `environment: sdk:` (and `flutter:`) in `pubspec.yaml`; pinned Flutter via FVM (`.fvmrc`, `.fvm/`), `.tool-versions`/`mise.toml`, or CI. Compare with `flutter --version`. If FVM is used, run commands as `fvm flutter ...`.
- **Pure Dart or Flutter?** `dependencies: flutter: sdk: flutter` → Flutter app/plugin; otherwise a Dart package/CLI/server (`dart` commands only). Monorepos: `melos.yaml` or pub workspaces (`workspace:` in the root `pubspec.yaml`).
- **Package type:** app (has `android/`, `ios/`, `web/`… folders, `pubspec.lock` committed), package, or plugin (`flutter: plugin: platforms:`).
- **State management and DI:** look for `provider`, `flutter_riverpod`/`hooks_riverpod` (+ `riverpod_generator`), `flutter_bloc`, `get_it`, `mobx`, `get`. **Use what the project uses** — never introduce a second state-management library.
- **Navigation:** `go_router`, `auto_route`, plain `Navigator`.
- **Codegen:** `build_runner` with `freezed`, `json_serializable`, `riverpod_generator`, `drift`, `injectable` → generated `*.g.dart`/`*.freezed.dart`. Check whether generated files are committed.
- **Lints:** `analysis_options.yaml` — `include: package:flutter_lints/flutter.yaml`, `package:lints/recommended.yaml`, `very_good_analysis`, plus custom rules.
- **Flavors / environments:** `--flavor`, `lib/main_<env>.dart`, `--dart-define(-from-file)` usage in CI scripts.
- **Native side:** `android/app/build.gradle(.kts)` (`minSdk`, `compileSdk`, `namespace`, `applicationId`), `android/settings.gradle(.kts)` (AGP and Kotlin versions), `android/gradle/wrapper/gradle-wrapper.properties`; `ios/Podfile` (`platform :ios`), `ios/Runner/Info.plist`; Swift Package Manager support may be enabled instead of CocoaPods.

## 2. Defaults for new code

- Current stable Flutter channel (check with `flutter --version`; don't assume a number); sound null safety (required since Dart 3).
- Lints: `flutter_lints` (apps) or `lints` (Dart packages) at minimum; `flutter analyze` must be clean.
- Format with `dart format`; apply automated fixes with `dart fix --apply` after upgrades (review the diff).
- Structure by feature: `lib/src/features/<feature>/{data,domain,presentation}` or the project's equivalent; `lib/main.dart` only wires things up.
- Immutable models (`final` fields, `copyWith`; `freeze`d classes if the project uses codegen); `sealed` classes for UI states and results (Dart 3).
- Commit `pubspec.lock` for apps; packages don't need to.
- Add packages with `flutter pub add <name>` (or `dart pub add`) so constraints are written correctly.

## 3. Idioms and design

1. **Widgets are cheap, rebuilds are normal** — keep `build` pure and fast; no I/O, no object creation that must persist, no `Future` creation in `build`.
2. **`const` constructors and `const` widget instances** wherever possible — they are skipped on rebuild.
3. **Extract widgets into classes, not helper methods** returning widgets, so Flutter can diff and skip them.
4. **Lift state only as high as needed**; local ephemeral state in `StatefulWidget`/`ValueNotifier` is fine.
5. **Dispose everything you create**: `AnimationController`, `TextEditingController`, `ScrollController`, `FocusNode`, `StreamSubscription`, `Timer`, `ChangeNotifier`s you own.
6. **`BuildContext` across async gaps** — after `await`, check `if (!context.mounted) return;` (or `mounted` in a `State`) before using it.
7. **Separate UI from logic** — widgets call a controller/notifier/bloc; data access in repositories; keep `http`/DB calls out of widgets.
8. **Dart 3 features** — `sealed` + `switch` expressions with exhaustive patterns for states; records for small multi-value returns; `final` locals.
9. **Explicit types at API boundaries**; avoid `dynamic`; parse JSON into typed models immediately.
10. **Keys** — `ValueKey(item.id)` for items in reorderable/changing lists; `GlobalKey` rarely (forms, preserving state across moves).
11. **Theming** — `ThemeData`/`ColorScheme` and `Theme.of(context)`; no hard-coded colours and text styles scattered through widgets.
12. **Responsive and accessible** — `LayoutBuilder`/`MediaQuery.sizeOf`, text scaling respected, `Semantics` for custom controls, tap targets ≥ 48 logical pixels.
13. **Localisation** — `flutter_localizations` + ARB files (`gen-l10n`), no concatenated user-facing strings.

## 4. Errors and logging

- Throw typed exceptions (`class NetworkException implements Exception`); catch at the repository/controller layer and map to UI states. Don't catch `Error` (programming bugs) except at the top level.
- Async errors: `await` inside `try`; unawaited futures lose errors — the `unawaited_futures` / `discarded_futures` lints catch this.
- Global handlers in `main()`: `FlutterError.onError` (framework errors) and `PlatformDispatcher.instance.onError` (uncaught async errors) → crash reporter.
- `ErrorWidget.builder` for a friendlier release-mode error widget.
- Log with `package:logging` or `dart:developer` `log()`, not `print` (`avoid_print` lint). Never log tokens, passwords or personal data.

## 5. Testing

- **Unit** (`test/`, `package:test` via `flutter_test`): pure Dart logic, repositories with fakes.
- **Widget**: `testWidgets('shows error', (tester) async { await tester.pumpWidget(MaterialApp(home: ...)); ... })`; `find.text`, `find.byKey`, `find.byType`; `tester.tap` then `await tester.pump()`; `pumpAndSettle()` waits for animations (hangs on infinite animations — use `pump(duration)` there).
- **Integration**: `integration_test` package, files in `integration_test/`, run on a device/emulator: `flutter test integration_test/app_test.dart -d <device-id>`.
- **Golden**: `await expectLater(find.byType(Card), matchesGoldenFile('goldens/card.png'));`; update with `flutter test --update-goldens`. Rendering differs by platform and fonts — generate and compare goldens on one platform (usually the CI OS) and load real fonts in tests if text matters.
- Run all: `flutter test`. One file: `flutter test test/cart_test.dart`. By name: `flutter test --plain-name "applies discount"` (exact substring) or `--name` (regex). Pure Dart: `dart test`.
- Coverage: `flutter test --coverage` → `coverage/lcov.info`.
- Mocks: `mocktail` or `mockito` (codegen) — match the project. Riverpod: override providers in `ProviderScope(overrides: [...])`/`ProviderContainer`; Bloc: `bloc_test` (`blocTest`).
- No real network in tests: inject an HTTP client and fake it (`MockClient` from `package:http/testing.dart`).

## 6. Security pitfalls

- **Nothing in the app bundle is secret.** `--dart-define` / `--dart-define-from-file` values, `.env` files bundled as assets, and constants are compiled into the binary and can be extracted. Secret API keys belong on a backend you control; the app gets short-lived, user-scoped tokens.
- **`--obfuscate --split-debug-info=<dir>`** makes reverse engineering harder, not impossible — never a reason to embed secrets. Keep the symbol files private (needed to symbolicate crashes).
- **Token storage** — `flutter_secure_storage` (Keychain/Keystore-backed), not `SharedPreferences`, files or SQLite in plain text. Clear on logout.
- **Transport** — HTTPS only; don't enable Android cleartext traffic (`usesCleartextTraffic`, network security config) or iOS ATS exceptions except for local development builds.
- **Never disable certificate validation**: `badCertificateCallback = (cert, host, port) => true` (or similar) in shipped code is a critical finding.
- **Certificate pinning** — optional; adds outage risk on certificate rotation. If required: a `SecurityContext(withTrustedRoots: false)` with your CA/intermediate via `setTrustedCertificatesBytes`, or a maintained pinning package/native config; always ship backup pins and a way to update. Note `badCertificateCallback` is only called for certificates that already *failed* validation, so it cannot implement pinning.
- **Deep links and platform-channel inputs** — validate parameters; don't navigate to arbitrary routes or open arbitrary URLs from link data. `url_launcher`: allowlist schemes.
- **WebViews** — restrict JavaScript channels to trusted origins; don't load untrusted URLs with a bridge enabled.
- **Android** — `android:exported` explicit on components; `android:allowBackup` considered for sensitive data; release keystore and `key.properties` gitignored, never committed.
- **Dependencies** — prefer verified publishers and maintained packages on pub.dev; review `pubspec.lock` diffs; `dart pub outdated` regularly; check GitHub Advisory Database / OSV for known vulnerabilities (pub has no built-in audit command).

## 7. Performance pitfalls

- Rebuilding large subtrees: `setState` high in the tree, a `Provider`/`watch` of a whole object when one field is needed (use `context.select`, Riverpod `select`, `BlocSelector`/`buildWhen`).
- Non-`const` static widgets; helper methods instead of widget classes.
- Long lists built eagerly (`Column` + `children: items.map(...)` or `ListView(children:)`) — use `ListView.builder`/`SliverList` with `itemExtent` or `prototypeItem` when sizes are fixed.
- Expensive effects: `Opacity`/`ClipRRect`/`BackdropFilter`/shadows animating every frame (use `FadeTransition`, `AnimatedOpacity`, pre-rendered assets); `saveLayer` cost.
- Large images decoded at full size: `cacheWidth`/`cacheHeight` or `ResizeImage`; `precacheImage` for hero images.
- Heavy CPU work (JSON parsing of big payloads, image processing, crypto) on the UI isolate → `Isolate.run(() => ...)` or `compute()`.
- `FutureBuilder`/`StreamBuilder` with a future/stream created in `build` → re-fires every rebuild; create it in `initState` or in state management.
- Profile in **profile mode** on a real device (`flutter run --profile`) with DevTools (performance overlay, rebuild stats, CPU profiler); debug mode performance is meaningless.

## 8. Build and run errors

Detailed Android/iOS steps: [build-errors.md](build-errors.md). Start with `flutter doctor -v`.

| Symptom | Likely cause | Fix |
|---|---|---|
| `version solving failed` / `Because X depends on Y ^2.0.0 and Z depends on Y ^1.0.0 ...` | Incompatible constraints or SDK constraint too low/high | Read the chain; `flutter pub outdated`; upgrade the blocking package (`flutter pub upgrade --major-versions` with review); `dependency_overrides` only as a temporary, commented stopgap |
| `The current Dart SDK version is X. Because app requires SDK version >=Y ...` | Flutter/Dart too old for the project or a package | Use the project's Flutter version (FVM/CI); don't lower the SDK constraint to make it resolve |
| `Cannot run with sound null safety, because the following dependencies don't support null safety` / packages with `sdk: <2.12` | Pre-null-safety packages; Dart 3 requires null safety | Upgrade or replace those packages; there's no unsound mode in Dart 3 (the `dart migrate` tool only existed up to Dart 2.19) |
| `Undefined name` / `isn't defined` for `*.g.dart` or `*.freezed.dart` members | Generated code missing or stale | `dart run build_runner build --delete-conflicting-outputs` |
| Android: `Minimum supported Gradle version is X` / `Unsupported class file major version` | Gradle wrapper, AGP and JDK versions incompatible | Align versions per the AGP/Gradle compatibility table: `distributionUrl` in `gradle-wrapper.properties`, AGP in `settings.gradle(.kts)`, JDK via `flutter config --jdk-dir` |
| Android: `Namespace not specified` | AGP 8+ requires `namespace` in the module build file | Add `namespace` in `android/app/build.gradle(.kts)`; for a plugin, upgrade it |
| Android: `uses-sdk:minSdkVersion X cannot be smaller than version Y declared in library` | A plugin needs a higher `minSdk` | Raise `minSdk` in `android/app/build.gradle(.kts)` (product decision: drops old devices) |
| Android: `Your project requires a newer version of the Kotlin Gradle plugin` | Old Kotlin plugin version | Raise the Kotlin plugin version in `settings.gradle(.kts)` (or `build.gradle` for older layouts) |
| Android: `You are applying Flutter's main Gradle plugin imperatively` | Old `apply from` / `apply plugin` layout | Migrate to the declarative `plugins {}` block per the Flutter migration guide |
| iOS: `CocoaPods could not find compatible versions for pod "X"` | Pod spec repo stale or iOS deployment target too low | Raise `platform :ios` in `ios/Podfile` (and Xcode target); `cd ios && pod install --repo-update` |
| iOS: `Module 'x' not found` in Xcode | Opened `Runner.xcodeproj` instead of `Runner.xcworkspace`, or pods not installed | `cd ios && pod install` (also run by `flutter run`/`flutter build ios`), then open the workspace |
| iOS: signing errors (`No profiles for ...`, `requires a development team`) | Team/bundle ID not set | Set the team in Xcode › Runner › Signing & Capabilities |
| `Error: Dart library 'dart:html' is not available on this platform` | Web-only import in mobile/desktop code | Conditional imports or `package:web` behind a platform check |
| `Waiting for another flutter command to release the startup lock...` | Another `flutter` process running or crashed | Wait/kill the other process; remove the stale lock file in the Flutter SDK's `bin/cache` only if no flutter process runs |
| `setState() called after dispose()` / `Looking up a deactivated widget's ancestor is unsafe` | Async work finishing after the widget left the tree | Check `mounted`/`context.mounted` after `await`; cancel subscriptions in `dispose` |
| `RenderFlex overflowed by N pixels` / `Vertical viewport was given unbounded height` | Unconstrained children (list inside column, long text in row) | `Expanded`/`Flexible`, `shrinkWrap` sparingly, scrollable parent, constrained sizes |

## 9. Review checklist

- `flutter analyze` clean, `dart format` applied, tests pass.
- No secrets in Dart code, assets, `--dart-define` files; tokens in secure storage; TLS validation untouched.
- Controllers/subscriptions disposed; `context.mounted` after `await`; no futures created in `build`.
- `const` where possible; lists lazy; selective rebuilds; heavy work off the UI isolate.
- State management consistent with the project; no new competing library.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **State management** — `setState`/`ValueNotifier`, Provider (`ChangeNotifier`, `context.watch/read/select`), Riverpod (`ref.watch` in build, `ref.read` in callbacks, `autoDispose`, overrides in tests), Bloc/Cubit (`BlocBuilder`, `BlocListener`, `buildWhen`, `bloc_test`).
- **Navigation** — `go_router` (declarative routes, redirects for auth, deep links), `Navigator` for simple apps.
- **Platform channels** — `MethodChannel`/`EventChannel`, Pigeon for type-safe APIs, FFI for C libraries.
- **Codegen** — `freezed`, `json_serializable`, `build_runner`.

Notes: [frameworks.md](frameworks.md).
