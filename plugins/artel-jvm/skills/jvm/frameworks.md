# JVM frameworks — Spring Boot, JPA, Spring Security, Kotlin coroutines

Check the project's Spring Boot and Kotlin versions first; property names and test annotations change between major lines.

## Spring Boot configuration

- Files: `application.yml` (or `.properties`) plus `application-<profile>.yml`. Activate with `SPRING_PROFILES_ACTIVE=prod` or `--spring.profiles.active=prod`. Keep the default profile safe for production or fail fast when required config is missing.
- Precedence (simplified): command-line args > environment variables > profile files > `application.yml`. Environment variables use relaxed binding (`SPRING_DATASOURCE_URL` → `spring.datasource.url`).
- Typed config:

```java
@ConfigurationProperties(prefix = "billing")
@Validated
public record BillingProperties(@NotBlank String apiUrl, @NotNull Duration timeout) {}
// register with @EnableConfigurationProperties(BillingProperties.class) or @ConfigurationPropertiesScan
```

```kotlin
@ConfigurationProperties(prefix = "billing")
@Validated
data class BillingProperties(@field:NotBlank val apiUrl: String, val timeout: Duration)
```

  Kotlin constraint annotations on constructor properties need a use-site target (`@field:`) on many Kotlin/Spring combinations — check that validation actually fires.
- Secrets: `${DB_PASSWORD}` placeholders resolved from the environment; local values in an ignored `application-local.yml` or user secrets tooling.
- `spring.jpa.open-in-view=false`, `spring.jpa.hibernate.ddl-auto=validate` (or `none`) outside throwaway local setups; schema changes in Flyway (`db/migration/V1__init.sql`) or Liquibase.

## Validation and errors

```java
@PostMapping("/users")
ResponseEntity<UserDto> create(@Valid @RequestBody CreateUserRequest req) { ... }

@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(NotFoundException.class)
  ProblemDetail notFound(NotFoundException e) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
  }
}
```

- `@Valid` cascades into nested objects; `@Validated` on a class enables method-parameter validation (`@NotNull` on service parameters).
- Validation errors from `@RequestBody` raise `MethodArgumentNotValidException`; map them to 400 with field errors, without echoing internals.
- Turning on `spring.mvc.problemdetails.enabled` gives RFC 9457 responses for built-in exceptions.

## Transactions

- `@Transactional` works through a proxy: it applies only when the method is called **from another bean** (self-invocation skips it), and is designed for public methods.
- Default rollback: unchecked exceptions and `Error`. Checked exceptions commit unless `rollbackFor` is set.
- `readOnly = true` for queries (Hibernate skips dirty checking; some drivers route to replicas).
- `Propagation.REQUIRES_NEW` suspends the outer transaction and uses another connection — can exhaust the pool under load.
- Don't call HTTP services or message brokers inside a DB transaction; use the transactional outbox pattern or `@TransactionalEventListener(phase = AFTER_COMMIT)`.
- In Kotlin, classes and methods must be open for proxies: apply `kotlin("plugin.spring")`.

## JPA / Hibernate

- **N+1:** detect by enabling SQL logging in tests (`spring.jpa.show-sql` or the `org.hibernate.SQL` logger) or asserting query counts. Fix:

```java
@Query("select o from Order o join fetch o.lines where o.customer.id = :id")
List<Order> findWithLines(@Param("id") long id);

@EntityGraph(attributePaths = {"lines"})
List<Order> findByCustomerId(long id);
```

  or `spring.jpa.properties.hibernate.default_batch_fetch_size=50` for batch loading, or DTO/interface projections for read models.
- Associations: `@ManyToOne(fetch = LAZY)` explicitly (the JPA default for to-one is eager); collections are lazy by default — keep them lazy.
- Entities: id-based `equals`/`hashCode` that is stable across persist (or business key); no Lombok `@Data`/Kotlin `data class` on entities; `@Version` for optimistic locking.
- Bulk operations: `@Modifying @Query("update ...")` bypasses the persistence context — clear it or don't reuse loaded entities.
- Native queries: `@Query(value = "...", nativeQuery = true)` with `:param` placeholders only.
- Dynamic filtering: Specifications / Criteria API / Querydsl / jOOQ — never string concatenation. Sort properties from the client must be validated against a whitelist.

