# Flutter review checklist

Use with the `code-reviewer` agent. Report findings as *file:line — problem — fix*, most severe first.

## Correctness
- [ ] Null safety respected: no `!` on data from network, storage, platform channels or route parameters.
- [ ] `context.mounted` / `mounted` checked after every `await` before using `context` or `setState`.
- [ ] All futures awaited or explicitly `unawaited(...)` with a reason; errors handled.
- [ ] Sealed state classes + exhaustive `switch` for loading/data/error; error and empty states rendered.
- [ ] JSON parsed into typed models; unknown/missing fields handled; dates and time zones explicit.
- [ ] Locale-aware formatting (`intl`); user-facing strings localised.

## Lifecycle and memory
- [ ] Controllers, focus nodes, animation controllers, subscriptions, timers disposed.
- [ ] No futures/streams created in `build` for `FutureBuilder`/`StreamBuilder`.
- [ ] Providers/blocs owned at the right scope; `create:` vs `.value` used correctly; no `emit` after close.

## Performance
- [ ] `const` constructors and instances where possible; widget classes instead of widget-returning methods.
- [ ] Lazy lists (`ListView.builder`, slivers); fixed `itemExtent`/`prototypeItem` where sizes are known.
- [ ] Rebuilds narrowed (`select`, `buildWhen`, splitting widgets); `setState` not at the root for local changes.
- [ ] Images sized (`cacheWidth`/`cacheHeight`); no animated `Opacity`/clip/blur where transitions suffice.
- [ ] CPU-heavy work in `Isolate.run`/`compute`.
- [ ] Stable `Key`s for dynamic lists.

## Architecture
- [ ] Same state-management approach as the rest of the app; no new competing library.
- [ ] UI → controller/notifier/bloc → repository → data source layering respected; no HTTP/DB calls in widgets.
- [ ] Dependencies injected (constructor, providers, get_it per project), not global singletons created ad hoc.
- [ ] Navigation through the project's router; route parameters validated; unknown routes handled.

## Security and privacy
- [ ] No secret keys in Dart code, assets, `.env` assets or `--dart-define` files; backend holds real secrets.
- [ ] Tokens in `flutter_secure_storage` (or platform secure storage), cleared on logout.
- [ ] HTTPS only; no cleartext/ATS exceptions in release; certificate validation never disabled.
- [ ] Deep links, push payloads, platform-channel results and WebView messages validated; `url_launcher` schemes allowlisted.
- [ ] Logs free of tokens and personal data; no `print`.
- [ ] Android components `exported` explicitly; release keystore and `key.properties` not committed.
- [ ] Permission usage strings (iOS) and manifest permissions (Android) minimal and explained.

## Dependencies and build
- [ ] New packages maintained, verified publisher where possible, licence acceptable; `pubspec.lock` diff expected.
- [ ] No lingering `dependency_overrides` without a comment and a removal plan.
- [ ] Native config changes (`minSdk`, deployment target, Gradle/AGP/Kotlin versions) intentional and consistent.
- [ ] Generated code up to date (`build_runner`) and committed or generated per project policy.

## Tests and tooling
- [ ] Unit tests for logic; widget tests for new screens/states; golden tests updated intentionally (diff reviewed).
- [ ] No real network in tests; providers/blocs overridden with fakes.
- [ ] `flutter analyze` clean without new `// ignore:`; `dart format` applied; `flutter test` passes.
