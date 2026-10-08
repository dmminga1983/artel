# Swift frameworks and app review — notes

Check deployment targets before using an API: availability is listed on each symbol's documentation page. Follow the project's architecture.

## SwiftUI state and ownership

| Need | Observation (iOS 17 / macOS 14+) | Before Observation |
|---|---|---|
| View-local value state | `@State var isOn = false` | same |
| View **owns** a reference model | `@State private var model = Model()` | `@StateObject private var model = Model()` |
| View **receives** a model | plain `let model: Model` / `var model: Model` | `@ObservedObject var model: Model` |
| Two-way binding to a parent's value | `@Binding var value: T` | same |
| Bindings into a received model | `@Bindable var model: Model` (or `@Bindable` local in `body`) | `$model.property` via `@ObservedObject` |
| App-wide dependency | `.environment(model)` + `@Environment(Model.self) private var model` | `.environmentObject(model)` + `@EnvironmentObject var model: Model` |
| Model type | `@Observable final class Model` | `final class Model: ObservableObject` with `@Published` |

Common bugs:
- `@ObservedObject var model = Model()` — the object is recreated whenever the parent re-renders. Use `@StateObject` (or `@State` with `@Observable`).
- Initialising `@State`/`@StateObject` from an init parameter only takes the first value; later changes are ignored. Pass the value down instead, or key the view with `.id(...)`.
- Mutating state during `body` evaluation (`Modifying state during view update`) — move it into an action, `.task`, or `.onChange`.
- `@Observable` classes: mark non-UI properties `@ObservationIgnored`; observation is per property read in `body`, so splitting views reduces invalidation.
- Mark models `@MainActor` when they drive UI.

Other SwiftUI notes:
- `.task` / `.task(id:)` for async loading tied to view lifetime; `.refreshable` for pull-to-refresh.
- `NavigationStack` with a typed path (`[Route]` or `NavigationPath`) and `navigationDestination(for:)`; deep links append to the path.
- `List`/`LazyVStack` for long content; stable `Identifiable` ids (not array indices for mutable lists).
- Previews: inject fake dependencies; keep previews compiling (they're a cheap smoke test).
- Accessibility: `accessibilityLabel` for icon-only buttons, Dynamic Type (avoid fixed font sizes), sufficient contrast.

## UIKit / AppKit

- All UI on the main thread; mark view controllers and view models `@MainActor` (UIKit types already are).
- Delegates and data sources `weak`; closures stored on views/controllers capture `[weak self]`.
- Diffable data sources with stable identifiers; avoid `reloadData()` for small changes.
- Cancel tasks and observers in `viewDidDisappear`/`deinit` as appropriate; verify deallocation with a `deinit` log or the memory graph debugger.
- Auto Layout: activate constraints in batches (`NSLayoutConstraint.activate`), avoid ambiguous layouts (watch console warnings).

## SwiftData / Core Data

- A `ModelContext` / `NSManagedObjectContext` belongs to one isolation domain; don't pass model objects across threads — pass identifiers (`PersistentIdentifier`, `NSManagedObjectID`).
- Background work: `@ModelActor` actors (SwiftData) or `newBackgroundContext()` / `performBackgroundTask` (Core Data).
- Fetch with predicates and limits; batch inserts/deletes for large data.
- Schema changes: versioned schemas and a migration plan (SwiftData `VersionedSchema` + `SchemaMigrationPlan`; Core Data model versions with lightweight migration where possible). Test migration from the previous shipped version.

## Networking

- `URLSession` async APIs (`data(for:)`, `bytes(for:)`); check `HTTPURLResponse.statusCode` — non-2xx is not thrown.
- Decode off the main actor for large payloads.
- Timeouts and retry with backoff for idempotent requests only.
- Auth tokens from Keychain, refreshed through a single coalescing actor (see [concurrency.md](concurrency.md)).

## App review and platform rules (iOS)

### Info.plist privacy strings

Required before requesting access; text must say *why* the app needs it. Common keys: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSContactsUsageDescription`, `NSCalendarsUsageDescription` (newer OS versions split calendar full/write-only access keys), `NSBluetoothAlwaysUsageDescription`, `NSFaceIDUsageDescription`, `NSUserTrackingUsageDescription` (App Tracking Transparency), `NSLocalNetworkUsageDescription`. Check Apple's current list for the APIs you call.

### Privacy manifest

- `PrivacyInfo.xcprivacy` declares collected data types, tracking, tracking domains, and **required-reason APIs** (e.g. `UserDefaults`, file timestamp APIs, system boot time, disk space) with an approved reason code.
- Third-party SDKs must include their own manifests (and signatures for SDKs on Apple's list). Xcode can generate a privacy report from an archive.

### Keychain

```swift
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.example.app.auth",
    kSecAttrAccount as String: "refresh-token",
    kSecValueData as String: Data(token.utf8),
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
]
let status = SecItemAdd(query as CFDictionary, nil)
// errSecDuplicateItem → SecItemUpdate instead; check every OSStatus
```

- `ThisDeviceOnly` classes keep items out of backups/device migration.
- Add `kSecAttrAccessControl` with `.biometryCurrentSet`/`.userPresence` for items that should require Face ID/passcode.
- Keychain items survive app deletion — clear them on first launch after reinstall if that matters (flag in `UserDefaults`).
- Sharing between apps/extensions requires a keychain access group entitlement.

### App Transport Security

- HTTPS with modern TLS by default. Exceptions go in `NSAppTransportSecurity` → `NSExceptionDomains` per domain; `NSAllowsArbitraryLoads` disables ATS globally and needs justification in App Review. `NSAllowsLocalNetworking` for local dev servers instead of global exceptions.
- Certificate pinning: `NSPinnedDomains` (declarative, in ATS config) or `URLSessionDelegate` challenge handling; always ship a backup pin and a rotation plan.

### Background execution

- `BGTaskScheduler`: list identifiers in `BGTaskSchedulerPermittedIdentifiers`, enable *Background fetch* / *Background processing* in `UIBackgroundModes`, register handlers before the app finishes launching, set `expirationHandler`, call `setTaskCompleted(success:)`, and schedule the next request. The system decides when (or whether) tasks run — never rely on exact timing.
- Background `URLSession` for large uploads/downloads that must survive suspension.
- `beginBackgroundTask` only for finishing short work when the app is backgrounded; always end it.
- Push notifications: entitlement + `UIBackgroundModes` `remote-notification` for silent pushes; silent pushes are throttled.

### Entitlements and capabilities

- Keep `*.entitlements` in sync with the App ID capabilities (push, iCloud, App Groups, Associated Domains, Keychain Sharing). A mismatch shows up as a signing/provisioning error.
- Associated Domains for universal links need the `apple-app-site-association` file on the server; validate incoming link paths and parameters before acting.

### Distribution hygiene

- No debug menus, test endpoints or verbose logging in release builds (`#if DEBUG`).
- Version (`CFBundleShortVersionString`) and build number (`CFBundleVersion`) bumped per upload.
- Signing secrets (certificates, `.p12`, App Store Connect API keys) never in the repo; CI gets them from encrypted secrets.

## Server-side Swift (Vapor, Hummingbird)

- Use the framework's async APIs; don't block the event loop with synchronous I/O.
- Fluent/SQL: use query builder or bound parameters (`SQLQueryString` interpolation binds values in SQLKit; raw string concatenation does not).
- Config and secrets from environment variables; `.env` files gitignored.
- Run tests with `swift test`; build release images with `swift build -c release` in a multi-stage Docker build.
