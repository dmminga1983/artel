---
name: jvm
description: Java and Kotlin stack guide - Gradle (Kotlin DSL, version catalogs, wrapper) or Maven, JDK toolchains, Spring Boot (config, validation, transactions, JPA N+1), Kotlin null safety and coroutines, Android, JUnit 5, Mockito/MockK, Testcontainers, security and build-error playbook. Use for any Java/Kotlin code, Gradle/Maven build or failure. Триггеры - "джава", "котлин", "сборка упала".
paths: "**/*.java, **/*.kt, **/*.kts, **/pom.xml, **/build.gradle, **/build.gradle.kts, **/settings.gradle*, **/gradle.properties, gradle/libs.versions.toml, **/AndroidManifest.xml, **/application*.yml, **/application*.properties"
---

Reply in the user's language.

# Java and Kotlin (JVM)

Rule zero: **follow the project's existing conventions over these defaults.** Read before you write.

## 1. Detect the project

| Read | To learn |
|---|---|
| `gradlew` + `gradle/wrapper/gradle-wrapper.properties` | Gradle project; the pinned Gradle version. Always run `./gradlew`, never a global `gradle` |
| `settings.gradle(.kts)`, `build.gradle(.kts)`, `buildSrc/` or `build-logic/` | modules, plugins, convention plugins, Groovy vs Kotlin DSL |
| `gradle/libs.versions.toml` | version catalog — add dependencies here, reference as `libs.xxx` |
| `pom.xml` + `mvnw` / `.mvn/` | Maven project; parent POM (often `spring-boot-starter-parent`), `<properties>`, modules |
| toolchain config, `maven.compiler.release`, `.java-version`, `.sdkmanrc`, CI `setup-java` | target JDK |
| `kotlin(...)` plugins, `kotlin { jvmToolchain(...) }` | Kotlin version, `kotlin-spring`/`kotlin-jpa`, kapt vs KSP |
| `com.android.application` / `com.android.library` plugins | Android — read [android.md](android.md) |
| `src/main/resources/application*.yml/properties` | Spring Boot config and profiles |
| `src/test`, test dependencies | JUnit 4 vs 5, Mockito vs MockK, AssertJ/Kotest, Testcontainers |
| `.editorconfig`, Spotless, ktlint, detekt, Checkstyle, SpotBugs, Error Prone | formatter and linters to keep green |

If both Gradle and Maven files exist, CI decides which one is real.

## 2. Defaults for new code

- **JDK:** the current LTS that the project's frameworks support; set it with a **toolchain** (Gradle `java { toolchain { languageVersion = JavaLanguageVersion.of(N) } }` or `kotlin { jvmToolchain(N) }`; Maven `<maven.compiler.release>`), not with `sourceCompatibility` alone.
- **Build:** Gradle with Kotlin DSL and a version catalog, or Maven with the wrapper — whichever the project uses. Commit the wrapper scripts, the wrapper JAR and its properties; update with `./gradlew wrapper --gradle-version <v>` (check the current stable release).
- **Language:** Kotlin for new Android and new Kotlin services; modern Java (records, sealed types, pattern matching `switch`, text blocks, `var` for obvious local types) for Java codebases.
- **Spring Boot:** the current supported line; Jakarta EE namespace (`jakarta.*`), constructor injection, `@ConfigurationProperties` for config.
- **Tests:** JUnit 5 (Jupiter) + AssertJ (Java) or kotlin.test/Kotest assertions; Mockito (Java) or MockK (Kotlin); Testcontainers for real databases and brokers.
- **Format/lint:** whatever is configured (Spotless with google-java-format/ktlint, detekt). Do not reformat untouched files.
- **Dependencies:** let BOMs manage versions (Spring Boot BOM, Kotlin BOM, `platform(...)`); no hard-coded versions next to a BOM-managed artifact.

## 3. Idioms and design

