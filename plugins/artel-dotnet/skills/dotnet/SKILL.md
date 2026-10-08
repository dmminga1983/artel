---
name: dotnet
description: C#/.NET stack guide (brief F#) - SDK-style projects, dotnet CLI, solution layout, nullable reference types, analyzers, async/await pitfalls, DI, ASP.NET Core minimal APIs, middleware and auth, EF Core migrations and N+1, xUnit/NUnit, WebApplicationFactory, security and build-error playbook. Use for any C#/F# code, .csproj/.sln or failing dotnet build. Триггеры - "шарп", "дотнет".
paths: "**/*.cs, **/*.csproj, **/*.fs, **/*.fsproj, **/*.sln, **/*.slnx, **/*.razor, **/*.cshtml, global.json, Directory.Build.props, Directory.Build.targets, Directory.Packages.props, NuGet.config, **/appsettings*.json"
---

Reply in the user's language.

# C# and .NET

Rule zero: **follow the project's existing conventions over these defaults.** Read before you write.

## 1. Detect the project

| Read | To learn |
|---|---|
| `*.sln` / `*.slnx` | projects in the solution and their folders |
| `*.csproj` / `*.fsproj` | `Sdk` (`Microsoft.NET.Sdk`, `.Web`, `.Worker`, `.Razor`), `TargetFramework(s)`, `Nullable`, `ImplicitUsings`, `LangVersion`, package and project references |
| `global.json` | pinned SDK version and roll-forward policy (`dotnet --version` shows the SDK actually selected) |
| `Directory.Build.props` / `.targets` | settings applied to every project (warnings as errors, analyzers, versioning) |
| `Directory.Packages.props` | Central Package Management — versions live here, `PackageReference` items have no `Version` |
| `NuGet.config`, `packages.lock.json` | package sources, lock-file restore |
| `.editorconfig` | code style and analyzer severities |
| `.config/dotnet-tools.json` | local tools (`dotnet-ef`, formatters) — run `dotnet tool restore` |
| `appsettings*.json`, `Properties/launchSettings.json` | configuration, environments, local URLs |
| test projects | xUnit / NUnit / MSTest, mocking library, assertion library |

Run `dotnet --info` to see installed SDKs/runtimes and `dotnet sln list` to list projects.

## 2. Defaults for new code

- **Target framework:** the current LTS (or whatever the solution uses); multi-target libraries only when consumers need it. Check the current supported versions rather than assuming one.
- **Project settings** (prefer `Directory.Build.props`): `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` for new solutions, `<AnalysisLevel>latest-recommended</AnalysisLevel>`, `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>`.
- **Packages:** Central Package Management for multi-project solutions; lock files (`RestorePackagesWithLockFile`) with `dotnet restore --locked-mode` in CI.
- **Layout:** `src/<Project>/`, `tests/<Project>.Tests/`, one solution at the root; references point inward (Web → Application → Domain), never the reverse.
- **CLI:** `dotnet new <template>`, `dotnet sln add <proj>`, `dotnet add <proj> package <id>`, `dotnet add <proj> reference <proj>`, `dotnet build`, `dotnet run --project <proj>`, `dotnet format` (`--verify-no-changes` in CI).
- **Stack:** ASP.NET Core minimal APIs or controllers (match the project), EF Core, `ILogger<T>`, Options pattern, `IHttpClientFactory`, xUnit.
- **Style:** file-scoped namespaces, `var` when the type is obvious, records for immutable data, primary constructors where they read well.

## 3. Idioms and design

