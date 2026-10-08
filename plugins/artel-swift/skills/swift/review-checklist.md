# Swift review checklist

Use with the `code-reviewer` agent. Report findings as *file:line — problem — fix*, most severe first.

## Correctness
- [ ] No `!`, `try!`, `as!` on data from network, disk, user or other modules.
- [ ] Errors are thrown or handled; `try?` only where failure is truly irrelevant; `CancellationError` not shown to users.
- [ ] Enums model states instead of several optionals/flags; `switch` exhaustive without `default` where new cases should force updates.
- [ ] `Codable` handles missing/unknown fields as intended; dates and number formats explicit.
- [ ] Locale/time zone aware formatting (`FormatStyle`, `Date.FormatStyle`), no hard-coded formats for display.

## Concurrency
- [ ] UI types and models driving UI are `@MainActor`.
- [ ] Shared mutable state in an actor or behind a lock; no data races masked by `@unchecked Sendable`, `nonisolated(unsafe)` or `@preconcurrency` without justification.
- [ ] Actor reentrancy considered (state re-checked after `await`).
- [ ] Unstructured `Task {}` has an owner that cancels it; SwiftUI uses `.task`.
- [ ] Long loops check cancellation; continuations resume exactly once.
- [ ] No blocking calls on the main actor (sync I/O, semaphores, `Thread.sleep`).

## Memory
- [ ] Delegates `weak`; stored escaping closures capture `[weak self]` where `self` owns the closure's holder.
- [ ] Combine subscriptions stored and released; observers/timers invalidated.
- [ ] `unowned` only with a guaranteed lifetime.
- [ ] Large images downsampled; caches bounded (`NSCache`).

## SwiftUI
- [ ] Ownership wrappers correct (`@State`/`@StateObject` own; `@Binding`/`@Bindable`/`@ObservedObject` borrow).
- [ ] No object creation or side effects in `body`; no state mutation during view update.
- [ ] Stable ids in `ForEach`/`List`; lazy containers for long content.
- [ ] Accessibility labels, Dynamic Type, localisation via String Catalogs.

## Security and privacy
- [ ] No secret API keys, passwords or private endpoints in code, plists, xcconfig or assets.
- [ ] Tokens/credentials in Keychain with an appropriate accessibility class — not `UserDefaults`, files or logs.
- [ ] ATS on; exceptions per domain and justified.
- [ ] Usage-description strings for every protected API used; `PrivacyInfo.xcprivacy` updated for new required-reason APIs, data collection or SDKs.
- [ ] URL scheme / universal link / push / web view inputs validated.
- [ ] `Logger` privacy levels set; no personal data in analytics without consent.
- [ ] Sensitive files use Data Protection.
- [ ] Entitlements match capabilities; no debug-only code in release.

## Dependencies and build
- [ ] Packages pinned to versions (not branches); `Package.resolved` diff expected and committed for apps.
- [ ] New dependencies justified and maintained; their privacy manifests present.
- [ ] Builds without new warnings in the project's language mode; concurrency warnings not suppressed.

## Tests and tooling
- [ ] Tests (Swift Testing or XCTest per project) for new logic and the fixed bug; async code tested without arbitrary sleeps.
- [ ] Network stubbed (`URLProtocol` or protocol fakes); Keychain/storage abstracted in unit tests.
- [ ] SwiftLint / swift-format pass without new disables.