## Spring Security (6.x style)

```java
@Configuration
@EnableMethodSecurity
class SecurityConfig {
  @Bean
  SecurityFilterChain api(HttpSecurity http) throws Exception {
    http
      .authorizeHttpRequests(auth -> auth
        .requestMatchers("/actuator/health", "/public/**").permitAll()
        .anyRequest().authenticated())
      .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
    return http.build();
  }
}
```

- `WebSecurityConfigurerAdapter` is gone; configure `SecurityFilterChain` beans.
- Order matters in `requestMatchers`: specific rules first, `anyRequest()` last.
- CSRF: keep enabled for session/cookie browser apps; a stateless bearer-token API may disable it — write why.
- CORS: configure through `http.cors(...)` with a `CorsConfigurationSource` listing explicit origins.
- Object-level authorisation (IDOR): check ownership in the service or with `@PreAuthorize("@authz.canRead(#id, authentication)")`; URL rules alone are not enough.
- Passwords: `PasswordEncoderFactories.createDelegatingPasswordEncoder()`.
- Test with `spring-security-test` (`@WithMockUser`, `jwt()` request post-processor).

## Actuator

- Expose only `health` (and `info` if useful) on the public port: `management.endpoints.web.exposure.include=health,info`.
- Move management to another port (`management.server.port`) bound to an internal network if you need more endpoints; protect them with Spring Security.
- `heapdump`, `env`, `configprops`, `threaddump`, `loggers`, `shutdown` are sensitive; recent Boot versions mask `env`/`configprops` values by default — do not turn masking off in production.
- Health details (`management.endpoint.health.show-details`) only `when-authorized`.

## Testing Spring

- `@WebMvcTest(UserController.class)` + `MockMvc` + mocked services (`@MockitoBean`, or `@MockBean` on older versions).
- `@DataJpaTest` uses an embedded DB by default; with Testcontainers use `@AutoConfigureTestDatabase(replace = Replace.NONE)` and a container with `@ServiceConnection`.
- `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `TestRestTemplate`/`WebTestClient` for end-to-end slices.
- Context caching: identical configuration reuses the context; each distinct `@MockitoBean` set or `@DirtiesContext` creates a new one (slow). Keep test configuration uniform.

## Kotlin coroutines on the server

- Spring MVC/WebFlux support `suspend` controller functions and `Flow` return types (WebFlux natively; MVC via coroutine bridging on recent versions — check the project).
- Repositories: blocking JPA calls inside `suspend` functions must run on `Dispatchers.IO` (`withContext`). For fully reactive stacks use R2DBC.
- Structured concurrency:

```kotlin
suspend fun loadDashboard(id: Long): Dashboard = coroutineScope {
    val user = async { users.find(id) }
    val orders = async { orders.recent(id) }
    Dashboard(user.await(), orders.await())   // if one fails, the other is cancelled
}
```

- `supervisorScope` when children may fail independently; `withTimeout` for deadlines.
- Exception handling: `try/catch` around `await()`; `CoroutineExceptionHandler` only for root `launch`; rethrow `CancellationException`.
- Testing: `runTest` with virtual time; inject `CoroutineDispatcher`s; `StandardTestDispatcher` / `UnconfinedTestDispatcher`.

## Other frameworks

- **Ktor:** plugins (`install(ContentNegotiation)`, `install(Authentication)`), `StatusPages` for error mapping, `testApplication {}` for tests.
- **Micronaut / Quarkus:** compile-time DI; reflection needs explicit registration for native images (GraalVM). Their config files are `application.yml` (Micronaut) and `application.properties` (Quarkus) with profile prefixes.
- **Jackson:** register `jackson-module-kotlin` and `JavaTimeModule` (Spring Boot does this automatically when on the classpath); `FAIL_ON_UNKNOWN_PROPERTIES` — decide consciously for public APIs.