1. **Constructor injection** with final fields (Java) or `val` constructor params (Kotlin). No field `@Autowired`. One public constructor needs no annotation.
2. **Immutability by default:** Java records / Kotlin `data class` for DTOs and value objects; `List.of`/`listOf`; `val` over `var`.
3. **Kotlin null safety:** avoid `!!`; use `?.`, `?:`, `requireNotNull(x) { "why" }`, `checkNotNull`. Annotate Java APIs (JSpecify/`@Nullable`) so Kotlin sees platform types correctly. `lateinit` only for framework-injected fields and test setup.
4. **Java nulls:** `Optional` as a return type only — never as a field or parameter. Validate inputs at boundaries (`Objects.requireNonNull`, Bean Validation).
5. **Model closed sets with `sealed`** (Kotlin `sealed interface`, Java `sealed` + records) and exhaustive `when`/`switch` without `else`/`default`.
6. **Kotlin idioms:** expression bodies, `when` over if-chains, extension functions for local helpers (not to hide behaviour), scope functions used sparingly (`let` for null checks, `apply` for builders), named and default arguments instead of overloads.
7. **Do not use `data class` for JPA entities** (equals/hashCode over lazy relations and mutable ids breaks Hibernate). Use the `kotlin-jpa` (no-arg) and `kotlin-spring` (all-open) compiler plugins.
8. **Coroutines and structured concurrency:** launch in a scope tied to a lifecycle (`coroutineScope`, `supervisorScope`, `viewModelScope`, a framework scope) — never `GlobalScope`. Switch threads with `withContext(Dispatchers.IO)` for blocking calls. Never swallow `CancellationException` (a bare `catch (e: Exception)` does — rethrow it). No `runBlocking` in request handlers or on the main thread.
9. **Flow:** cold by default; `stateIn`/`shareIn` with an explicit scope and `SharingStarted` policy; `flowOn` to change the upstream dispatcher; `catch` operators for upstream errors.
10. **Java concurrency:** prefer `ExecutorService`/`CompletableFuture` with explicit executors; on Java 21+, virtual threads for blocking I/O-heavy servers (avoid long `synchronized` blocks around blocking I/O on older JDKs, where they pin the carrier thread).
11. **Equality and hashing** consistent; `compareTo` consistent with `equals` for sorted collections.
12. **Resources:** try-with-resources (Java) / `use {}` (Kotlin) for streams, connections, files.
13. **Time:** `java.time` (`Instant`, `OffsetDateTime`, `ZoneId`), injected `Clock` for testability; never `java.util.Date` in new code.
14. **Money:** `BigDecimal` (constructed from strings), never `double`.

## 4. Errors and logging

- Throw specific exceptions; don't catch `Exception`/`Throwable` except at boundaries (controllers' advice, job runners, `main`). Never swallow an exception without logging or rethrowing with cause (`throw new XException("context", e)`).
- Checked exceptions (Java): wrap in a domain exception at layer boundaries rather than leaking `SQLException`/`IOException` upward.
- Kotlin: `Result`/`runCatching` catches `CancellationException` and `Error` too — avoid it in coroutine code or rethrow cancellation; prefer sealed result types for expected failures.
- Spring MVC: one `@RestControllerAdvice` mapping exceptions to responses (`ProblemDetail` / RFC 9457 support in Spring 6); never return stack traces to clients.
- Logging: SLF4J API (`private static final Logger log = LoggerFactory.getLogger(X.class)`; Kotlin a companion or top-level logger) with parameterised messages (`log.info("user {} logged in", id)`), not string concatenation. Structured/JSON logging in production; MDC for request IDs.
- Never log passwords, tokens, full request bodies, or personal data; check `toString()` of records/data classes that contain secrets.

## 5. Testing

- **Layout:** `src/test/java|kotlin` mirroring main packages; integration tests in a separate source set or tagged (`@Tag("integration")`) if the project does that.
- **JUnit 5:** `@Test`, `@ParameterizedTest` with `@ValueSource`/`@CsvSource`/`@MethodSource`, `@Nested`, `@TempDir`, `assertThrows`. Requires `useJUnitPlatform()` in Gradle `test` task.
- **Mocks:** Mockito (`@ExtendWith(MockitoExtension.class)`, `@Mock`, `when(...).thenReturn(...)`, `verify`). Kotlin: MockK (`mockk<T>()`, `every { }`, `coEvery { }` for suspend functions, `verify`/`coVerify`); in Spring tests use the Spring-integrated variants. Mock at boundaries, not value objects.
- **Spring slices:** `@WebMvcTest` (controllers + MockMvc), `@DataJpaTest` (JPA repositories), `@JsonTest`, `@RestClientTest`; `@SpringBootTest` only for full wiring. Mocks of beans: `@MockitoBean` on current Spring versions (older projects use `@MockBean`).
- **Testcontainers:** real PostgreSQL/Kafka/etc. with `@Testcontainers` + `@Container`; Spring Boot `@ServiceConnection` wires connection details automatically. Prefer this over H2 when SQL dialect matters.
- **Coroutines:** `kotlinx-coroutines-test` `runTest`, inject dispatchers; Flow with Turbine if present.
- **Commands:**
  - Gradle all: `./gradlew test` (or `check` for tests + linters); one class/method: `./gradlew test --tests 'com.example.FooTest'` / `--tests 'com.example.FooTest.bar*'`; one module: `./gradlew :service:test`
  - Maven all: `./mvnw test` (`verify` for integration tests via Failsafe); one test: `./mvnw -Dtest=FooTest#bar test`; one module: `./mvnw -pl service -am test`
  - Coverage: JaCoCo (`jacocoTestReport` task / `jacoco-maven-plugin`) or Kover for Kotlin.

