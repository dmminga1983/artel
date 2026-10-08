# PHP frameworks — notes

Follow the version the project uses: check `composer.lock` for the exact framework version before applying anything below, and prefer the project's existing patterns.

## Laravel

### Project layout and commands

- `php artisan` lists commands; `php artisan about` prints versions, drivers and cache status.
- Tests: `php artisan test`, `php artisan test --filter=OrderTest`, `php artisan test --parallel` (needs `brianium/paratest`).
- Style: `vendor/bin/pint` (fix), `vendor/bin/pint --test` (check only, for CI).
- Recent Laravel versions configure middleware, exceptions and routing in `bootstrap/app.php` instead of `app/Http/Kernel.php`; older apps still have the Kernel. Check which one the project has.

### Eloquent: N+1 and eager loading

```php
// N+1: one query for posts + one per post for the author
foreach (Post::all() as $post) {
    echo $post->author->name;
}

// Eager load
$posts = Post::with(['author', 'comments' => fn ($q) => $q->latest()->limit(5)])->get();

// Already have the models
$posts->load('tags');

// Counts without loading relations
$posts = Post::withCount('comments')->get(); // $post->comments_count
```

Catch lazy loading in development (in `AppServiceProvider::boot()`):

```php
use Illuminate\Database\Eloquent\Model;

Model::preventLazyLoading(! $this->app->isProduction());
// or stricter: also prevents silently discarded attributes and missing attributes
Model::shouldBeStrict(! $this->app->isProduction());
```

Other query hygiene:
- Batch processing: `Model::query()->chunkById(500, fn ($rows) => ...)` or `->lazyById()`; never `->get()` on unbounded tables.
- `exists()` instead of `count() > 0`; `pluck('id')` instead of loading models.
- `$query->toRawSql()` (recent versions) or `DB::enableQueryLog()` / Debugbar / Telescope to see queries.
- Wrap multi-step writes in `DB::transaction(fn () => ...)`.

### Mass assignment

```php
class User extends Model
{
    protected $fillable = ['name', 'email'];   // allowlist — preferred
    // protected $guarded = ['is_admin'];      // denylist — easy to get wrong
}

User::create($request->validated());         // only validated keys
$user->is_admin = $request->boolean('is_admin'); // privileged fields assigned explicitly, after an authorization check
```

Never `User::create($request->all())`, never `$guarded = []` together with request input, never `Model::unguard()` outside seeders.

### Validation

- Use Form Requests (`php artisan make:request StoreOrderRequest`) with `authorize()` and `rules()`; controllers then use `$request->validated()` or `$request->safe()->only([...])`.
- Validate types and bounds, not just presence: `['quantity' => ['required', 'integer', 'min:1', 'max:100']]`.
- Use `Rule::in([...])` / enum rules (`Rule::enum(Status::class)`) for allowlists, `Rule::unique('users')->ignore($user->id)` for updates.
- Files: `['avatar' => ['required', 'file', 'mimes:jpg,png', 'max:2048']]` (max in kilobytes).
- Authorization belongs in policies/gates (`$this->authorize('update', $post)`, `Gate::authorize(...)`), not in validation rules.

### Queues

- Jobs implement `ShouldQueue`; run workers with `php artisan queue:work` under a supervisor (systemd, Supervisor, Horizon for Redis).
- Workers are long-lived: after a deploy run `php artisan queue:restart`, otherwise they keep old code.
- Make jobs **idempotent** (they can run more than once) and set `$tries`, `$backoff`, `$timeout` deliberately; implement `failed()` for cleanup/alerting.
- Pass IDs or models (models are serialized by ID via `SerializesModels`) — never large payloads or closures with state.
- A job dispatched inside a DB transaction can run before the commit: use `->afterCommit()` on the dispatch or the `after_commit` queue connection option.
- `ShouldBeUnique` / `WithoutOverlapping` middleware to avoid duplicate concurrent work.
- In tests: `Queue::fake()` then `Queue::assertPushed(...)`.

### Configuration, `.env`, caching

- `.env` is for local/deploy-time values and must be in `.gitignore`; commit `.env.example` with empty or dummy-shaped placeholders only.
- **`env()` only inside `config/*.php`.** After `php artisan config:cache`, `.env` is not loaded and `env()` elsewhere returns `null`.
- Production deploy: `composer install --no-dev --optimize-autoloader`, then `php artisan optimize` (caches config, routes, views, events) and `php artisan migrate --force` (labelled: changes the production DB — back up first).
- `APP_DEBUG=false` and `APP_ENV=production` in production. The debug error page exposes environment variables and source.
- `APP_KEY` encrypts cookies and encrypted casts; rotating it invalidates sessions and encrypted data (newer versions support `APP_PREVIOUS_KEYS`).

### Blade