1. **Nullable reference types on**; treat warnings as bugs. Use `?` honestly, `required` members or constructors for mandatory data; `!` (null-forgiving) only with a comment proving it.
2. **Immutability:** `record` / `record struct` for values and DTOs, `init` setters, `IReadOnlyList<T>` / `IReadOnlyDictionary` in public signatures.
3. **Dependency injection** through constructors; register in `Program.cs` or extension methods (`services.AddBilling()`). Lifetimes: singleton (stateless, thread-safe), scoped (per request; `DbContext`), transient (lightweight). Never inject scoped services into singletons (captive dependency); in `BackgroundService` create scopes with `IServiceScopeFactory`.
4. **Options pattern:** bind sections to classes (`services.AddOptions<SmtpOptions>().Bind(config.GetSection("Smtp")).ValidateDataAnnotations().ValidateOnStart()`); inject `IOptions<T>` (static), `IOptionsSnapshot<T>` (per request), `IOptionsMonitor<T>` (live reload).
5. **async all the way:** return `Task`/`ValueTask`; suffix `Async`; accept and pass a `CancellationToken` through every I/O call.
   - **No `async void`** except event handlers — exceptions crash the process and can't be awaited.
   - **No `.Result`, `.Wait()`, `GetAwaiter().GetResult()`** on incomplete tasks: deadlocks under a synchronization context (UI, classic ASP.NET) and thread-pool starvation everywhere.
   - **`ConfigureAwait(false)`** in general-purpose library code; unnecessary in ASP.NET Core app code (no synchronization context); keep the context in UI code that touches controls.
   - Don't wrap sync code in `Task.Run` inside ASP.NET Core requests; don't await a `ValueTask` twice; `await using` for `IAsyncDisposable`.
   - Fire-and-forget work goes to a queue or `BackgroundService`, not an unobserved `Task`.
6. **`HttpClient`** via `IHttpClientFactory` or typed clients — never `new HttpClient()` per call (socket exhaustion) nor a static one without `PooledConnectionLifetime` (stale DNS). Add timeouts and resilience (`Microsoft.Extensions.Http.Resilience` or Polly).
7. **`IDisposable`:** `using` declarations; dispose what you create, not what DI gives you.
8. **Pattern matching and switch expressions** over type checks and long if-chains; exhaustive handling for enums with a default that throws.
9. **LINQ** for clarity, not in hot loops; materialise once (`ToList()`) when enumerating multiple times; beware deferred execution with `IQueryable` vs `IEnumerable`.
10. **Strings and culture:** `StringComparison.Ordinal` / `OrdinalIgnoreCase` for identifiers; `CultureInfo.InvariantCulture` for parsing/formatting machine data.
11. **Time:** `DateTimeOffset` / UTC, inject `TimeProvider` for testability.
12. **Exceptions are exceptional:** use `TryParse`/`TryGetValue`; result types for expected domain failures if the project uses them.
13. **Analyzers** (built-in CA rules, plus whatever the project adds) stay green; suppress with `[SuppressMessage(..., Justification = "...")]` or `.editorconfig`, never blanket `#pragma warning disable`.

## 4. Errors and logging

- Throw specific exceptions (`ArgumentNullException.ThrowIfNull(x)`, `ArgumentOutOfRangeException.ThrowIfNegative(n)`); preserve stack traces with `throw;` not `throw ex;`; wrap with `InnerException` when adding context.
- Catch at boundaries only: ASP.NET Core `UseExceptionHandler` + `AddProblemDetails()` (or an `IExceptionHandler` implementation) maps exceptions to RFC 9457 problem responses; never return exception details outside Development.
- `ILogger<T>` with message templates (`logger.LogInformation("Order {OrderId} paid", id)`), not string interpolation; `[LoggerMessage]` source-generated methods for hot paths; scopes for correlation IDs. Use OpenTelemetry if the project does.
- Never log secrets, tokens, connection strings or personal data; check what `ToString()` of records prints (records print all public properties).

## 5. Testing