## 6. Security pitfalls

- **SQL/JPQL/HQL injection:** never concatenate input into `createQuery`, `createNativeQuery`, `JdbcTemplate` SQL or `@Query` strings. Use named/positional parameters (`:name`, `?`), Spring Data derived queries, Criteria API, jOOQ. Sort fields from requests must be whitelisted.
- **Deserialisation:** no `ObjectInputStream.readObject` on untrusted data (use an `ObjectInputFilter` if unavoidable); no Jackson polymorphic typing by class name (`activateDefaultTyping`, `@JsonTypeInfo(use = Id.CLASS)`) for untrusted JSON — use `Id.NAME` with explicit subtypes; YAML from users via SnakeYAML `SafeConstructor`.
- **XML (XXE):** disable DTDs/external entities on `DocumentBuilderFactory`, `SAXParserFactory`, `XMLInputFactory`, `TransformerFactory`.
- **Expression injection:** never evaluate SpEL, OGNL, EL or templates built from user input.
- **Spring Security:** a `SecurityFilterChain` bean with `authorizeHttpRequests` denying by default (`anyRequest().authenticated()`); keep CSRF on for browser/cookie sessions (disable only for stateless token APIs, with a comment); method security (`@EnableMethodSecurity`, `@PreAuthorize`) for object-level checks; passwords via `PasswordEncoder` (BCrypt/Argon2 through `DelegatingPasswordEncoder`).
- **Actuator:** expose only what you need (`management.endpoints.web.exposure.include=health,info`); `env`, `configprops`, `heapdump`, `threaddump`, `loggers` leak secrets or allow changes — keep them off or behind authentication on a separate management port.
- **Mass assignment:** bind requests to DTOs, never directly to entities.
- **Validation:** `spring-boot-starter-validation`, `@Valid` on `@RequestBody`, `@Validated` on `@ConfigurationProperties` and services with constraint annotations.
- **Secrets:** environment variables, a secrets manager or Spring Cloud config with encryption — not `application.yml` in git. `.env`, `local.properties`, keystores stay git-ignored.
- **Other:** path traversal (normalise and check `Path.startsWith(base)`), SSRF in URL fetchers, open redirects, CORS with `allowCredentials` + wildcard origins, Java `Random` for tokens (use `SecureRandom`).
- **Dependency audit:** OWASP Dependency-Check (Gradle plugin `org.owasp.dependencycheck`, task `dependencyCheckAnalyze`; Maven `org.owasp:dependency-check-maven:check`), or the platform's Dependabot/Renovate alerts. Inspect the graph with `./gradlew dependencies` or `./mvnw dependency:tree`. Validate the Gradle wrapper JAR in CI.

## 7. Performance pitfalls

- **JPA N+1:** lazy associations loaded per row in a loop or during JSON serialisation. Fix with `JOIN FETCH`, `@EntityGraph`, batch fetching (`hibernate.default_batch_fetch_size`), or DTO projections. Turn on SQL logging or Hibernate statistics in tests to count queries.
- **Open Session in View:** Spring Boot enables `spring.jpa.open-in-view` by default (and warns); it hides N+1 and holds connections for the whole request. Set it to `false` in new services and fetch what you need in the transaction.
- **Transactions:** keep them short; no remote calls inside; `@Transactional(readOnly = true)` for reads.
- **Pagination:** `Pageable` with a stable sort; avoid `JOIN FETCH` with pagination over collections (Hibernate paginates in memory and warns).
- **Connection pool (HikariCP):** size to the database, not to thread count; watch for pool exhaustion from long transactions.
- **Allocation:** avoid boxing in hot loops, `String +=` in loops (`StringBuilder`), streams for tiny hot paths; reuse `ObjectMapper` (thread-safe once configured).
- **Coroutines:** no blocking calls on `Dispatchers.Default`; limit parallelism (`Dispatchers.IO.limitedParallelism(n)`, semaphores).
- **Measure:** JMH for micro-benchmarks, JFR + JDK Mission Control or async-profiler for production profiles; Gradle build performance with `--profile` or the configuration/build cache.

