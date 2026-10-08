# .NET build and run errors — playbook

Get the real error:
- `dotnet --info` — SDKs, runtimes, and which SDK `global.json` selects.
- `dotnet restore` first; most build errors after a fresh clone are restore errors.
- `dotnet build -v n` (normal) or `-v d` (detailed); `dotnet build -bl` writes an `msbuild.binlog` you can open in MSBuild Structured Log Viewer (it can contain environment variables — don't share it publicly).
- Read the first error code. Search the code in the official docs (`NETSDKxxxx`, `NUxxxx`, `CSxxxx`, `MSBxxxx`).

## SDK, target framework, workloads

| Symptom | Cause | Fix |
|---|---|---|
| NETSDK1045 The current .NET SDK does not support targeting .NET X | SDK older than the target framework | install a newer SDK; update `global.json` if it pins an older one |
| `A compatible .NET SDK was not found` / `global.json` requested version not found | pinned SDK not installed | install that SDK, or change `version`/`rollForward` in `global.json` with the team |
| NETSDK1004 Assets file `project.assets.json` not found | restore not run or failed | `dotnet restore` and fix the restore error |
| NETSDK1005 assets file doesn't have a target for `netX` | `TargetFramework` changed after restore | `dotnet restore` again |
| NETSDK1147 workload missing | MAUI, WASM tools, Android/iOS workloads | `dotnet workload restore` (or `dotnet workload install <id>`) |
| `You must install or update .NET to run this application` | runtime missing on the machine running the app | install the runtime, or publish self-contained |
| MSB4019 imported project not found / MSB4236 SDK not found | SDK or MSBuild SDK package missing | install the SDK; check `Sdk="..."` attribute and `global.json` `msbuild-sdks` |
| NETSDK1022 duplicate items included | SDK-style projects include `**/*.cs` by default; old explicit `Compile` items | remove explicit includes or set `EnableDefaultCompileItems` deliberately |
| CS8370 feature not available in C# X | `LangVersion` lower than the feature | upgrade the target framework or `LangVersion` (keep them consistent) |

## NuGet

| Symptom | Cause | Fix |
|---|---|---|
| NU1101 Unable to find package | wrong id, source missing, private feed | check id; `NuGet.config` sources; authenticate (credential provider, env-based PAT — never commit credentials) |
| NU1102 Unable to find package with version | version not published to configured sources | pick an existing version |
| NU1103 only prerelease versions available | stable requested, only prerelease exists | reference the prerelease explicitly if acceptable |
| NU1605 Detected package downgrade | a dependency needs a higher version than your direct reference | raise the direct/central version |
| NU1608 version outside dependency constraint | package declares an upper bound | upgrade the dependent package, or accept after checking compatibility |
| NU1107 version conflict | two packages require incompatible versions | add a direct reference to the version that satisfies both, or upgrade one |
| NU1901–NU1904 package has a known vulnerability (low → critical) | advisory in the package or a transitive one | upgrade; for transitive, reference the patched version directly (CPM: `CentralPackageTransitivePinningEnabled`) |
| NU1004 lock file out of sync with the project (`--locked-mode`) | `packages.lock.json` out of date | `dotnet restore --force-evaluate` locally, review the diff, commit the lock file |
| NU1403 package content hash differs from the lock file | package republished or tampered with, or a different feed served it | do not regenerate blindly: check the package and feed first, then update the lock file deliberately |
| NU1008 projects using CPM should not define version | `Version` on `PackageReference` with Central Package Management | move the version to `Directory.Packages.props` (`PackageVersion`) |
| NU1010 package without `PackageVersion` | CPM on, no central entry | add `<PackageVersion Include="..." Version="..." />` |

## C# compiler

| Code | Meaning | Usual fix |
|---|---|---|
| CS0246 / CS0234 | type or namespace not found | `using`, package or project reference; check the package supports your TFM |
| CS0103 | name does not exist in current context | typo, scope, missing `using static` |
| CS1061 | type has no member / extension method | missing `using` for the extension namespace (e.g. `Microsoft.EntityFrameworkCore` for `Include`) |
| CS0029 / CS0266 | cannot (implicitly) convert | explicit conversion, correct type, `await` a `Task<T>` |
| CS0121 | ambiguous call | cast arguments or qualify the method |
| CS0535 | class does not implement interface member | implement it (IDE quick fix) |
| CS4014 | call not awaited | `await` it; if fire-and-forget is truly intended, use a background queue |
| CS1998 | async method lacks `await` | remove `async` and return `Task.FromResult`/`Task.CompletedTask`, or add the missing await |
| CS8600–CS8604, CS8618, CS8625 | nullable warnings | initialise, mark `?`, use `required`, check for null; `!` only with a proof |
| CS0436 | type conflicts with imported type | duplicate source/linked file or two assemblies with the same type |
| CS7036 | no argument for required parameter | missing constructor argument — often a DI/record change |
| CS9035 | required member must be set | set it in the object initializer |
| CA2007, CA2016, CA1849 and other CA rules | analyzer findings (ConfigureAwait, forward CancellationToken, sync-over-async) | fix the code; adjust severity in `.editorconfig` only with team agreement |

## MSBuild and file system

| Symptom | Cause | Fix |
|---|---|---|
| MSB3027 / MSB3021 unable to copy file, being used by another process | app or test host still running; IDE; antivirus | stop the process (`dotnet build-server shutdown` for compiler servers), rebuild |
| MSB3277 found conflicts between different versions of the same assembly | transitive version conflicts | `dotnet build -v d` to see which; align package versions |
| MSB1011 more than one project or solution file | `dotnet build` in a folder with several | pass the file explicitly |
| `error MSB4018: The "GenerateResource" task failed` on Linux/macOS | Windows-only resource types | check the resources; use `GenerateResourceUsePreserializedResources` with the needed package |
| warnings break CI only | `TreatWarningsAsErrors` set in CI or `Directory.Build.props` | fix warnings; don't remove the setting |

## Runtime (ASP.NET Core, DI, EF Core)

| Symptom | Cause | Fix |
|---|---|---|
| `Unable to resolve service for type 'X' while attempting to activate 'Y'` | not registered; registered as implementation but requested as interface | `builder.Services.AddScoped<IX, X>()` |
| `Cannot consume scoped service 'X' from singleton 'Y'` | captive dependency (scope validation is on in Development) | change lifetimes or use `IServiceScopeFactory` |
| `Cannot resolve scoped service from root provider` | resolving scoped service outside a scope (startup, background service) | `using var scope = sp.CreateScope();` |
| `InvalidOperationException: A second operation was started on this context instance` | concurrent use of one `DbContext` (missing `await`, `Task.WhenAll` over one context) | await sequentially or use `IDbContextFactory<T>` per operation |
| `The entity type 'X' requires a primary key to be defined` | no `Id`/`XId` or `[Key]`/`HasKey` | add a key, or `HasNoKey()` for keyless types |
| `The LINQ expression could not be translated` | method EF can't translate to SQL | rewrite with translatable operations, or switch to client evaluation explicitly after `AsEnumerable()` on a filtered set |
| `Unable to create a 'DbContext' of type ''` (dotnet ef) | design-time host can't build services | `dotnet ef ... --project Data --startup-project Web`, or `IDesignTimeDbContextFactory<T>` |
| `The model for context has pending changes` / `PendingModelChangesWarning` | model changed without a migration | `dotnet ef migrations add <Name>` and review the migration |
| `dotnet ef` not found | tool not installed | `dotnet tool restore` (local manifest) or install `dotnet-ef` as a local tool |
| `Synchronous operations are disallowed` | sync I/O on request/response stream | use async APIs; don't enable `AllowSynchronousIO` as a fix |
| HTTPS dev certificate errors | dev cert not created/trusted | `dotnet dev-certs https --trust` (Windows/macOS; on Linux trust varies by distro) |
| `Failed to bind to address ... address already in use` | port taken | stop the other process or change the URL in `launchSettings.json`/`ASPNETCORE_URLS` |
| 401/403 on every request after adding auth | middleware order, missing scheme, wrong audience/issuer | `UseAuthentication()` before `UseAuthorization()`; check JWT options; enable auth logging in Development |
| CORS errors in the browser only | `UseCors` misplaced or policy too narrow | place `UseCors` after `UseRouting` and before auth; list exact origins |

## Tests

| Symptom | Cause | Fix |
|---|---|---|
| `No test is available` / 0 tests discovered | missing test SDK/adapter packages, or class/method not public | reference `Microsoft.NET.Test.Sdk` and the framework adapter (or use the project's test platform setup) |
| `WebApplicationFactory<Program>`: `Program` is inaccessible | top-level statements generate an internal `Program` on older templates | add `public partial class Program { }` in the web project |
| tests share state / flaky in parallel | static state, shared DB, xUnit parallel collections | isolate data; `[Collection]` for shared fixtures; Testcontainers per collection |
| Testcontainers can't connect to Docker | no Docker in CI | provide Docker or skip integration tests explicitly |
