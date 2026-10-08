# JVM build and run errors — playbook

Get the real error first:
- Gradle: `./gradlew <task> --stacktrace` (add `--info` for resolution details). Avoid `--scan` unless the user agrees — it uploads build data to an external service.
- Maven: `./mvnw <phase> -e` (add `-X` for debug output).
- Check which JDK runs the build: `./gradlew -version` / `./mvnw -v` and `java -version`. The JDK running Gradle and the toolchain JDK compiling code can differ.

## Dependency resolution

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find com.x:y:1.2.3` | typo, version not published, artifact only in another repository | check the repository's index; add the right repository in `settings.gradle.kts` `dependencyResolutionManagement` or `pom.xml` `<repositories>` |
| `Could not GET ... 401/403` | private repository credentials missing | provide them via environment variables or user-level `~/.gradle/gradle.properties` / `~/.m2/settings.xml`, never in the project |
| `PKIX path building failed` | corporate proxy / custom CA not in the JDK truststore | import the CA into the JDK used by the build (`keytool -importcert`), don't disable TLS checks |
| `Conflict found for module` / `Duplicate class` | two artifacts provide the same classes (e.g. old `kotlin-stdlib-jdk7/8` vs `kotlin-stdlib`, `javax.*` vs `jakarta.*`, two logging bindings) | `./gradlew dependencyInsight --dependency <name> --configuration runtimeClasspath`; exclude or align with a BOM/platform |
| `NoSuchMethodError` / `NoClassDefFoundError` at runtime | compile and runtime classpaths differ, or a transitive dependency was upgraded/downgraded | inspect `runtimeClasspath` / `mvn dependency:tree -Dverbose`; pin via BOM, `constraints {}` or `<dependencyManagement>` |
| `SLF4J: No SLF4J providers were found` / multiple bindings | logging backend missing or duplicated | exactly one backend (Logback/Log4j2) on the runtime classpath |
| version catalog: `Unresolved reference: libs` | catalog not in `gradle/libs.versions.toml` or alias typo | check the file location and alias (`my-lib` becomes `libs.my.lib`) |
| `Plugin [id: '...'] was not found` | plugin repository missing in `pluginManagement`, or wrong id/version | add `gradlePluginPortal()`/`google()`/`mavenCentral()` in `pluginManagement { repositories { } }` |
| Maven `Non-resolvable parent POM` | parent not in repository, or `relativePath` wrong | fix parent coordinates; set `<relativePath/>` for remote parents |
| Maven enforcer `dependencyConvergence` failure | conflicting transitive versions | add the winning version to `<dependencyManagement>` |

## JDK and toolchains

| Symptom | Cause | Fix |
|---|---|---|
| `Unsupported class file major version 65` (or other number) | something reading class files built for a newer JDK (major 61 = Java 17, 65 = Java 21; each release adds 1) on an older JVM or older Gradle/ASM | upgrade Gradle or the plugin; run Gradle on a supported JDK; use toolchains |
| `error: invalid source release: 21` / `release version 21 not supported` | `javac` older than the requested release | point `JAVA_HOME` or the toolchain at the right JDK |
| `No matching toolchains found for requested specification` | toolchain JDK not installed and auto-provisioning not configured | install the JDK, or add the Foojay toolchain resolver plugin in `settings.gradle.kts` |
| `Inconsistent JVM-target compatibility` (Java vs Kotlin) | different targets | `kotlin { jvmToolchain(N) }` instead of separate `jvmTarget`/`sourceCompatibility` |
| `class file has wrong version 61.0, should be 55.0` | dependency compiled for a newer Java than your target | raise your target or use an older dependency version |
| Gradle daemon runs out of memory / Metaspace | large build | set `org.gradle.jvmargs` in `gradle.properties` (for example `-Xmx4g`) |
| `Could not initialize class org.codehaus.groovy...` | old Gradle on a new JDK | upgrade Gradle via the wrapper |

## Annotation processing, kapt, KSP

| Symptom | Cause | Fix |
|---|---|---|
| Lombok: `cannot find symbol getX()` | Lombok not on `annotationProcessor` path | Gradle: `compileOnly(libs.lombok)` + `annotationProcessor(libs.lombok)` (+ `testCompileOnly`/`testAnnotationProcessor`); Maven: compiler plugin `annotationProcessorPaths` |
| MapStruct + Lombok: unmapped properties | processor order | add `lombok-mapstruct-binding` to the processor path |
| kapt slow or failing with a new Kotlin version | kapt is in maintenance mode | migrate processors that support KSP (Room, Moshi, Hilt/Dagger have KSP support); otherwise upgrade kapt with Kotlin |
| KSP build fails right after a Kotlin upgrade | KSP version not compatible with that Kotlin version | pick the KSP release documented for your Kotlin version |
| generated sources not visible in the IDE | generated directory not registered | re-import; for KSP check the generated source sets are on the source path |
| Dagger/Hilt `MissingBinding` | binding not provided or not in an installed component | add `@Provides`/`@Binds`, check `@InstallIn` |
| Room `Cannot figure out how to save this field` | missing `TypeConverter` | add `@TypeConverters` |

## Kotlin compiler

| Symptom | Cause | Fix |
|---|---|---|
| `Smart cast to 'X' is impossible, because 'y' is a mutable property` | `var` property may change | copy to a local `val`, or use `?.let` |
| `Type mismatch: inferred type is String? but String was expected` | nullability | handle null (`?:`, `requireNotNull`), not `!!` |
| `Suspend function should be called only from a coroutine` | calling suspend code from blocking code | make the caller `suspend`, or launch in a proper scope |
| `Class 'X' is not abstract and does not implement abstract member` | missing override | implement it |
| JPA: `No default constructor for entity` (Kotlin) | missing no-arg plugin | apply `kotlin("plugin.jpa")` |
| Spring: `@Transactional`/`@Configuration` has no effect on Kotlin class | classes final | apply `kotlin("plugin.spring")` |
| `Unresolved reference` after updating Kotlin | API removal or stdlib split | check the Kotlin "what's new"/compatibility guide |

## Spring Boot startup and runtime

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to configure a DataSource` | JPA/JDBC starter without DB config | configure `spring.datasource.*`, activate the profile; Testcontainers + `@ServiceConnection` in tests |
| `NoSuchBeanDefinitionException` | not component-scanned (package outside the main class's package), missing config, profile/condition not active | move the package, import the config; run with `--debug` to see the auto-configuration report |
| `BeanCurrentlyInCreationException` / cycle report | circular dependencies | break the cycle; do not set `spring.main.allow-circular-references` as a fix |
| `Web server failed to start. Port 8080 was already in use.` | another process | stop it or set `server.port` |
| `LazyInitializationException` | lazy association used after the transaction | fetch eagerly in the query or map to DTO in the service |
| `TransactionRequiredException` / changes not saved | `@Transactional` bypassed (self-invocation, private method, class not proxied) | call through another bean; make the method public; check the Kotlin all-open plugin |
| `HttpMediaTypeNotAcceptableException` / 406 | no message converter or missing getters on the response type | add Jackson module (Kotlin: `jackson-module-kotlin`), expose properties |
| `MismatchedInputException: Cannot construct instance` (Kotlin) | Jackson can't use Kotlin constructors | add `jackson-module-kotlin` |
| `jakarta.validation.NoProviderFoundException` | no Bean Validation implementation | add `spring-boot-starter-validation` |
| Hibernate `HHH90003004` / "firstResult/maxResults specified with collection fetch; applying in memory" | pagination + `JOIN FETCH` on a collection | paginate ids first, then fetch; or use batch fetching |

## Tests

| Symptom | Cause | Fix |
|---|---|---|
| Gradle runs 0 tests | JUnit 5 without `useJUnitPlatform()`, or JUnit 4 tests without the vintage engine | add `tasks.test { useJUnitPlatform() }`; add the vintage engine for old tests |
| Maven runs 0 tests | old Surefire, or class names not matching `*Test`/`*Tests`/`Test*` | upgrade Surefire, rename, or configure includes |
| `Could not find a valid Docker environment` (Testcontainers) | no Docker daemon / socket in CI | provide Docker in CI; skip integration tests explicitly when unavailable |
| Mockito `UnnecessaryStubbingException` | strict stubs found an unused `when(...)` | remove the stub (it is dead test code) |
| Mockito cannot mock final class (Kotlin) | final by default | MockK, or the inline mock maker (default in recent Mockito) |
| tests pass alone, fail together | shared state, static mocks, context caching with `@DirtiesContext` misuse, test ordering | isolate state; reset mocks; avoid static singletons |

## Android

See [android.md](android.md) for AGP, manifest merger, R8 and Compose build errors.
