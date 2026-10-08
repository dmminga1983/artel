# Flutter frameworks — notes

**Follow the state-management and navigation approach the project already uses.** The notes below help you work inside each one correctly; they are not a recommendation to switch. Check package versions in `pubspec.lock` — APIs changed across major versions (notably Riverpod 1 → 2 → 3 and Bloc 7 → 8).

## Built-in state

- `setState` for state local to one widget; `ValueNotifier` + `ValueListenableBuilder` for a single value shared with a few children; `InheritedWidget`/`InheritedNotifier` underpin Provider-style solutions.
- `ChangeNotifier`: call `notifyListeners()` after changes; dispose it if you created it.

## Provider

```dart
ChangeNotifierProvider(create: (_) => CartModel(repo), child: const App());

// In build — rebuilds when CartModel notifies
final cart = context.watch<CartModel>();
// Rebuild only when one field changes
final count = context.select<CartModel, int>((c) => c.items.length);
// In callbacks — no subscription
onPressed: () => context.read<CartModel>().add(item),
```

- `create:` owns and disposes the object; `.value(value: existing)` only for objects owned elsewhere (e.g. list items) — never `.value` with a freshly constructed object.
- `watch` only in `build`; `read` in callbacks, `initState` (via `context.read` in a post-frame callback or later), never `watch` there.
- `ProxyProvider` / `ChangeNotifierProxyProvider` for dependencies between providers.

## Riverpod

```dart
// Generated (riverpod_generator) style
@riverpod
Future<List<Order>> orders(Ref ref) async {
  final api = ref.watch(apiProvider);
  return api.fetchOrders();
}

class OrdersPage extends ConsumerWidget {
  const OrdersPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);
    return switch (orders) {
      AsyncData(:final value) => OrdersList(value),
      AsyncError(:final error) => ErrorView(error),
      _ => const CircularProgressIndicator(),
    };
  }
}
```

- `ref.watch` in `build` and inside providers; `ref.read` in event handlers; `ref.listen` for side effects (snackbars, navigation).
- `select` to narrow rebuilds: `ref.watch(userProvider.select((u) => u.name))`.
- Mutable state: `Notifier`/`AsyncNotifier` classes (current APIs) — older code uses `StateNotifier`/`ChangeNotifierProvider`; keep consistent with the codebase.
- Auto-dispose: generated providers auto-dispose by default; `keepAlive` to retain. Check `ref.mounted` (where available) or cancellation via `ref.onDispose` for async work.
- Codegen projects: run `dart run build_runner watch -d` during development.
- Tests: `ProviderContainer(overrides: [apiProvider.overrideWithValue(FakeApi())])` (dispose it after the test, or use the test helper the project uses); widget tests wrap with `ProviderScope(overrides: [...])`.
- One root `ProviderScope` in `main()`.

## Bloc / Cubit

```dart
class CartCubit extends Cubit<CartState> {
  CartCubit(this._repo) : super(const CartState.initial());
  final CartRepository _repo;

  Future<void> load() async {
    emit(const CartState.loading());
    try {
      emit(CartState.loaded(await _repo.items()));
    } on CartException catch (e) {
      emit(CartState.failure(e.message));
    }
  }
}

BlocProvider(create: (context) => CartCubit(context.read<CartRepository>())..load(), child: const CartView());
BlocBuilder<CartCubit, CartState>(buildWhen: (prev, next) => prev.items != next.items, builder: ...);
BlocListener<CartCubit, CartState>(listener: (context, state) { /* navigation, snackbars */ });
```

- States immutable with value equality (`equatable` or `freezed`) — otherwise `buildWhen` and de-duplication don't work.
- Bloc (events) when you need event transformations (debounce, `droppable`/`restartable` from `bloc_concurrency`); Cubit for simple method-driven state.
- Don't `emit` after `close()`: guard long async work with `if (isClosed) return;`.
- Side effects in `BlocListener`, never in `builder`.
- Tests: `blocTest<CartCubit, CartState>('emits loaded', build: () => CartCubit(fakeRepo), act: (c) => c.load(), expect: () => [...])`.

## get_it, GetX, MobX

- `get_it` is a service locator — register in one place at startup, inject into constructors from there, reset in tests (`GetIt.I.reset()`).
- GetX and MobX: follow the existing patterns; MobX needs `build_runner` for stores.

