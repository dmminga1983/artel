# Flutter build errors — detailed playbook

Always start with the **first** error in the full output (`flutter build apk -v` / `flutter run -v`, or the Xcode build log), and with `flutter doctor -v`. Use the project's pinned Flutter version (FVM/CI) before anything else — many "errors" are just a different SDK.

## Clean-up commands (in increasing cost)

```sh
flutter pub get
flutter clean && flutter pub get          # deletes build/ and .dart_tool/ — safe, forces full rebuild
cd android && ./gradlew --stop             # stop stale Gradle daemons
cd ios && pod install --repo-update        # refresh CocoaPods specs
```

Avoid deleting global caches (`~/.gradle`, `~/.pub-cache`, `~/Library/Developer/Xcode/DerivedData`) unless the targeted fixes failed; label it as slow and disruptive when you suggest it.

## Pub / Dart

| Symptom | Cause | Fix |
|---|---|---|
| `version solving failed` | Conflicting constraints | Read the "Because ..." chain bottom-up; find the package pinning the old version; `flutter pub outdated` shows resolvable/latest; upgrade that package or wait for a release. `dependency_overrides` only temporarily, with a comment and an issue link |
| `The current Dart SDK version is ...` | SDK constraint mismatch | Switch to the project's Flutter version; raise `environment: sdk:` only as a deliberate decision (it may require code changes, e.g. Dart 3 class modifiers, formatter style changes) |
| `Null safety` errors from dependencies | Package predates null safety | Upgrade to a null-safe version or replace the package; Dart 3 has no unsound mode |
| `A value of type 'X?' can't be assigned to 'X'` after upgrade | New nullability in an API | Handle null explicitly (`?? default`, early return); avoid `!` unless the invariant is guaranteed |
| `Conflicting outputs were detected` from build_runner | Stale generated files | `dart run build_runner build --delete-conflicting-outputs` |
| Analyzer: `The method 'x' isn't defined` after package upgrade | Breaking API change | Read the package CHANGELOG; `dart fix --apply` covers some deprecations |
| `pub get` hangs / `Got socket error` | Network/proxy, pub.dev mirror settings | Check `PUB_HOSTED_URL` and proxy env vars; retry |

## Android (Gradle, AGP, Kotlin, JDK)

Key files: `android/settings.gradle(.kts)` (plugin versions: AGP, Kotlin, Flutter plugin loader), `android/app/build.gradle(.kts)` (`namespace`, `compileSdk`, `minSdk`, `targetSdk`, `ndkVersion`, signing), `android/gradle/wrapper/gradle-wrapper.properties` (`distributionUrl`), `android/gradle.properties`. Newer templates use Kotlin DSL (`.kts`).