- **Frameworks:** xUnit (`[Fact]`, `[Theory]` + `[InlineData]`/`[MemberData]`, constructor/`IDisposable` setup, `IClassFixture<T>`, `IAsyncLifetime`) or NUnit (`[Test]`, `[TestCase]`, `[SetUp]`) — match the project. Assertions: built-in, Shouldly, or FluentAssertions (optional; check its licence terms for recent major versions before adding it).
- **Mocks:** NSubstitute or Moq at boundaries (repositories, HTTP, clock). Fake `TimeProvider` for time.
- **ASP.NET Core integration:** `WebApplicationFactory<Program>` (`Microsoft.AspNetCore.Mvc.Testing`) — override services in `WithWebHostBuilder(b => b.ConfigureTestServices(...))`; with top-level statements, older templates need `public partial class Program { }` to make `Program` visible.
- **Databases:** Testcontainers for real SQL Server/PostgreSQL; SQLite in-memory for quick relational tests; avoid the EF Core InMemory provider for anything relational (no constraints, transactions or SQL translation).
- **Commands:**
  - all: `dotnet test` (solution root)
  - one project: `dotnet test tests/Billing.Tests`
  - filter: `dotnet test --filter "FullyQualifiedName~InvoiceTests"` or `--filter "Name=Pays_on_due_date"` / `Category=Integration`
  - detailed output: `dotnet test --logger "console;verbosity=detailed"`
  - coverage: `dotnet test --collect:"XPlat Code Coverage"` (coverlet collector) and a report generator if configured.

## 6. Security pitfalls

- **SQL injection:** EF Core `FromSql` / `ExecuteSql` with an interpolated string are parameterised; `FromSqlRaw` / `ExecuteSqlRaw` with concatenated or interpolated input are **not**. ADO.NET/Dapper: always parameters. Dynamic `OrderBy` from user input needs a whitelist.
- **Secrets:** `dotnet user-secrets init` / `dotnet user-secrets set "Smtp:Password" "<value>"` for local development; environment variables or a vault provider in production. Never commit secrets to `appsettings*.json`.
- **Input validation:** DataAnnotations or FluentValidation on DTOs; `[ApiController]` returns 400 automatically for invalid models; minimal APIs need explicit validation (endpoint filter, a validation library, or the built-in support in newer versions). Bind to DTOs, never to EF entities (over-posting).
- **Anti-forgery:** MVC/Razor Pages form posts need antiforgery validation (`[ValidateAntiForgeryToken]` or the global auto-validate filter; Razor Pages validate by default). Minimal APIs that bind forms use `app.UseAntiforgery()`. Cookie-authenticated APIs called from browsers need CSRF protection too.
- **AuthN/AuthZ:** `UseAuthentication()` before `UseAuthorization()`; set a fallback policy requiring authenticated users so new endpoints are protected by default; resource-based authorisation for object ownership (IDOR).
- **Deserialisation:** never `BinaryFormatter` (removed in modern .NET); no `TypeNameHandling` other than `None` in Newtonsoft.Json for untrusted input; System.Text.Json polymorphism only via `[JsonDerivedType]`.
- **Other:** `Path.Combine` with user input can escape the base directory (validate with `Path.GetFullPath` + prefix check); `Process.Start` with `ArgumentList` not concatenated strings; XSS via `Html.Raw`/`MarkupString`; open redirects (`LocalRedirect`, `Url.IsLocalUrl`); `Random` for tokens (use `RandomNumberGenerator`); HTTPS redirection and HSTS in production; persist Data Protection keys when running multiple instances.
- **Dependencies:** `dotnet list package --vulnerable --include-transitive`; NuGet audit warnings (NU1901–NU1904) during restore — don't suppress them without a reason. `dotnet list package --outdated` for upgrades.

## 7. Performance pitfalls

- **EF Core N+1:** lazy-loading proxies or queries in loops. Use projections (`Select` into DTOs), `Include`/`ThenInclude`, `AsSplitQuery()` against cartesian explosion; log SQL (`LogTo`, or the `Microsoft.EntityFrameworkCore.Database.Command` category) to count queries.
- **Tracking:** `AsNoTracking()` for read-only queries; `ExecuteUpdate`/`ExecuteDelete` for bulk changes; one `SaveChangesAsync` per unit of work, not per item.
- **Sync over async** and blocking calls starve the thread pool — the classic "slow under load, fine locally".
- **Allocations:** `StringBuilder` for loops, `Span<T>`/`ArrayPool<T>` in hot paths, avoid LINQ and closures in tight loops, avoid boxing structs through interfaces.
- **Caching:** `IMemoryCache` / `HybridCache` / output caching where data allows; set size limits and expirations.
- **Serialisation:** System.Text.Json with source generation for hot paths; reuse `JsonSerializerOptions` instances.
- **Measure:** BenchmarkDotNet for micro-benchmarks (Release build), `dotnet-counters`, `dotnet-trace`, `dotnet-dump` for production diagnostics.