## Navigation

### go_router

```dart
final router = GoRouter(
  initialLocation: '/',
  refreshListenable: authNotifier,          // re-run redirect when auth changes
  redirect: (context, state) {
    final loggedIn = authNotifier.isLoggedIn;
    final goingToLogin = state.matchedLocation == '/login';
    if (!loggedIn && !goingToLogin) return '/login';
    if (loggedIn && goingToLogin) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (context, state) => const HomePage(), routes: [
      GoRoute(path: 'orders/:id', builder: (context, state) => OrderPage(id: state.pathParameters['id']!)),
    ]),
    GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
  ],
);
```

- `context.go` replaces the stack (URL-driven); `context.push` adds to it. Mixing them carelessly breaks back navigation on web.
- `ShellRoute`/`StatefulShellRoute` for bottom navigation with preserved tab state.
- Path/query parameters are untrusted input from deep links — validate and handle "not found".
- Typed routes via `go_router_builder` if the project uses codegen.

### Navigator

- `Navigator.push(context, MaterialPageRoute(builder: (_) => const Page()))`; return values via `Navigator.pop(context, result)` and `await` on push.
- Check `context.mounted` after awaiting a pushed route.
- Android back / predictive back: `PopScope` (replaces the deprecated `WillPopScope`).

### Deep links

- Android: intent filters in `AndroidManifest.xml`, App Links verified via `assetlinks.json`. iOS: Associated Domains entitlement + `apple-app-site-association`. Test with `adb shell am start -a android.intent.action.VIEW -d "<url>"` and `xcrun simctl openurl booted "<url>"`.

## Platform channels and native code

```dart
const _channel = MethodChannel('app.example/battery');

Future<int?> batteryLevel() async {
  try {
    return await _channel.invokeMethod<int>('getBatteryLevel');
  } on PlatformException catch (e) {
    log('battery failed', error: e);
    return null;
  } on MissingPluginException {
    return null; // not implemented on this platform
  }
}
```

- Channel names unique (reverse-domain style); method names and argument types documented on both sides.
- Platform side: reply exactly once (`result.success`/`error`/`notImplemented`); handlers run on the platform main thread — move heavy work to a background thread and reply from there as the platform requires.
- **Pigeon** generates type-safe Dart/Kotlin/Swift interfaces — prefer it over hand-written string-keyed channels for anything non-trivial.
- `EventChannel` for streams (sensors, connectivity); cancel the subscription on dispose.
- `dart:ffi` + `ffigen` for C libraries; native memory must be freed explicitly (`calloc.free`, `Arena`).
- Mock in tests with `TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, handler)`.
- Validate everything coming back from native code and from intent/URL extras.

## Async and isolates

- `Future`s run on the same isolate: `async` does not make CPU work parallel.
- `Isolate.run(() => heavyParse(json))` for one-off work (closures must capture only sendable values); `compute(fn, arg)` is the older Flutter equivalent.
- Long-lived workers: `Isolate.spawn` with `SendPort`/`ReceivePort`; plugins that use platform channels from background isolates need `BackgroundIsolateBinaryMessenger.ensureInitialized(token)`.
- Streams: cancel `StreamSubscription`s; broadcast streams for multiple listeners; `async*` generators for lazy sequences.
- Timeouts: `future.timeout(const Duration(seconds: 10))` for network calls without built-in timeouts.

## Codegen (freezed, json_serializable)

- `dart run build_runner build --delete-conflicting-outputs` (one-off) or `watch` during development.
- Keep `part 'x.g.dart';` / `part 'x.freezed.dart';` directives in sync with file names.
- Decide project-wide whether generated files are committed; CI must either run codegen or verify committed output is current.
- `@JsonKey(name: 'snake_case')` or `fieldRename: FieldRename.snake` in `build.yaml`; handle unknown enum values (`unknownEnumValue`).

## Flavors and configuration

- Android `productFlavors` + iOS schemes/xcconfigs; run with `flutter run --flavor dev -t lib/main_dev.dart`.
- Non-secret configuration via `--dart-define-from-file=config/dev.json` and `String.fromEnvironment('API_BASE_URL')` — remember these values are readable in the binary.
- Different `applicationId`/bundle id per flavor so builds install side by side.
