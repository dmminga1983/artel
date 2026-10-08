# .NET review checklist — full version

Run first: `dotnet build` (warnings as errors if configured), `dotnet format --verify-no-changes`, `dotnet test`, `dotnet list package --vulnerable --include-transitive`.

## Project and dependencies

- [ ] Settings shared via `Directory.Build.props`; package versions central (`Directory.Packages.props`) if the solution uses CPM.
- [ ] No new package without reason; no prerelease in production code without agreement; lock file updated if used.
- [ ] Target framework and `global.json` changes are intentional.
- [ ] Project references respect the layering (no Domain → Web references).

## Language and design

- [ ] Nullable enabled and warnings fixed honestly; `!` has a justification.
- [ ] Records/immutable types for DTOs and value objects; `IReadOnly*` in public APIs.
- [ ] `IDisposable`/`IAsyncDisposable` disposed with `using`/`await using`; nothing disposes DI-owned objects.
- [ ] String comparisons specify `StringComparison`; parsing/formatting machine data uses invariant culture.
- [ ] `DateTimeOffset`/UTC and `TimeProvider`; no `DateTime.Now` in logic.
- [ ] Analyzer suppressions have justifications.

## Async

- [ ] No `async void` (except event handlers), no `.Result`/`.Wait()`/`GetAwaiter().GetResult()` on incomplete tasks.
- [ ] `CancellationToken` accepted and forwarded to all I/O.
- [ ] `ConfigureAwait(false)` in reusable library code (per project convention).
- [ ] No unobserved fire-and-forget tasks; background work via `BackgroundService`/queues.
- [ ] No `Task.Run` wrapping in request handlers; no `ValueTask` awaited twice.

## DI and configuration

- [ ] Lifetimes correct (no scoped in singleton); background services create scopes.
- [ ] Options bound, validated (`ValidateDataAnnotations`, `ValidateOnStart`).
- [ ] `HttpClient` through `IHttpClientFactory`/typed clients with timeouts and resilience.
- [ ] No secrets in `appsettings*.json`; user-secrets locally, environment/vault in production.

## ASP.NET Core

- [ ] Middleware order correct; authentication before authorization.
- [ ] Fallback authorization policy or explicit `[Authorize]`/`RequireAuthorization` on new endpoints; resource ownership checked.
- [ ] Inputs validated; DTOs used (no entity binding / over-posting).
- [ ] Antiforgery for cookie-authenticated form posts; CORS with explicit origins.
- [ ] Exceptions mapped to problem details; no exception details outside Development.
- [ ] Request size limits and rate limiting on expensive or public endpoints.
- [ ] Redirects use `LocalRedirect`/`IsLocalUrl`; no `Html.Raw` on user content.

## EF Core and data

- [ ] No `FromSqlRaw`/`ExecuteSqlRaw` with concatenated or interpolated input; Dapper/ADO.NET parameterised.
- [ ] No N+1 (projections/`Include`); read-only queries `AsNoTracking`; pagination ordered.
- [ ] Migration added and reviewed for model changes (no accidental drops).
- [ ] `DbContext` not shared across threads; concurrency tokens where needed.
- [ ] Bulk `ExecuteUpdate`/`ExecuteDelete` considered against auditing/interceptor requirements.

## Security (other)

- [ ] No `BinaryFormatter`; Newtonsoft `TypeNameHandling.None` for untrusted input.
- [ ] Paths from users validated against a base directory; `Process.Start` uses `ArgumentList`.
- [ ] `RandomNumberGenerator` for tokens; passwords via Identity's hasher or a vetted library.
- [ ] Data Protection keys persisted for multi-instance deployments.
- [ ] Logs free of secrets and personal data.

## Performance

- [ ] No sync-over-async; no blocking in hot paths.
- [ ] Allocation-heavy code in hot paths reviewed (LINQ, closures, boxing, string concatenation).
- [ ] `JsonSerializerOptions` reused; caching with limits and expirations.
- [ ] Performance claims backed by BenchmarkDotNet or profiler/trace data from Release builds.

## Tests

- [ ] New behaviour and bug fixes covered; theories for edge cases.
- [ ] Integration tests through `WebApplicationFactory`; real database via Testcontainers/SQLite where relational behaviour matters (not EF InMemory).
- [ ] No sleeps; fake `TimeProvider`; tests independent of order, culture and time zone.