- `{{ $value }}` escapes; `{!! $value !!}` does not — only for HTML you produced and sanitised.
- `@csrf` in every POST/PUT/PATCH/DELETE form; `@method('PUT')` for method spoofing.
- Passing data to JS: `@json($data)` / `Js::from($data)` instead of echoing into a `<script>`.

### Other Laravel pitfalls

- Route model binding + policies: binding resolves the model but doesn't authorize it.
- `Storage::disk('public')` files are web-accessible after `php artisan storage:link`; private files go on a non-public disk and are served through a controller that checks access (or temporary signed URLs).
- Signed URLs (`URL::temporarySignedRoute`) for unsubscribe/download links; validate with the `signed` middleware.
- Rate limit login and expensive endpoints (`throttle` middleware, `RateLimiter::for`).

## Symfony

### Commands

- `bin/console list`, `bin/console about`, `bin/console debug:container`, `bin/console debug:autowiring <search>`, `bin/console debug:router`, `bin/console debug:config <bundle>`.
- `bin/console cache:clear` — run with the right `APP_ENV`; in production use `APP_ENV=prod` and `cache:warmup` during deploy.
- MakerBundle (dev): `bin/console make:entity`, `make:controller`, `make:migration`.
- Tests: `vendor/bin/phpunit` (or `bin/phpunit` in older Flex setups); `WebTestCase`/`KernelTestCase`; test env in `.env.test`.

### Dependency injection

- Default `config/services.yaml` enables `autowire` and `autoconfigure` for `src/`. Services are private; inject them, don't fetch from the container.
- Bind interfaces to implementations with an alias, `#[AsAlias]` on the implementation, or `#[Autowire(service: '...')]` on the argument when there are several.
- Scalar config: `#[Autowire('%kernel.project_dir%')]` or `#[Autowire(env: 'SOME_VAR')]`, or `bind:` in `services.yaml`.
- Tagged services: `#[AutoconfigureTag]` / `#[AutowireIterator]` (recent versions) or `!tagged_iterator` in YAML.
- Services are shared (one instance per container): don't keep request state in service properties — important with long-running runtimes (Messenger workers, RoadRunner/FrankenPHP worker mode), where it leaks between requests.

### Doctrine ORM

- Mapping with PHP attributes (`#[ORM\Entity]`, `#[ORM\Column]`) in current projects.
- Migrations: `bin/console make:migration` or `bin/console doctrine:migrations:diff`, **review the generated SQL**, then `bin/console doctrine:migrations:migrate`. Never edit a migration that already ran in production; add a new one.
- `bin/console doctrine:schema:validate` checks mapping vs DB.
- N+1: associations are lazy by default. Use fetch joins in the query:

```php
$qb = $em->createQueryBuilder()
    ->select('p', 'a')
    ->from(Post::class, 'p')
    ->leftJoin('p.author', 'a')
    ->where('p.publishedAt <= :now')
    ->setParameter('now', new \DateTimeImmutable());
```

  Paginating a fetch-joined collection needs `Doctrine\ORM\Tools\Pagination\Paginator`, otherwise `setMaxResults` cuts rows, not entities.
- Large batches: `toIterable()` plus periodic `$em->clear()`; otherwise the identity map grows without bound.
- DQL and native SQL: always `setParameter`; never concatenate input into DQL — DQL injection is real.
- `flush()` once per unit of work, not in loops.

### Twig

- Autoescape is on for `.html.twig`; `|raw` disables it — only for trusted, sanitised HTML.
- Escape strategy follows context: use `|e('js')`, `|e('url')`, `|e('html_attr')` when output goes to those contexts.

### Security component and config

- Forms: CSRF protection is on by default; for hand-written forms use `csrf_token('intent')` and `isCsrfTokenValid()`.
- Access control with `#[IsGranted('ROLE_X')]`, voters for object-level checks.
- Secrets: `.env` holds defaults and is committed in Symfony's convention — so it must **not** contain real secrets; put local overrides in `.env.local` (gitignored) and production secrets in real environment variables or the secrets vault (`bin/console secrets:set NAME`). The vault's decrypt key for prod must never be committed.
- `composer dump-env prod` compiles env files into `.env.local.php` for production.

### Messenger

- Async messages via a transport; run `bin/console messenger:consume async` under a supervisor with limits (time/memory/message count) so workers restart.
- Handlers must be idempotent; configure retry strategy and a failure transport; inspect with `messenger:failed:show`.

## Plain PHP / other frameworks

- PDO: `new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false])`, then `prepare()` + `execute([...])`.
- Sessions: `session_regenerate_id(true)` after login; cookies `Secure`, `HttpOnly`, `SameSite=Lax` or stricter.
- Put only `public/index.php` and assets in the web root; everything else (including `vendor/` and `.env`) outside it.
