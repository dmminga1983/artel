# Android notes

Follow the project's existing architecture (MVVM/MVI, Hilt/Koin, Views vs Compose). These are defaults and pitfalls.

## Detect

- `settings.gradle.kts`: `pluginManagement` repositories must include `google()`.
- `gradle/libs.versions.toml`: AGP (`com.android.application`), Kotlin, Compose BOM, KSP versions.
- Module `build.gradle.kts`: `android { namespace, compileSdk, defaultConfig { minSdk, targetSdk }, buildTypes, flavorDimensions/productFlavors, buildFeatures { compose } }`.
- `gradle.properties`: `android.useAndroidX`, `org.gradle.jvmargs`, non-transitive R classes.
- `local.properties`: SDK path, machine-specific values — never committed; never put API keys there expecting them to be secret in the APK.

## Gradle and AGP

- AGP, Gradle, Kotlin, KSP and the JDK must be a compatible set; check the AGP release notes' compatibility table before upgrading any one of them. Upgrade with the Android Studio AGP Upgrade Assistant when possible.
- Recent AGP versions require JDK 17 or newer to run the build.
- `namespace` in the module build file replaces the `package` attribute in `AndroidManifest.xml`.
- `compileSdk` controls which APIs you can call; `targetSdk` opts into new behaviour changes — raise it deliberately and test the behaviour changes listed for that API level; `minSdk` decides which APIs need version checks (`Build.VERSION.SDK_INT`) or AndroidX shims.
- Signing configs: keystore path and passwords come from environment variables or CI secrets, never from the committed build file.
- Build variants: `./gradlew assembleDebug`, `./gradlew :app:assembleRelease`, `./gradlew bundleRelease` (AAB for Play), `./gradlew lint`, `./gradlew testDebugUnitTest`, `./gradlew connectedDebugAndroidTest` (device/emulator).

## Compose

- Since Kotlin 2.0 the Compose compiler ships with Kotlin: apply the `org.jetbrains.kotlin.plugin.compose` plugin with the same version as Kotlin; do not set an old `composeOptions.kotlinCompilerExtensionVersion`.
- Use the Compose BOM (`platform(libs.androidx.compose.bom)`) and omit versions on individual Compose artifacts.
- State: hoist state up; composables take values and lambdas. `remember` for per-composition state, `rememberSaveable` for state that survives configuration change and process death (small, saveable types only).
- Collect flows with `collectAsStateWithLifecycle()` (lifecycle-runtime-compose) so collection stops in the background.
- Side effects: `LaunchedEffect(key)` for suspend work tied to keys, `DisposableEffect` for register/unregister, `rememberUpdatedState` for latest lambdas in long effects. Never launch coroutines or do I/O directly in the composable body.
- Stability: pass immutable data (data classes with `val`, immutable collections) to avoid needless recomposition; use `key` in lazy lists (`items(list, key = { it.id })`).
- Previews: `@Preview` with fake data; no ViewModel creation in previews.
- Tests: `createComposeRule()` / `createAndroidComposeRule<...>()`, find nodes by semantics (`onNodeWithText`, test tags).

## Lifecycle and ViewModel

- UI state lives in a `ViewModel` exposed as `StateFlow<UiState>` (immutable data class or sealed interface); one-off events as state or a `Channel`-backed flow consumed once — follow the project's choice.
- Launch work in `viewModelScope`; it is cancelled in `onCleared`. In Activities/Fragments use `lifecycleScope` with `repeatOnLifecycle(Lifecycle.State.STARTED)` to collect flows; in Fragments use `viewLifecycleOwner` for view-bound work.
- Never hold an `Activity`, `Fragment`, `View` or `Context` (except application context) in a ViewModel or singleton — memory leaks.
- `SavedStateHandle` for small state that must survive process death (navigation args, form input).
- Configuration changes recreate Activities; don't rely on Activity fields for state.
- Background work that must run even if the app is closed: WorkManager, not raw threads or coroutines in a ViewModel.
- Main thread: no disk or network I/O (StrictMode in debug builds catches it). Use `Dispatchers.IO` in repositories.

