# Swift concurrency — notes

Check the language mode, strict-concurrency level and default isolation of the module first (see SKILL.md, "Detect the project"). The same code produces different diagnostics in Swift 5 mode, Swift 6 mode and with MainActor-by-default isolation.

## Mental model

- **Isolation domains:** the main actor, each actor instance, and "nonisolated". Mutable state belongs to exactly one domain.
- **Sendable** values may cross domains: value types made of Sendable parts, immutable `final class`es with `let` Sendable properties, actors, and types protected by a lock and marked `@unchecked Sendable` (you take responsibility).
- **Suspension points** (`await`) are where other work can run — including on the same actor. State read before an `await` may have changed after it (actor reentrancy).
- **Structured concurrency:** child tasks (`async let`, `withTaskGroup`, `withThrowingTaskGroup`) finish before the scope exits and inherit cancellation. Unstructured `Task {}` does not — someone must hold and cancel it. `Task.detached` also drops the current actor and task-locals; rarely needed.

## Patterns

```swift
// UI-facing model: everything on the main actor
@MainActor
@Observable
final class OrdersModel {
    private(set) var orders: [Order] = []
    private(set) var error: String?
    private let api: OrdersAPI

    init(api: OrdersAPI) { self.api = api }

    func load() async {
        do {
            orders = try await api.fetchOrders()   // api runs wherever it is isolated; result hops back to main
        } catch is CancellationError {
            // view went away — not an error
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Shared mutable state: an actor
actor TokenStore {
    private var token: String?
    private var refreshTask: Task<String, Error>?

    func validToken(refresh: @Sendable @escaping () async throws -> String) async throws -> String {
        if let token { return token }
        if let refreshTask { return try await refreshTask.value }   // coalesce concurrent refreshes
        let task = Task { try await refresh() }
        refreshTask = task
        defer { refreshTask = nil }
        let fresh = try await task.value
        token = fresh
        return fresh
    }
}

// Parallel independent work
async let profile = api.profile()
async let settings = api.settings()
let (p, s) = try await (profile, settings)

// Dynamic fan-out with bounded results
let images = try await withThrowingTaskGroup(of: (Int, Image).self) { group in
    for (index, url) in urls.enumerated() {
        group.addTask { (index, try await loader.load(url)) }
    }
    var result: [Int: Image] = [:]
    for try await (index, image) in group { result[index] = image }
    return result
}
```

In SwiftUI, prefer `.task { await model.load() }` (cancelled automatically when the view disappears) or `.task(id: query)` (restarts when `query` changes) over `onAppear { Task { ... } }`.

## Cancellation

- Cancellation is cooperative: check `try Task.checkCancellation()` or `Task.isCancelled` in long loops; `URLSession` async APIs and `Task.sleep` throw `CancellationError` when cancelled.
- Treat `CancellationError` as normal control flow, not a user-visible error.
- Stored tasks: keep `var loadTask: Task<Void, Never>?`, cancel it before starting a new one and in teardown (`deinit` of a UIKit controller, `onDisappear`).
- `withTaskCancellationHandler` to bridge cancellation to callback APIs.

## Bridging callback APIs

```swift
func currentLocation() async throws -> Location {
    try await withCheckedThrowingContinuation { continuation in
        legacy.requestLocation { result in
            continuation.resume(with: result)   // must resume exactly once on every path
        }
    }
}
```

`withChecked…` traps on double resume and logs a leak on never-resume; keep it over `withUnsafe…` unless profiled.

`AsyncStream` (with `makeStream(of:)` on recent toolchains) to wrap delegate/notification sequences; set `onTermination` to clean up.

## Fixing common Swift 6 diagnostics

| Diagnostic | Usual fix (best first) |
|---|---|
| `Sending 'x' risks causing data races` | Don't use `x` after sending it; make `x` Sendable; create it inside the destination task; mark a parameter `sending` when ownership is transferred |
| `Main actor-isolated ... can not be referenced from a nonisolated context` | Make the caller `@MainActor`; make the function `async` and `await` it; move the value into a Sendable parameter |
| `Static property 'shared' is not concurrency-safe because it is nonisolated global shared mutable state` | Make it `let` of a Sendable type; isolate it (`@MainActor static var`); as last resort `nonisolated(unsafe)` with a comment explaining the external synchronisation |
| `Capture of 'self' with non-sendable type 'X' in a @Sendable closure` | Isolate `X` (`@MainActor` or actor); capture only the Sendable values you need, not `self` |
| `Call to main actor-isolated initializer in a synchronous nonisolated context` | Isolate the caller, or make the initializer `nonisolated` if it touches no main-actor state |
| Protocol conformance crosses isolation (`conformance of 'X' to protocol 'P' crosses into main actor-isolated code`) | Isolate the protocol requirement (`@MainActor protocol`), use an isolated conformance on new toolchains, or make the witnesses `nonisolated` |
| Third-party module not yet annotated | `@preconcurrency import Module` — temporary, with a note |

Rules:
- Never paper over a race with `@unchecked Sendable`, `nonisolated(unsafe)` or `@preconcurrency` without real synchronisation and a comment.
- `DispatchQueue.main.async` inside async code usually means a missing `@MainActor` annotation.
- `MainActor.assumeIsolated {}` is for synchronous callbacks you *know* run on main (it traps otherwise) — not a general escape hatch.
- Don't mix locks and `await` — never hold a lock across a suspension point.

## Migration strategy

1. Update dependencies to versions that ship Sendable annotations.
2. In Swift 5 mode, enable complete strict-concurrency checking (as warnings) per target.
3. Fix leaf modules first (models, networking), then UI.
4. Switch the target to Swift 6 language mode when it builds without warnings.
5. Decide deliberately about default MainActor isolation for app targets (Swift 6.2+): it removes many annotations in UI code but makes background work opt-in (`nonisolated`, `@concurrent` on newer toolchains).

## Combine and GCD in new code

- Prefer async/await and `AsyncSequence` for new work; keep Combine where the project uses it (and store `AnyCancellable`s, `[weak self]` in `sink`).
- GCD is fine for wrapping legacy code; don't create a private serial queue for state that an actor would protect.
