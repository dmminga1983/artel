---
name: swift
description: Swift stack pack — SwiftPM vs Xcode projects, Swift 6 concurrency (async/await, actors, Sendable, MainActor), SwiftUI state, retain cycles, errors, XCTest and Swift Testing, SwiftLint/swift-format, iOS app review (privacy strings, Keychain, ATS, background tasks), build/signing error playbook. Use for Swift/iOS/macOS code or when the user says "Swift", "SwiftUI", "айос", "свифт".
paths: "**/*.swift, Package.swift, Package.resolved, **/*.xcodeproj/**, **/*.xcworkspace/**, **/Info.plist, **/*.entitlements, **/*.xcprivacy, .swiftlint.yml, .swift-format"
---
Reply in the user's language.

# Swift

Long material lives next to this file: [frameworks.md](frameworks.md) (SwiftUI, UIKit, SwiftData/Core Data, app review), [concurrency.md](concurrency.md), [review-checklist.md](review-checklist.md).

## 1. Detect the project

Read before changing anything — **follow the project's existing conventions over these defaults.**

- **Package or app?** `Package.swift` → SwiftPM (`swift build`, `swift test`). `*.xcodeproj` / `*.xcworkspace` → Xcode project (`xcodebuild`); a workspace usually means CocoaPods or several projects — always open/build the workspace then. Tuist (`Project.swift`) or XcodeGen (`project.yml`) generate the project — edit those files, not the `.xcodeproj`.
- **Toolchain:** `swift --version`, `xcodebuild -version`, `.xcode-version` / `.swift-version`, CI image. First line of `Package.swift` (`// swift-tools-version:`) sets the manifest API level.
- **Language mode:** Swift 5 vs 6 mode — `swiftLanguageModes` in `Package.swift` (older manifests: `swiftLanguageVersions`), or the *Swift Language Version* build setting. Also check strict-concurrency settings, upcoming features, and whether the module uses **default MainActor isolation** (Swift 6.2+ option; new Xcode app templates may turn it on). These change which concurrency diagnostics you'll see.
- **Platforms and deployment targets:** `platforms:` in `Package.swift` or `IPHONEOS_DEPLOYMENT_TARGET`; they decide whether you can use `@Observable` (iOS 17/macOS 14), Swift Testing, newer SwiftUI APIs.
- **Dependencies:** SwiftPM (`Package.resolved`), CocoaPods (`Podfile`, `Podfile.lock`), Carthage (`Cartfile`).
- **Tooling:** `.swiftlint.yml` (SwiftLint), `.swift-format` (Apple swift-format), `.swiftformat` (Nick Lockwood's SwiftFormat — a different tool), Fastlane (`fastlane/`), `xcconfig` files, test plans (`*.xctestplan`).
- **UI stack:** SwiftUI, UIKit, AppKit or mixed; architecture (MVVM, TCA, coordinators) — match it.

## 2. Defaults for new code

- Swift 6 language mode for new packages/targets when the toolchain supports it; for existing code, follow the project's mode and migrate module by module.
- SwiftUI for new screens if the app already uses it; Observation (`@Observable`) when the deployment target allows, otherwise `ObservableObject`.
- Swift Testing for new tests when the toolchain has it (Swift 6 / Xcode 16 and later); keep XCTest where the project uses it (UI tests and performance tests still need XCTest).
- SwiftPM for dependencies; pin versions with `from:` / `.upToNextMinor` — not branches.
- Lint/format: whatever exists; otherwise SwiftLint + `swift format` (bundled with recent toolchains).
- Deployment target: as low as the product requires, but don't add `#available` forks for versions you don't ship.

## 3. Idioms and design

1. **Value types first** — `struct`/`enum` for models; `class` when identity or shared mutable state is the point; `final class` by default.
2. **Make illegal states unrepresentable** — enums with associated values instead of several optionals and flags.
3. **Optionals are handled, not forced** — `guard let`, `if let x`, `??`; `!` only for programmer errors with an obvious invariant (and prefer `preconditionFailure` with a message).
4. **Protocols at boundaries** (networking, storage, clock) for testability; avoid protocol-for-everything and `any` existentials in hot paths — use generics/`some`.
5. **Access control** — `private`/`fileprivate` by default, `internal` for the module, `public`/`package` only for API.
6. **Structured concurrency** — `async let` and task groups over unstructured `Task {}`; every `Task {}` needs an owner that can cancel it. See [concurrency.md](concurrency.md).
7. **Isolation is part of the type** — UI types are `@MainActor`; shared mutable state lives in an `actor` or behind a lock (`Mutex` in the Synchronization module on recent platforms); types crossing isolation boundaries are `Sendable`.
8. **No blocking the main thread** — no synchronous network, disk or `DispatchSemaphore.wait` on main.
9. **Memory** — `weak` delegates; `[weak self]` in escaping closures stored by `self` (or by something `self` owns): Combine `sink`, `NotificationCenter` block observers, timers, completion handlers kept in properties. `unowned` only when the lifetime is guaranteed — a wrong `unowned` crashes. Long-running `Task { }` loops holding `self` keep it alive until cancelled.
10. **Codable** with explicit `CodingKeys` / strategies; decode into DTOs, map to domain models.
11. **Dependency injection** through initialisers (or SwiftUI `Environment`), not singletons reached from everywhere.
12. **Localisation** — user-facing strings via String Catalogs (`.xcstrings`) / `String(localized:)`, never concatenated sentences.

## 4. Errors and logging

- `throws` for recoverable errors; specific `enum` error types conforming to `Error` (and `LocalizedError` for user messages). Typed throws (`throws(ParseError)`) are available in Swift 6 — use for closed, internal error sets; keep untyped `throws` for public APIs that may grow.
- `try?` discards the error — only when failure is truly irrelevant; log otherwise.
- `Result` for stored outcomes or callback APIs; `async throws` for new code.
- `fatalError`/`precondition` for broken invariants only, never for bad input or network failures.
- Log with `os.Logger` (`Logger(subsystem: Bundle.main.bundleIdentifier ?? "app", category: "network")`); interpolated strings and objects are redacted by default when no debugger is attached, but numbers and booleans are not — mark personal data `privacy: .private` explicitly and use `.public` only for non-sensitive values. No `print` in shipped code.

## 5. Testing

- **Swift Testing**: `import Testing`, `@Test func refundIsIdempotent() async throws { #expect(...) }`, `try #require(optional)` to unwrap or stop, `@Suite` for grouping, `@Test(arguments: [...])` for parameterised cases, traits like `.tags`, `.disabled("reason")`, `.timeLimit`.
- **XCTest**: `final class OrderTests: XCTestCase`, `func testX() async throws`, `XCTAssertEqual`, `XCTUnwrap`, `setUp`/`tearDown`; `XCUIApplication` for UI tests; `measure {}` for performance.
- Run all (package): `swift test`. One: `swift test --filter OrderTests` (regex over test names; also matches `OrderTests/refund`).
- Run (Xcode project): `xcodebuild test -scheme App -destination 'platform=iOS Simulator,name=<device>'` — pick an installed simulator from `xcrun simctl list devices available`; one test: `-only-testing:AppTests/OrderTests/testRefund`.
- Coverage: `swift test --enable-code-coverage`; Xcode: enable in the scheme/test plan, or `-enableCodeCoverage YES`.
- Doubles: protocol-based fakes injected via init; `URLProtocol` subclass to stub `URLSession`; avoid real network and real Keychain in unit tests.
- Async: await the function directly; don't use `sleep`/expectations with arbitrary timeouts when you can inject a clock or await completion. `confirmation()` (Swift Testing) / `XCTestExpectation` + `await fulfillment(of:)` for callbacks.
- SwiftUI: test view models and reducers; snapshot tests (if the project uses a library) for views; UI tests sparingly.

## 6. Security pitfalls

- **Secrets in the app bundle are public.** API keys in code, `Info.plist`, `xcconfig` or assets can be extracted from the IPA. Keep secret keys on a backend; ship only publishable/client keys, restricted server-side.
- **Keychain, not `UserDefaults`**, for tokens and credentials — `SecItemAdd`/`SecItemCopyMatching` with `kSecClassGenericPassword` and an accessibility class such as `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (or `AfterFirstUnlockThisDeviceOnly` for background access). Wrap in a small tested type.
- **ATS** — keep App Transport Security on; `NSAllowsArbitraryLoads` needs a written justification (App Review asks). Prefer per-domain `NSExceptionDomains`.
- **Privacy** — every protected resource needs an `Info.plist` usage string (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription`, `NSContactsUsageDescription`, …) or the app crashes when it asks. Maintain `PrivacyInfo.xcprivacy` (required-reason APIs such as `UserDefaults`, file timestamps, disk space; tracking domains); third-party SDKs need their own manifests.
- **Input from outside** — URL schemes, universal links, push payloads, pasteboard, `WKWebView` messages: validate before acting; never execute JS bridges for untrusted pages.
- **Logs and analytics** — no tokens or personal data; `Logger` privacy levels.
- **Files** — sensitive files with Data Protection (`.completeFileProtection`); exclude caches from backups where appropriate.
- **TLS pinning** is optional and operationally risky (rotation); if used, pin public keys with backups via `URLSessionDelegate` or `NSPinnedDomains` in `Info.plist`.
- **Dependencies** — review `Package.resolved` diffs; prefer tagged versions; there's no built-in `audit` command — check advisories for each dependency (GitHub Advisory Database / Dependabot for SwiftPM).