## Security

- Secrets in the APK are not secret: anything in `BuildConfig`, resources or native libs can be extracted. Keep real secrets on a server; ship only restricted, revocable client keys.
- Store tokens with Android Keystore-backed encryption, not in plain `SharedPreferences`.
- `android:exported` must be explicit for components with intent filters (required since Android 12); export only what other apps must reach and protect with permissions.
- `PendingIntent` must declare mutability (`FLAG_IMMUTABLE` unless mutation is required).
- WebView: keep JavaScript off unless needed; never `addJavascriptInterface` for untrusted content; don't override SSL errors to proceed.
- Network: HTTPS only (default network security config blocks cleartext on recent targets); certificate pinning only with a rotation plan.
- Validate data from intents, deep links and content providers like any untrusted input; parameterise SQL (Room does this for `@Query` parameters).
- `android:allowBackup` / data extraction rules: exclude tokens and sensitive files.
- Release builds: `isMinifyEnabled = true` with R8, `isDebuggable = false`, logging of sensitive data stripped.

## Performance

- Lazy lists with stable keys; avoid heavy work in composition; use Baseline Profiles for startup; measure with Macrobenchmark and the Android Studio profilers.
- Images: a loading library (Coil/Glide) with sizing; never decode full-size bitmaps on the main thread.
- Startup: defer initialisation (App Startup library or lazy injection).

## Android build errors

| Symptom | Cause | Fix |
|---|---|---|
| `Minimum supported Gradle version is X. Current version is Y.` | AGP newer than the wrapper's Gradle | `./gradlew wrapper --gradle-version X` (or newer compatible) |
| `Android Gradle plugin requires Java 17 to run` | Gradle running on an older JDK | set Studio's Gradle JDK / `JAVA_HOME` / `org.gradle.java.home` to a supported JDK |
| `Namespace not specified` | AGP 8+ requires `namespace` | add `android { namespace = "..." }` |
| `Manifest merger failed : android:exported needs to be explicitly specified` | targetSdk 31+ with intent-filter components | add `android:exported="true|false"` to each such component (including in libraries via `tools:node` if needed) |
| `Manifest merger failed : uses-sdk:minSdkVersion X cannot be smaller than version Y declared in library` | library needs a higher minSdk | raise `minSdk` or use another library version |
| `Duplicate class ... found in modules` | two artifacts with the same classes (old support libs vs AndroidX, Kotlin stdlib variants, Guava `listenablefuture`) | find with `./gradlew :app:dependencies`; exclude or align versions; enable Jetifier only for legacy support-library deps |
| `AAPT: error: resource ... not found` | missing resource, wrong namespace for R, non-transitive R classes | reference the resource from the module that declares it (`com.lib.R`), add the dependency |
| `Missing classes detected while running R8` | release minification lacks keep rules | add the generated `missing_rules.txt` entries or the library's consumer rules after checking them |
| release crash `ClassNotFoundException` / serialization failure, debug fine | R8 removed/renamed reflective classes | add `-keep` rules or use codegen-based serialization (kotlinx.serialization, Moshi codegen) |
| `This version of the Compose Compiler requires Kotlin version ...` | old Compose compiler setup | Kotlin 2.0+: apply the Compose compiler Gradle plugin with the Kotlin version |
| `Cannot access 'androidx.lifecycle.ViewModelStoreOwner'` / `Supertypes of the following classes cannot be resolved` | transitive dependency not on the compile classpath | add the library explicitly (`api` vs `implementation`) |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | installed app signed with another key | uninstall the old app from the device (destroys its local data) |
| `Execution failed for task ':app:mergeDebugResources'` | invalid XML/drawable name (uppercase, dash) | resource names must be lowercase letters, digits and underscores |
| `checkDebugAarMetadata` fails: requires compileSdk N | library compiled against a newer SDK | raise `compileSdk` (install the platform) |