## 8. Build and run errors

Run `dotnet build` and read the first error code; `dotnet build -v n` (or `-v d`) for detail. Full playbook: [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| NETSDK1045 current SDK does not support targeting .NET X | SDK too old or `global.json` pins an old one | install the SDK; adjust `global.json` deliberately |
| `global.json` SDK not found | pinned version missing | install it, or change the pin / `rollForward` with the team |
| NU1101 / NU1102 package or version not found | wrong id/version, missing source in `NuGet.config`, private feed auth | fix id/version; add source; authenticate via credential provider/env |
| NU1605 detected package downgrade | transitive needs a higher version than referenced | raise the direct reference (or central version) |
| NU1901–NU1904 vulnerability warnings | known CVE in a package | upgrade the package (transitive: pin the patched version) |
| NETSDK1004 assets file not found | restore didn't run or failed | `dotnet restore` and fix its first error |
| CS0246 type or namespace not found | missing `using`, package or project reference | add the reference/using; check `TargetFramework` compatibility |
| CS8618 / CS8602 / CS8604 nullable warnings | uninitialised non-nullable member, possible null dereference | `required`, constructor init, null checks — not `!` everywhere |
| CS4014 call is not awaited / CS1998 async method lacks await | forgotten `await`, or needless `async` | add `await`; remove `async` and return the task |
| MSB3027 / MSB3021 could not copy, file locked | app still running (or IDE/antivirus) | stop the running process, rebuild |
| NETSDK1147 workload must be installed | MAUI/WASM/Aspire workload missing | `dotnet workload restore` |
| `Unable to resolve service for type` | not registered, or wrong lifetime scope | register it; check interface vs implementation |
| `Cannot consume scoped service from singleton` | captive dependency | make the consumer scoped or create a scope |
| `A second operation was started on this context instance` | `DbContext` used concurrently | await each call; separate contexts per parallel operation (`IDbContextFactory`) |
| `Unable to create a 'DbContext' of type` (dotnet ef) | design-time can't build the context | pass `--project`/`--startup-project`, or add an `IDesignTimeDbContextFactory` |

## 9. Review checklist

- [ ] `dotnet build` clean with warnings as errors; `dotnet format --verify-no-changes` and `dotnet test` pass.
- [ ] Nullable annotations honest; no unjustified `!`.
- [ ] No `async void`, `.Result`, `.Wait()`; `CancellationToken` passed through.
- [ ] DI lifetimes correct; no `new HttpClient()` per call; options validated at startup.
- [ ] Queries parameterised; no `FromSqlRaw` with input; DTOs, not entities, at the boundary.
- [ ] No N+1; read queries `AsNoTracking`; migrations included for model changes.
- [ ] Authorisation by default; anti-forgery on cookie-authenticated form posts; no secrets in config files or logs.
- [ ] `dotnet list package --vulnerable --include-transitive` clean.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **ASP.NET Core:** middleware order matters — exception handler, HSTS, HTTPS redirection, static files, routing, CORS, authentication, authorization, rate limiter, endpoints (check the official order for the project's version). Minimal APIs: `MapGroup` for shared prefixes/filters/auth, `TypedResults` for testable typed responses.
- **EF Core:** migrations with `dotnet ef migrations add <Name>`, apply with `dotnet ef database update` locally; in production prefer `dotnet ef migrations script --idempotent` or migration bundles reviewed in CI over `Database.Migrate()` at startup.
- **Blazor / MAUI / worker services:** follow the template's hosting model; `BackgroundService` for long-running jobs with scoped dependencies created per iteration.
- **F#:** compile order is the file order in `.fsproj`; prefer `Result`/`Option` over exceptions and nulls; `task { }` for .NET interop; Fantomas for formatting; `dotnet fsi` for scripts. Treat values from C# libraries as possibly null.

Details and examples: [frameworks.md](frameworks.md).