## 7. Performance pitfalls

- Main-thread work: decoding large JSON, image resizing, Core Data/SwiftData fetches of big sets — move off main (actor, background context, `Task.detached` with care).
- SwiftUI: views recomputing because of over-broad observation (one huge `ObservableObject`); `@Observable` tracks per-property reads — prefer it. Stable `id`s in `ForEach`; avoid `AnyView`; `LazyVStack`/`List` for long content; don't create objects in `body`.
- Images: downsample to display size (ImageIO thumbnailing) instead of loading full-resolution `UIImage`s.
- Existentials and dynamic dispatch in tight loops; copy-on-write surprises (mutating a copy of a large array held elsewhere).
- Actor hops in loops — batch work inside one actor call.
- Measure with Instruments (Time Profiler, Allocations, Leaks, SwiftUI instrument, Hangs); use `os_signpost`/`OSSignposter` around suspected code.

## 8. Build and run errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `No such module 'X'` | Package not resolved, product not added to the target, building the `.xcodeproj` instead of the `.xcworkspace`, scheme/platform mismatch | Add the product to the target's frameworks; open the workspace; *File › Packages › Resolve/Reset Package Caches*; `swift package resolve`; clean build folder |
| `Signing for "App" requires a development team` | No team selected | Set the team in *Signing & Capabilities* or `DEVELOPMENT_TEAM` in xcconfig (not in a public repo if you consider it private) |
| `No profiles for 'com.example.app' were found` / provisioning profile doesn't include capability | Bundle ID/capabilities don't match a profile | Automatic signing, or regenerate the profile with the capability; CLI: `xcodebuild -allowProvisioningUpdates`; CI: install cert + profile (e.g. Fastlane match) |
| `Provisioning profile ... doesn't include signing certificate` | Certificate missing from keychain or expired | Install the matching certificate (with private key) or create a new one |
| `Sending 'x' risks causing data races` | Non-Sendable value crosses an isolation boundary (Swift 6) | Make the type `Sendable` (value type / immutable / actor), keep it in one isolation domain, or transfer ownership (`sending`); see [concurrency.md](concurrency.md) |
| `Main actor-isolated property 'x' can not be referenced from a nonisolated context` | Calling UI/main-actor state from background or nonisolated code | Mark the caller `@MainActor`, or `await MainActor.run {}` / make the call `async` and `await` it |
| `Type 'X' does not conform to the 'Sendable' protocol` / `Capture of 'self' with non-sendable type` | Class with mutable state used from `@Sendable` closures/tasks | Turn it into an actor or `@MainActor` class, or make state immutable; `@unchecked Sendable` only with a lock and a comment |
| Hundreds of concurrency warnings after enabling Swift 6 | Strict checking switched on module-wide | Migrate module by module: enable complete checking as warnings in Swift 5 mode first, fix, then switch mode |
| `The compiler is unable to type-check this expression in reasonable time` | Long chained literal/operator expression | Split into typed sub-expressions; add explicit types |
| `Undefined symbol: ...` (linker) | Framework/library not linked, wrong architecture, missing `-ObjC`, Swift package product used from wrong target | Link the framework, check *Frameworks, Libraries* phase, check platform/arch of binary deps |
| `dyld: Library not loaded: @rpath/X.framework` at launch | Dynamic framework not embedded | Set it to *Embed & Sign* |
| `Command PhaseScriptExecution failed with a nonzero exit code` | A Run Script phase failed (SwiftLint, CocoaPods, codegen), often user script sandboxing | Open the build log for the script's real error; declare input/output files or adjust `ENABLE_USER_SCRIPT_SANDBOXING` for that script |
| `Multiple commands produce ...` | Two targets/phases copy the same file | Remove the duplicate from *Copy Bundle Resources* / dedupe outputs |
| `could not resolve package dependencies` / version conflict | Incompatible `from:` ranges, stale `Package.resolved` | Read the conflict; adjust one requirement; `swift package update <pkg>`; commit `Package.resolved` for apps |
| App crashes: `This app has crashed because it attempted to access privacy-sensitive data without a usage description` | Missing `NS...UsageDescription` | Add the key with a clear, specific reason |
| Stale weird errors after branch switch | DerivedData/module cache out of sync | Clean build folder; delete the project's DerivedData folder (labelled: forces a full rebuild) |

## 9. Review checklist

- No force unwraps/`try!` on external data; errors surfaced or logged.
- Isolation correct: UI on `@MainActor`, shared state in actors, no `@unchecked Sendable` without a lock and a reason.
- No retain cycles in stored closures, observers, timers, long-lived tasks; tasks cancelled on teardown.
- SwiftUI ownership right (`@State` owns, `@Binding`/`@Bindable` borrow, no `@ObservedObject` creating its own object).
- Secrets not in the bundle; tokens in Keychain; ATS exceptions justified; usage strings and privacy manifest updated.
- Tests added and passing; SwiftLint/swift-format clean.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **SwiftUI** — `@State`/`@Binding`/`@Observable`/`@Bindable`/`@Environment` vs `ObservableObject`/`@StateObject`/`@ObservedObject`/`@EnvironmentObject`; `.task` for async work tied to a view's lifetime; navigation with `NavigationStack`.
- **UIKit/AppKit** — main-thread rules, `weak` delegates, diffable data sources.
- **SwiftData / Core Data** — contexts are not shared across threads; `ModelActor` / background contexts.
- **App review** — usage strings, privacy manifest, Keychain, ATS, `BGTaskScheduler`, entitlements.

Notes: [frameworks.md](frameworks.md).
