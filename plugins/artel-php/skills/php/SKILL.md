---
name: php
description: PHP stack pack — Composer, PSR-12/PER, strict_types, PHPStan/Psalm, PHP-CS-Fixer/Pint, PHPUnit/Pest, Laravel and Symfony notes, injection/XSS/CSRF/upload pitfalls, build-error playbook, review checklist. Use when writing, reviewing, testing or fixing PHP code, or when the user says "PHP", "Laravel", "Symfony", "ларавель", "пхп".
paths: "**/*.php, composer.json, composer.lock, phpunit.xml*, phpstan.neon*, psalm.xml*, artisan, symfony.lock"
---
Reply in the user's language.

# PHP

Long material lives next to this file: [frameworks.md](frameworks.md) (Laravel, Symfony, Doctrine), [security.md](security.md), [review-checklist.md](review-checklist.md).

## 1. Detect the project

Read before changing anything — **follow the project's existing conventions over these defaults.**

- `composer.json` — `require.php` (supported PHP range), `config.platform.php` (the version Composer resolves for), `autoload`/`autoload-dev` PSR-4 maps, `scripts` (the project's own `test`, `lint`, `analyse` commands — prefer them).
- `composer.lock` — exact versions; commit it for applications. Libraries usually do not.
- Runtime version: `php -v`, `.php-version`, `.tool-versions`, `Dockerfile` base image, CI matrix. If they disagree with `require.php`, say so.
- Framework: `artisan` + `laravel/framework` → Laravel; `bin/console` + `symfony/*` + `symfony.lock` → Symfony; otherwise plain PHP or another framework.
- Tooling: `phpstan.neon(.dist)` / `psalm.xml`, `.php-cs-fixer(.dist).php` / `pint.json` / `phpcs.xml`, `phpunit.xml(.dist)`, `tests/Pest.php` (Pest), `rector.php`.
- Extensions the app needs: `ext-*` keys in `require`; check with `php -m` and `composer check-platform-reqs`.

## 2. Defaults for new code

- Supported PHP: pick from the project's range; for a new project use a currently supported PHP release (check php.net for active support).
- `declare(strict_types=1);` at the top of every new file.
- Style: PER Coding Style (successor to PSR-12) via PHP-CS-Fixer or Laravel Pint in Laravel projects.
- Static analysis: PHPStan (or Psalm if present) in CI; raise the level gradually and keep a baseline instead of ignoring new errors.
- Tests: PHPUnit; Pest when the project already uses it.
- Autoloading: PSR-4 only; namespace path matches directory path **with exact case** (Linux filesystems are case-sensitive).
- Interfaces from PSR where useful: PSR-3 logger, PSR-7/17/18 HTTP, PSR-11 container, PSR-14 events, PSR-20 clock.

## 3. Idioms and design

1. **Types everywhere** — parameter, return and property types; `?Type` or union types instead of docblock-only types. Use docblock generics (`list<User>`, `array<string, int>`) for what PHP can't express; PHPStan/Psalm read them.
2. **Constructor property promotion** and `readonly` properties/classes for value objects and DTOs.
3. **Enums** (backed enums for persisted values) instead of class constants or magic strings.
4. **`match`** over `switch` — strict comparison, no fallthrough, throws `UnhandledMatchError` on a miss.
5. **Strict comparison** (`===`, `in_array($x, $list, true)`); never rely on loose `==` for security checks.
6. **Null-safe `?->` and `??`** instead of nested `isset` chains — but don't hide a value that must exist; throw instead.
7. **Dependency injection** through constructors; no `new` of services inside business logic, no static service locators, no globals.
8. **Small final classes** by default; inheritance only for real "is-a"; composition otherwise.
9. **Immutability**: return new instances (`withX()`); use `DateTimeImmutable`, never mutable `DateTime` for values passed around. Inject a clock (PSR-20) to test time.
10. **Arrays are not domain objects.** Associative arrays crossing layers become typed DTOs.
11. **No dynamic properties** (deprecated since 8.2) — declare them.
12. **First-class callables** `strlen(...)` and arrow functions `fn ($x) => ...` for short callbacks.
13. Don't commit `vendor/`; install with `composer install` (from the lock), not `composer update`.

## 4. Errors and logging

- Throw specific exceptions (domain exception classes extending `RuntimeException`/`DomainException`/`InvalidArgumentException`); catch only where you can handle or translate them.
- Never `@`-suppress errors; never empty `catch`. Catch `\Throwable` only at the top level (framework handler, worker loop).
- Convert warnings to exceptions where the framework doesn't (frameworks do in dev).
- Log via PSR-3 (Monolog) with context arrays: `$logger->error('Payment failed', ['order_id' => $id])` — not string concatenation, and never passwords, tokens, full card data or personal data.
- Production: `display_errors=Off`, `log_errors=On`, framework debug mode off.

## 5. Testing

- **PHPUnit** — `tests/Unit`, `tests/Feature`/`tests/Integration`; config in `phpunit.xml(.dist)`. Modern PHPUnit uses attributes (`#[Test]`, `#[DataProvider('cases')]`, providers are `public static`).
- **Pest** — `it('...', fn () => ...)`, `expect($x)->toBe(...)`, datasets via `->with([...])`.
- Run all: `vendor/bin/phpunit` · `vendor/bin/pest` · Laravel `php artisan test`.
- Run one: `vendor/bin/phpunit --filter testRefundIsIdempotent` · `vendor/bin/pest --filter "refund"` · `vendor/bin/phpunit tests/Unit/MoneyTest.php`.
- Coverage needs Xdebug or PCOV: `XDEBUG_MODE=coverage vendor/bin/phpunit --coverage-text`.
- Doubles: PHPUnit `createMock`/`createStub`, or Mockery if present. Mock ports you own (interfaces), not framework internals. Prefer fakes for HTTP (`Http::fake()` in Laravel, `MockHttpClient` in Symfony).
- DB tests: run in a transaction or refresh the DB per test (Laravel `RefreshDatabase`, Symfony with a dedicated test DB); never point tests at a shared database.
- Static analysis is part of "tests pass": run `vendor/bin/phpstan analyse` (or `vendor/bin/psalm`) too.

## 6. Security pitfalls

Details and safe patterns: [security.md](security.md).

- **SQL injection** — any string-built query: `"... WHERE id = $id"`, `DB::raw`/`whereRaw`/`orderByRaw` with input, Doctrine DQL/`executeQuery` with concatenation. Use bound parameters (PDO prepared statements, `whereRaw('price > ?', [$min])`, `setParameter`). Column/direction names can't be bound — allowlist them.
- **XSS** — Blade `{{ }}` and Twig `{{ }}` escape; `{!! !!}`, `|raw`, `new HtmlString`, `echo` in plain PHP do not. Plain PHP: `htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')`. Escaping for HTML is not escaping for JS, URLs or attributes without quotes.
- **CSRF** — keep the framework middleware on; `@csrf` in Blade forms, Symfony forms have CSRF on by default. Exceptions (webhooks) must verify a signature instead.
- **Mass assignment** — Laravel `$fillable` allowlist; never `$guarded = []` with `$request->all()`. Use `$request->validated()`.
- **File uploads** — validate size and MIME by content, generate the stored name, store outside the web root or on private storage, never execute or `include` uploads, serve with `Content-Disposition`.
- **`unserialize()` on untrusted data** → object injection. Use `json_decode(..., flags: JSON_THROW_ON_ERROR)`; if unavoidable, `['allowed_classes' => false]`.
- **Command / file injection** — `exec`, `shell_exec`, `system`, `proc_open` with input (use `escapeshellarg` or Symfony Process with an argument array); `include`/`require`/`file_get_contents` with user paths; `extract()`; `eval`; `preg_replace` with `/e` (removed, but watch old code).
- **Crypto** — `password_hash`/`password_verify`; `random_bytes`/`random_int` (not `rand`, `mt_rand`, `uniqid`) for tokens; `hash_equals` for comparing secrets.
- **Secrets** — `.env` in `.gitignore`, `.env.example` committed with empty values. Debug mode off in production (Laravel's error page leaks environment details).
- **Dependencies** — `composer audit` in CI; review `composer.lock` diffs; don't allow untrusted Composer plugins (`config.allow-plugins`).

## 7. Performance pitfalls

- **N+1 queries** in ORM loops — eager-load (`with()` in Eloquent, fetch joins in Doctrine); see [frameworks.md](frameworks.md).
- Loading whole tables: paginate, `chunkById()`/`lazyById()` (Laravel), `toIterable()` (Doctrine) for batch jobs.
- `SELECT *` of wide rows when only an id list is needed — `pluck`, partial selects.
- Missing indexes on foreign keys and filter columns; check with `EXPLAIN`.
- **OPcache** on in production; `composer install --no-dev --optimize-autoloader` (or `--classmap-authoritative`) for deploys.
- Framework caches in production: Laravel `php artisan optimize` (config/route/view cache), Symfony `cache:warmup` with `APP_ENV=prod`.
- Slow work in the request (mail, PDFs, third-party APIs) → queue it.
- Profile before optimising: Xdebug profiler, Blackfire, Laravel Telescope/Debugbar in dev only.

## 8. Build and run errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `Your requirements could not be resolved to an installable set of packages` | Version constraints conflict, or `config.platform.php`/local PHP too old/new | Read the "Problem 1" lines; `composer why-not vendor/pkg 2.0`; widen one constraint or update with `-W` (`composer update vendor/pkg -W`) |
| `... requires php ^8.x but your php version ... does not satisfy` | Runtime PHP differs from what the lock was built for | Use the PHP version the project targets (CI/Docker); align `config.platform.php`; don't `--ignore-platform-reqs` to "fix" it |
| `the requested PHP extension intl is missing` | Extension not installed/enabled | Install it (`php-intl` package, `docker-php-ext-install intl`); check with `php -m` |
| `The lock file is not up to date with the latest changes in composer.json` | `composer.json` edited without updating the lock | `composer update vendor/changed-pkg` (only what changed); commit both files |
| `Class "App\Foo\Bar" not found` | PSR-4 path/namespace mismatch (often case), stale autoloader, file in `autoload-dev` used in prod | Fix the namespace/path; `composer dump-autoload`; move to `autoload` if needed |
| `Allowed memory size of ... exhausted` during Composer | Large dependency resolution | `COMPOSER_MEMORY_LIMIT=-1 composer update ...`; prefer narrower updates |
| `Creation of dynamic property ... is deprecated` | PHP 8.2+ on old code | Declare the property; `#[\AllowDynamicProperties]` only as a stopgap |
| `Typed property ... must not be accessed before initialization` | Property without default never assigned | Initialise in the constructor or give a default/nullable type |
| Laravel `419 Page Expired` | Missing/expired CSRF token, session cookie not sent (domain, HTTPS, `SESSION_DOMAIN`) | Add `@csrf`; check session config and cookie domain |
| Laravel `No application encryption key has been specified` | `APP_KEY` empty | `php artisan key:generate` (local) or set the key in the environment |
| Laravel `env()` returns `null` in production | Config is cached; `.env` is not read after `config:cache` | Call `env()` only in `config/*.php`; use `config('x.y')` in code; re-run `php artisan config:cache` |
| Laravel `Add [field] to fillable property to allow mass assignment` | Field not in `$fillable` | Add it **if** users may set it; otherwise assign explicitly |
| Laravel `Vite manifest not found` | Front-end assets not built | `npm ci && npm run build` (or run the dev server) |
| `SQLSTATE[HY000] [2002] Connection refused` | Wrong DB host (inside Docker use the service name, not `127.0.0.1`), DB not running | Fix `DB_HOST`/`DATABASE_URL`; start the DB |
| `Permission denied` on `storage/` or `var/` | Web/CLI user can't write cache/logs | Give the runtime user write access to `storage`, `bootstrap/cache` (Laravel) or `var/` (Symfony); don't `chmod 777` |
| Symfony `Cannot autowire service ...: argument ... references interface ... but no such service exists` | No implementation aliased, or several | Alias the interface in `services.yaml` or use `#[Autowire]`/`#[AsAlias]`; inspect with `bin/console debug:autowiring` |
| PHPStan errors explode after upgrade | Level or PHPStan major changed | Fix new errors in touched code; regenerate the baseline only with the user's agreement |

## 9. Review checklist

- `strict_types`, full types, no dynamic properties, no `@` suppression.
- No string-built SQL; no unescaped output; CSRF intact; mass assignment allowlisted; uploads validated.
- Queries in loops eager-loaded; heavy work queued.
- New config read through framework config, not `env()` in code (Laravel).
- Tests and static analysis pass; `composer audit` clean; lockfile changes intentional.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **Laravel** — Eloquent eager loading and `preventLazyLoading`, `$fillable`, Form Requests and `validated()`, queues (idempotent jobs, `afterCommit`), config caching and `.env`, Pint, Pest.
- **Symfony** — autowiring and `services.yaml`, Doctrine (fetch joins, migrations, DQL parameters), Twig autoescape, Messenger, secrets vault.

Notes and commands: [frameworks.md](frameworks.md).
