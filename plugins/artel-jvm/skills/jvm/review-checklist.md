# JVM review checklist — full version

Run first: `./gradlew check` or `./mvnw verify` (with the wrapper), plus the project's formatter/linters (Spotless, ktlint, detekt, Checkstyle, SpotBugs, Android Lint).

## Build and dependencies

- [ ] Dependencies added to the version catalog / `<dependencyManagement>`; versions managed by BOMs where available.
- [ ] Correct configuration: `implementation` vs `api` vs `compileOnly` vs `runtimeOnly` vs `testImplementation`.
- [ ] No new repository without reason; no `mavenLocal()` in shared builds; no dynamic versions (`+`, `latest.release`).
- [ ] Toolchain/JDK unchanged unless intended; wrapper updated through the wrapper task with checksums.
- [ ] OWASP Dependency-Check / Dependabot alerts considered for new dependencies.

## Code

- [ ] Constructor injection; immutable fields; no static mutable state.
- [ ] Kotlin: no `!!` without a proven invariant; no `lateinit` outside DI/test setup; platform types from Java handled.
- [ ] Java: `Optional` only as a return type; no returning `null` collections.
- [ ] Records/data classes for DTOs; entities are not data classes and do not use Lombok `@Data`.
- [ ] Exhaustive `when`/`switch` over sealed types without `else`.
- [ ] Resources closed with try-with-resources / `use`.
- [ ] `java.time` with an injected `Clock`; `BigDecimal` for money.
- [ ] `equals`/`hashCode`/`toString` safe (no lazy-loading or secrets in `toString`).

## Errors and logging

- [ ] No empty catch blocks; exceptions rethrown with cause.
- [ ] One place maps exceptions to HTTP responses; no stack traces to clients.
- [ ] SLF4J parameterised logging; no secrets or personal data in logs.
- [ ] Coroutines: `CancellationException` rethrown; no `runCatching` around suspend calls without handling cancellation.

## Spring

- [ ] `@Transactional` on public service methods invoked from other beans; no remote calls inside transactions; `readOnly` on reads.
- [ ] Inputs validated (`@Valid`, constraint annotations); config validated (`@Validated` on `@ConfigurationProperties`).
- [ ] Request bodies bound to DTOs, not entities.
- [ ] `open-in-view` disabled (or a reason why not); `ddl-auto` not `update`/`create` beyond local dev; migrations added for schema changes.
- [ ] Profiles: no production secrets or `debug=true` in committed profile files.

## Data access

- [ ] No string-built JPQL/SQL/native queries; sort/filter fields whitelisted.
- [ ] N+1 checked (fetch joins, entity graphs, batch size, projections); pagination does not combine with collection fetch joins.
- [ ] `@ManyToOne`/`@OneToOne` explicitly lazy; optimistic locking where concurrent edits matter.
- [ ] Bulk updates clear or avoid the persistence context.

## Security

- [ ] `SecurityFilterChain` denies by default; new endpoints have explicit rules; object-level authorisation checked.
- [ ] CSRF stays on for cookie-based sessions; CORS lists explicit origins.
- [ ] Actuator exposure limited to `health`/`info`; management endpoints protected.
- [ ] No `ObjectInputStream` on untrusted data; no Jackson default typing; SnakeYAML safe loading; XML parsers with DTDs disabled.
- [ ] No SpEL/EL/template evaluation of user input.
- [ ] `SecureRandom` for tokens; `PasswordEncoder` for passwords; file paths confined to a base directory; outbound URL fetches guarded against SSRF.
- [ ] Android: no secrets in the APK; components not exported without need; tokens in Keystore-backed storage.

## Concurrency and performance

- [ ] Blocking calls not on `Dispatchers.Default`/event loops; coroutine scopes tied to lifecycles; no `GlobalScope`.
- [ ] Thread pools bounded; `CompletableFuture` uses an explicit executor.
- [ ] HTTP clients and `ObjectMapper` reused; timeouts set on outbound calls.
- [ ] Performance claims backed by JMH/JFR/profiler data.

## Tests

- [ ] JUnit 5 with `useJUnitPlatform()`; new behaviour and bug fixes covered.
- [ ] Narrowest Spring slice used; mocks only at boundaries; no `Thread.sleep` waits (use Awaitility or virtual time).
- [ ] Testcontainers for database-specific behaviour instead of H2 where dialect matters.
- [ ] Tests independent of order, time zone and locale.