## 8. Build and run errors

Read the first error; rerun with `--stacktrace` (Gradle) or `-e` (Maven). Full playbook: [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `Could not resolve all files for configuration` / `Could not find group:artifact:version` | version does not exist, repository missing, offline/proxy, private repo credentials | check coordinates, `repositories {}`/`dependencyResolutionManagement`, credentials via env/`~/.gradle/gradle.properties` |
| `Unsupported class file major version NN` | a tool (Gradle, plugin, Kotlin compiler) runs on a JDK older than the bytecode, or Gradle too old for the JDK | align JDK with toolchains; upgrade Gradle/plugin |
| `invalid target release` / `release version NN not supported` | compiling with an older JDK than the target | install/select the right JDK, use toolchains |
| `Inconsistent JVM-target compatibility detected for tasks 'compileJava' and 'compileKotlin'` | Java and Kotlin targets differ | `kotlin { jvmToolchain(N) }` so both match |
| `NoSuchMethodError` / `ClassNotFoundException` / `NoClassDefFoundError` at runtime | dependency version conflict or missing runtime dependency | `dependencyInsight` / `dependency:tree`; align with a BOM; check `implementation` vs `compileOnly` |
| `package javax.persistence does not exist` after Boot 3 upgrade | Jakarta namespace | migrate imports to `jakarta.*` (OpenRewrite recipes help) |
| Lombok getters "cannot find symbol" | annotation processor not configured | Gradle: `compileOnly` + `annotationProcessor` (also for tests); MapStruct + Lombok needs `lombok-mapstruct-binding` |
| kapt/KSP errors, `[ksp] ... version mismatch` | KSP or kapt incompatible with the Kotlin version | align versions per KSP compatibility notes; migrate from kapt to KSP where the library supports it |
| `Failed to configure a DataSource: 'url' attribute is not specified` | DB starter present but no config/profile | set `spring.datasource.*`, activate the profile, or exclude auto-config for apps without DB |
| `NoSuchBeanDefinitionException` / `UnsatisfiedDependencyException` | bean not scanned, missing `@Component`/config, conditional not met | check package under `@SpringBootApplication`, profiles, `@ConditionalOn...` report (`--debug`) |
| `The dependencies of some of the beans form a cycle` | circular injection (prohibited by default) | redesign; extract a third bean; don't just enable circular references |
| `LazyInitializationException: could not initialize proxy - no Session` | lazy relation accessed outside a transaction | fetch in the query (`JOIN FETCH`/`@EntityGraph`) or map to DTO inside the transaction |

## 9. Review checklist

- [ ] Build, tests and linters pass with the wrapper (`./gradlew check` / `./mvnw verify`).
- [ ] Constructor injection; no field injection; no `!!` without a proven invariant.
- [ ] Queries parameterised; DTOs at the API boundary; `@Valid` on inputs.
- [ ] Transactions on service methods called from another bean (self-invocation bypasses the proxy); no remote calls inside them.
- [ ] No N+1 (query count checked); `open-in-view` considered.
- [ ] Coroutines in structured scopes; `CancellationException` not swallowed; no blocking on the wrong dispatcher.
- [ ] Spring Security deny-by-default; actuator exposure minimal; no secrets in config or logs.
- [ ] Versions from BOM/catalog; no new dependency without reason.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **Spring Boot:** profiles via `application-<profile>.yml` and `spring.profiles.active`; typed config with `@ConfigurationProperties` + `@Validated`; `@Transactional` rolls back on unchecked exceptions only by default; schema via Flyway/Liquibase with `spring.jpa.hibernate.ddl-auto=validate` or `none` outside local dev.
- **Spring Data JPA:** derived queries for simple cases, `@Query` with parameters otherwise, projections for read models, `@Version` for optimistic locking.
- **Ktor / Micronaut / Quarkus:** follow the framework's DI and config model; the security and JPA advice above still applies.
- **Android:** Gradle/AGP, Compose, lifecycle, ViewModel, R8 — [android.md](android.md).

Details and examples: [frameworks.md](frameworks.md).
