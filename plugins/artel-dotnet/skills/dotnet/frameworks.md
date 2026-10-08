# .NET frameworks — ASP.NET Core, EF Core, testing, F#

Check the target framework first; APIs below exist in current LTS releases, and newer versions add more built-ins.

## ASP.NET Core minimal API skeleton

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddDbContext<AppDb>(o => o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddAuthentication().AddJwtBearer();      // options from configuration section "Authentication:Schemes:Bearer"
builder.Services.AddAuthorization(o =>
{
    o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
});
builder.Services.AddOptions<BillingOptions>()
    .Bind(builder.Configuration.GetSection("Billing"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddHttpClient<PaymentsClient>(c => c.BaseAddress = new Uri("https://payments.example"));

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

var orders = app.MapGroup("/orders");
orders.MapGet("/{id:int}", async Task<Results<Ok<OrderDto>, NotFound>> (int id, AppDb db, CancellationToken ct) =>
{
    var dto = await db.Orders.AsNoTracking()
        .Where(o => o.Id == id)
        .Select(o => new OrderDto(o.Id, o.Total))
        .SingleOrDefaultAsync(ct);
    return dto is null ? TypedResults.NotFound() : TypedResults.Ok(dto);
});
orders.MapGet("/health", () => "ok").AllowAnonymous();

app.Run();

public partial class Program { }   // visible to WebApplicationFactory on older templates
```

Notes:
- `FallbackPolicy` protects every endpoint without explicit metadata; opt out with `AllowAnonymous()`.
- `TypedResults` + `Results<...>` give typed, testable handlers and accurate OpenAPI metadata.
- Endpoint filters (`AddEndpointFilter`) for cross-cutting validation/logging on groups.
- Rate limiting: `builder.Services.AddRateLimiter(...)`, `app.UseRateLimiter()`, `.RequireRateLimiting("policy")`.
- Request size: Kestrel `Limits.MaxRequestBodySize`, `[RequestSizeLimit]` per endpoint; form limits via `FormOptions`.
- Forwarded headers behind a proxy: `UseForwardedHeaders` with explicit `KnownProxies`/`KnownNetworks`, first in the pipeline.

## Middleware order (typical)

1. `UseForwardedHeaders` (behind proxies)
2. `UseExceptionHandler` / developer exception page (Development only)
3. `UseHsts` (non-Development), `UseHttpsRedirection`
4. `UseStaticFiles` / static assets
5. `UseRouting` (implicit in minimal hosting unless you need to position it)
6. `UseCors`
7. `UseAuthentication`, `UseAuthorization`
8. `UseAntiforgery` (when using forms with minimal APIs / Blazor)
9. `UseRateLimiter`, output caching, response compression as configured
10. endpoints (`MapControllers`, `MapGet`, `MapRazorPages`)

## Controllers

- `[ApiController]` gives automatic 400 for invalid models, binding source inference and problem details.
- Keep controllers thin; business logic in services; return `ActionResult<T>`.
- `[Authorize(Policy = "...")]` on controllers/actions; resource-based checks with `IAuthorizationService.AuthorizeAsync(User, resource, requirement)`.
- MVC with views: register `AutoValidateAntiforgeryTokenAttribute` globally or decorate POST actions with `[ValidateAntiForgeryToken]`; tag helpers emit the token in forms.

## Authentication notes

- JWT bearer: validate issuer, audience, lifetime and signing key (defaults validate them — don't turn validation off). Keep clock skew small.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`; sliding expiration consciously.
- ASP.NET Core Identity for local accounts; it hashes passwords with PBKDF2 — never roll your own hashing.
- Data Protection: persist keys (`PersistKeysToFileSystem`, a database or cloud key store) and protect them when running several instances, or cookies/antiforgery tokens break after restarts.

## EF Core

```bash
dotnet ef migrations add AddInvoiceDueDate --project src/Billing.Data --startup-project src/Billing.Web
dotnet ef database update --project src/Billing.Data --startup-project src/Billing.Web     # local DB
dotnet ef migrations script --idempotent --output migrate.sql                              # review/apply in deployment
dotnet ef migrations remove                                                                # only if not yet applied anywhere
```

- Review every generated migration — renames can appear as drop + add (data loss).
- Read paths: `AsNoTracking()`, projections with `Select`, pagination with `Skip/Take` on a deterministic `OrderBy`.
- N+1: avoid lazy-loading proxies in web apps; use `Include`/`ThenInclude` or projections; `AsSplitQuery()` when several collection includes multiply rows.
- Writes: load-modify-`SaveChangesAsync`; bulk changes via `ExecuteUpdateAsync`/`ExecuteDeleteAsync` (bypass change tracking and interceptors — keep in mind for auditing).
- Concurrency: a concurrency token (`[Timestamp]` / `IsRowVersion()` on SQL Server, `xmin`-style on PostgreSQL providers) and handle `DbUpdateConcurrencyException`.
- Raw SQL:

```csharp
// Safe: interpolated values become parameters
var users = await db.Users.FromSql($"SELECT * FROM users WHERE email = {email}").ToListAsync(ct);
await db.Database.ExecuteSqlAsync($"UPDATE users SET locked = TRUE WHERE id = {id}", ct);

// Unsafe: string is built before EF sees it
var bad = db.Users.FromSqlRaw("SELECT * FROM users WHERE email = '" + email + "'");
```

  `FromSqlRaw` is safe only with placeholders and separate parameters (`FromSqlRaw("... WHERE email = {0}", email)`).
- `DbContext` is not thread-safe; one per request (scoped); `AddDbContextPool` for high-throughput apps; `IDbContextFactory<T>` for background/parallel work and Blazor Server.
- Connection resiliency: provider-specific `EnableRetryOnFailure`; wrap user-initiated transactions in the execution strategy.

## Background work

- `BackgroundService` with `ExecuteAsync(CancellationToken stoppingToken)`; create a scope per unit of work for scoped services; catch and log per-iteration exceptions so one failure doesn't stop the loop (an unhandled exception stops the host by default in modern .NET).
- `Channel<T>` for in-process queues; durable work goes to a real queue.

## Testing ASP.NET Core

```csharp
public class OrdersApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task Get_unknown_order_returns_404()
    {
        var client = factory.WithWebHostBuilder(b => b.ConfigureTestServices(s =>
        {
            s.RemoveAll<DbContextOptions<AppDb>>();
            s.AddDbContext<AppDb>(o => o.UseSqlite("DataSource=:memory:"));   // or a Testcontainers connection string
        })).CreateClient();

        var response = await client.GetAsync("/orders/999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

- SQLite `:memory:` databases live only while the connection is open — keep one open connection for the test and call `EnsureCreated()`.
- Authentication in tests: register a test authentication handler in `ConfigureTestServices` rather than disabling authorization.
- Use `TimeProvider` fakes (`Microsoft.Extensions.TimeProvider.Testing`) instead of sleeping.

## F# notes

- Project file order is compile order; a file can only use what is above it.
- Model with discriminated unions and records; `Result<'T, 'E>` and `Option` instead of exceptions and null; pattern match exhaustively (incomplete matches are warnings — treat them as errors).
- `task { }` for interop with .NET async APIs; `async { }` when you need F# async semantics (cold, cancellation passed implicitly).
- ASP.NET Core works directly (minimal APIs) or via Giraffe/Saturn/Falco; EF Core works but idiomatic F# often prefers Dapper or SQL type providers — still with parameters.
- Format with Fantomas; tests with Expecto, xUnit or NUnit (FsUnit/Unquote for assertions).
- Values from C# APIs can be null even when typed as non-null in F#; check at the boundary.