| Symptom | Cause | Fix |
|---|---|---|
| `Minimum supported Gradle version is X. Current version is Y` | AGP newer than the wrapper's Gradle | Raise `distributionUrl` in `gradle-wrapper.properties` to a version compatible with the AGP (see the AGP release notes compatibility table) |
| `Unsupported class file major version NN` / `Could not open cp_settings generic class cache` | JDK too new for the Gradle version | Use a JDK supported by your Gradle; point Flutter at it with `flutter config --jdk-dir <path>`; check `flutter doctor -v` for which JDK is used |
| `Android Gradle plugin requires Java 17 to run` (or similar) | JDK too old | Install the required JDK and configure it as above |
| `Namespace not specified` | AGP 8+ needs `namespace` | Add it to the app module; outdated plugins → upgrade |
| `Your project requires a newer version of the Kotlin Gradle plugin` | Plugin compiled with newer Kotlin | Raise the Kotlin plugin version in `settings.gradle(.kts)` |
| `You are applying Flutter's main Gradle plugin imperatively` / `app_plugin_loader` warnings | Pre-3.16 Gradle layout | Migrate to declarative `plugins { id "dev.flutter.flutter-gradle-plugin" }` per the official migration guide |
| `Manifest merger failed : uses-sdk:minSdkVersion ...` | Plugin needs higher `minSdk` | Raise `minSdk` (product decision) |
| `Manifest merger failed ... android:exported needs to be explicitly specified` | targetSdk 31+ rule | Add `android:exported` to activities/services/receivers with intent filters |
| `checkDebugAarMetadata` / `requires libraries and applications that depend on it to compile against version NN` | `compileSdk` too low | Raise `compileSdk` (doesn't change runtime behaviour like `targetSdk` does) |
| `NDK version mismatch` / `No version of NDK matched` | Plugins need a specific NDK | Set `ndkVersion` in `android/app/build.gradle(.kts)` to the version the error names; install it via SDK Manager |
| `Duplicate class ... found in modules` | Two dependencies bundle the same library | Align versions; exclude the duplicate transitive dependency |
| `Execution failed for task ':app:minifyReleaseWithR8'` / missing classes | R8 removed classes used via reflection | Add keep rules in `proguard-rules.pro` for the reported classes (or the library's documented rules) |
| `Keystore file not found for signing config 'release'` | `key.properties` missing locally/in CI | Provide it from secrets in CI; never commit the keystore or `key.properties` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Installed app signed with a different key | Uninstall the app from the device (labelled: deletes its local data) |

## iOS / macOS (Xcode, CocoaPods, SwiftPM)

Key files: `ios/Podfile` (`platform :ios, 'X'`), `ios/Runner.xcworkspace` (open this, not `.xcodeproj`), `ios/Runner/Info.plist`, `ios/Flutter/*.xcconfig`. Flutter can also use Swift Package Manager for plugins (enable with `flutter config --enable-swift-package-manager`); then some CocoaPods steps don't apply — check which the project uses.

| Symptom | Cause | Fix |
|---|---|---|
| `CocoaPods not installed or not in valid state` | No CocoaPods / broken Ruby env | Install CocoaPods (Homebrew or gem) and check `pod --version` |
| `CocoaPods could not find compatible versions for pod "X"` | Stale specs or deployment target too low | `cd ios && pod install --repo-update`; raise `platform :ios` in the Podfile and the Runner target's deployment target |
| `The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to X, but the range of supported deployment target versions is ...` (warnings from pods) | Old pods' targets | Raise targets via the Podfile `post_install` hook if the project does so; upgrade the pods |
| `Module 'x' not found` | Building the project instead of the workspace, pods missing | Open/build `Runner.xcworkspace`; `pod install` |
| `Signing for "Runner" requires a development team` | Team not set | Set the team in Xcode (Runner › Signing & Capabilities) |
| `Sandbox: rsync ... deny file-write-create` | User script sandboxing on with old build scripts | Update Flutter/CocoaPods; set `ENABLE_USER_SCRIPT_SANDBOXING` to `No` for the Runner target only if the project's Flutter version requires it |
| `Command PhaseScriptExecution failed with a nonzero exit code` | A build script failed (Flutter build, Crashlytics, pods) | Read the script output above it in the log — that's the real error |
| `Unable to boot the Simulator` / no devices | Simulator runtime missing | Install a runtime in Xcode › Settings › Platforms; `xcrun simctl list devices available` |
| Architecture errors on Apple silicon (`building for iOS Simulator, but linking in object file built for iOS`) | Old binary pods without simulator arm64 slice | Upgrade the pod; excluding `arm64` for the simulator is a last-resort workaround |
| App crashes on launch requesting a permission | Missing `NS...UsageDescription` in `Info.plist` | Add the key with a clear reason |

## Web and desktop

| Symptom | Cause | Fix |
|---|---|---|
| `dart:html`/`dart:io` not available | Platform-specific import | Conditional imports (`if (dart.library.js_interop)` / `if (dart.library.io)`); `package:web` replaces `dart:html` |
| CORS errors in web debug | Browser enforces CORS; mobile didn't | Fix server CORS headers; don't disable browser security as a "fix" |
| Linux desktop build: missing GTK/CMake/ninja | System packages | Install what `flutter doctor -v` lists for Linux desktop |
| Windows: `Visual Studio not installed` / wrong workload | Desktop C++ workload missing | Install Visual Studio with the "Desktop development with C++" workload |
