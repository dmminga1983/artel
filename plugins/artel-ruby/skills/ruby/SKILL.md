---
name: ruby
description: Ruby stack pack — Bundler, Ruby version files, RuboCop/Standard, RSpec/Minitest, factories and fixtures, Rails (N+1, strong params, safe migrations, jobs, credentials), Brakeman/bundler-audit, performance, build-error playbook, review checklist. Use when writing, reviewing, testing or fixing Ruby or Rails code, or when the user says "Ruby", "Rails", "рельсы", "руби".
paths: "**/*.rb, **/*.rake, **/*.erb, Gemfile, Gemfile.lock, *.gemspec, .ruby-version, config.ru, Rakefile"
---
Reply in the user's language.

# Ruby

Long material lives next to this file: [frameworks.md](frameworks.md) (Rails in depth, Sidekiq, Hanami/Sinatra notes), [security.md](security.md), [review-checklist.md](review-checklist.md).

## 1. Detect the project

Read before changing anything — **follow the project's existing conventions over these defaults.**

- Ruby version: `.ruby-version`, `.tool-versions` / `mise.toml`, the `ruby` line in `Gemfile` (may be `ruby file: ".ruby-version"`), `Dockerfile`, CI matrix. Compare with `ruby -v`.
- `Gemfile` + `Gemfile.lock` — gems, groups, and at the bottom of the lock `BUNDLED WITH` (Bundler version) and `PLATFORMS`. Commit the lock for applications; gems (`*.gemspec`) usually don't pin it.
- Framework: `config/application.rb` + `rails` gem → Rails (read `config.load_defaults` for the behaviour level); `config.ru` alone → Rack/Sinatra/Hanami/Roda.
- Binstubs: prefer the project's `bin/rails`, `bin/rspec`, `bin/rubocop`, `bin/dev`, `bin/setup` when present; otherwise `bundle exec <tool>`.
- Tests: `spec/` + `.rspec` → RSpec; `test/` → Minitest. Factories in `spec/factories` (FactoryBot) or fixtures in `test/fixtures`.
- Lint/format: `.rubocop.yml` (and which plugins: `rubocop-rails`, `rubocop-rspec`, `rubocop-performance`, or `rubocop-rails-omakase`), or `.standard.yml` for Standard.
- Jobs: `sidekiq`, `solid_queue`, `good_job`, `resque` in the Gemfile; `config.active_job.queue_adapter`.

## 2. Defaults for new code

- A currently maintained Ruby release (check ruby-lang.org for which branches get security fixes); pin it in `.ruby-version`.
- `# frozen_string_literal: true` magic comment if the project uses it (most RuboCop configs require it).
- Lint/format with RuboCop (or Standard if present); fix with safe autocorrect first.
- Tests with RSpec or Minitest — whichever the project has; Rails defaults to Minitest.
- Data for tests: FactoryBot if present, else fixtures.
- Always run tools through Bundler: `bundle exec` or binstubs.

## 3. Idioms and design

1. **Small objects with one job** — service/command objects (`call`), query objects, form objects; keep models from becoming 2,000-line god classes.
2. **Keyword arguments** for anything beyond one or two positional params; required keywords make call sites self-documenting.
3. **Enumerable over loops** — `map`, `select`, `each_with_object`, `sum`, `group_by`, `partition`, `each_slice`; `filter_map` instead of `map` + `compact`.
4. **Return values, not nil surprises** — `fetch` for required hash keys and ENV (`ENV.fetch("DATABASE_URL")`), `Hash#dig` for optional nested data, safe navigation `&.` only when nil is a legitimate value.
5. **Immutable values** — `Data.define` (Ruby 3.2+) or `Struct` with `keyword_init` for value objects; `freeze` constants.
6. **Pattern matching** (`case/in`) for destructuring structured data (JSON, results).
7. **Explicit over magic** — avoid `method_missing`, `send` with computed names, monkey-patching core classes, and `instance_variable_get` in app code. If you must, use refinements or `public_send` with an allowlist.
8. **Duck typing with clear protocols**; don't `is_a?`-switch across a class hierarchy — use polymorphism.
9. **Blocks for resource handling** — `File.open(path) { |f| ... }`, `ActiveRecord::Base.transaction { ... }`.
10. **Constants and autoloading** — in Rails, file path must match constant name (Zeitwerk): `app/services/billing/refund_order.rb` → `Billing::RefundOrder`.
11. **Time** — `Time.current` / `Time.zone.now` in Rails (not `Time.now`), `Date.current`; store UTC.
12. **Money** — integers in minor units or `BigDecimal`; never `Float`.

## 4. Errors and logging

- Define error classes per domain: `class PaymentDeclined < StandardError; end`. Rescue `StandardError` subclasses — never bare `rescue Exception` (it catches `Interrupt`, `NoMemoryError`, `SignalException`).
- Rescue narrowly and close to where you can handle it; re-raise with context (`raise PaymentError, "...", cause: e` or just `raise` — `cause` is set automatically inside `rescue`).
- `ensure` for cleanup; `retry` only with a counter and backoff.
- Rails: `rescue_from` in controllers for mapping errors to responses; report via `Rails.error.report` / an error tracker.
- Log with structure and tags (`Rails.logger.tagged`, `ActiveSupport::TaggedLogging`, or a JSON logger). Keep secrets out: maintain `config.filter_parameters` (passwords, tokens, keys) — it filters logs and error reports.

## 5. Testing

- **RSpec**: `spec/**/*_spec.rb`; `describe`/`context`/`it`; `let` (lazy) over instance variables; `subject`; `instance_double(Class)` for verified doubles (raise if the method doesn't exist).
  - Run all: `bundle exec rspec`. One file/line: `bundle exec rspec spec/models/order_spec.rb:42`. By name: `bundle exec rspec -e "refunds twice"`. Re-run failures: `--only-failures` (needs `example_status_persistence_file_path` in `spec_helper.rb`).
- **Minitest/Rails**: `bin/rails test`, `bin/rails test test/models/order_test.rb:42`, `bin/rails test -n /refund/`. System tests run separately: `bin/rails test:system` (or `test:all`).
- **Factories vs fixtures** — FactoryBot: `build`/`build_stubbed` by default, `create` only when the DB is needed; traits for variants; avoid deep association chains that create half the database. Fixtures: fast, loaded once per run; keep them minimal and named meaningfully.
- **Isolation** — transactional tests (`use_transactional_fixtures` / Rails default); system tests with a real browser need a shared connection or truncation — follow what the project does.
- **External services** — WebMock/VCR for HTTP (filter secrets from cassettes with `filter_sensitive_data`), `ActiveJob::TestHelper` (`assert_enqueued_with`, `perform_enqueued_jobs`), `ActionMailer` deliveries array.
- **Time** — `travel_to` (Rails) or `freeze_time`; never sleep in tests.
- **Coverage** — SimpleCov, started at the very top of `spec_helper.rb`/`test_helper.rb` before app code loads.

## 6. Security pitfalls

Details and safe patterns: [security.md](security.md).

- **SQL fragments** — `where("email = '#{params[:email]}'")`, `order(params[:sort])`, `find_by_sql`/`pluck`/`select`/`group`/`joins` with interpolated strings. Use hash conditions (`where(email: ...)`), placeholders (`where("total > ?", min)`), `sanitize_sql_like`, and allowlists for sort columns.
- **Mass assignment** — strong parameters (`params.require(:user).permit(...)` or Rails 8 `params.expect(user: [...])`); never `permit!`; don't permit `role`, `admin`, `account_id` from user input.
- **XSS** — ERB `<%= %>` escapes; `raw`, `html_safe`, `<%== %>` and `render html:` do not. Sanitize user HTML with `sanitize`; `link_to` with user URLs can produce `javascript:` links — validate scheme.
- **Unsafe deserialisation / reflection** — `Marshal.load`, `YAML.unsafe_load` (and `YAML.load` on old Psych), `Oj` in object mode on input; `constantize`, `send`, `public_send` with params. Use `JSON.parse`, `YAML.safe_load`, allowlists.
- **Command and file injection** — backticks, `system("cmd #{x}")`, `Kernel#open` with input (a leading `|` runs a command): use `system("cmd", arg)` (array form), `Open3`, `File.open`, `URI.open` only with validated URLs.
- **Redirects** — `redirect_to params[:return_to]` → open redirect; newer Rails raise for other hosts unless `allow_other_host: true` — keep that off for user input.
- **CSRF** — `protect_from_forgery` (on by default in `ActionController::Base`); API-only controllers need token auth instead of cookies.
- **Secrets** — `bin/rails credentials:edit`; `config/master.key` and `config/credentials/*.key` gitignored; production key via `RAILS_MASTER_KEY`.
- **Scanners** — `bundle exec brakeman` (static Rails security scan; newer Rails apps ship `bin/brakeman`) and `bundle exec bundle-audit check --update` (gem CVEs) in CI.

## 7. Performance pitfalls

- **N+1 queries** — `includes`/`preload`/`eager_load`; catch them with `strict_loading` or the Bullet gem in development/test. See [frameworks.md](frameworks.md).
- Iterating big tables with `each` → `find_each`/`in_batches`.
- `count` in loops on loaded associations (`size` uses the loaded collection), `present?`/`any?` loading records instead of `exists?`.
- `pluck(:id)` instead of instantiating models; `select` only needed columns.
- Missing indexes on foreign keys and `where`/`order` columns; counter caches for frequently shown counts.
- Callbacks that do I/O (`after_save` sending mail/HTTP) — move to jobs, enqueue after commit.
- Allocation-heavy hot paths: frozen string literals, avoid building intermediate arrays in tight loops; measure with `benchmark-ips`, `memory_profiler`, `stackprof`, `rack-mini-profiler`.
- YJIT: enabled by default in recent Rails for supported Rubies — check before "optimising" Ruby code by hand.
- Caching (`Rails.cache.fetch` with versioned keys, fragment/Russian-doll caching) only after measuring.

## 8. Build and run errors

| Symptom | Likely cause | Fix |
|---|---|---|
| `Your Ruby version is X, but your Gemfile specified Y` | Wrong Ruby active | Install/activate the version from `.ruby-version` (rbenv, asdf, mise, chruby) |
| `Could not find gem 'x' in locally installed gems` / `Bundler::GemNotFound` | `bundle install` not run, or wrong Ruby/gem path | `bundle install`; check `bundle config` for `path`/`without` |
| `You have already activated x 1.0, but your Gemfile requires x 2.0` | Ran a tool outside Bundler | Use `bundle exec` or the binstub |
| `Gem::Ext::BuildError: ERROR: Failed to build gem native extension` (pg, mysql2, nokogiri, psych) | Missing system headers/libraries | Install the dev packages the log names (e.g. libpq, libyaml, a C compiler); re-run `bundle install` |
| `Your bundle only supports platforms [...] but your local platform is x86_64-linux` | Lock generated on another OS/arch | `bundle lock --add-platform x86_64-linux` (or the CI platform), commit the lock |
| `Bundler could not find compatible versions for gem "x"` | Constraint conflict | Read the dependency chain; `bundle update x --conservative`; relax one constraint deliberately |
| `ActiveRecord::PendingMigrationError` | Migrations not run | `bin/rails db:migrate` (test DB is kept in sync via `maintain_test_schema`) |
| `ActiveSupport::MessageEncryptor::InvalidMessage` on boot | Wrong/missing master key for credentials | Provide the right `RAILS_MASTER_KEY` / key file for that environment; don't regenerate credentials over existing ones |
| `Missing secret_key_base for 'production' environment` | No credentials/`SECRET_KEY_BASE` in prod | Provide via credentials or env var |
| `Zeitwerk::NameError: expected file ... to define constant ...` | File name and constant don't match | Rename file or constant; acronyms need an inflection (`inflect.acronym "API"`); check with `bin/rails zeitwerk:check` |
| `NameError: uninitialized constant Foo` | Typo, wrong namespace, file outside autoload paths, gem not required | Fix namespace/path; add to Gemfile; check `config.autoload_paths` |
| `PG::ConnectionBad` / `could not connect to server` | DB not running or wrong host (Docker service name) | Start DB; fix `DATABASE_URL`/`database.yml` |
| `ActionController::InvalidAuthenticityToken` | Missing CSRF token (custom form/JS fetch), cookies blocked, host/origin mismatch behind a proxy | Use `form_with`/`csrf_meta_tags` and send the token header; check proxy headers |
| `The asset "x" is not present in the asset pipeline` / missing CSS in prod | Assets not precompiled/built | `bin/rails assets:precompile` (with the JS/CSS bundler build if used) |
| RuboCop new offenses after upgrade | New cops enabled | Fix in touched code; regenerate `.rubocop_todo.yml` only with agreement |

## 9. Review checklist

- No interpolated SQL; strong params explicit; no `html_safe`/`raw` on user data; redirects safe.
- No N+1 (check views and serializers); batches for large sets; indexes for new columns.
- Migrations safe for production size; jobs idempotent and enqueued after commit.
- Secrets in credentials/ENV; `filter_parameters` covers new sensitive fields.
- Tests added; RuboCop, Brakeman and bundler-audit clean.

Full list: [review-checklist.md](review-checklist.md).

## 10. Frameworks

- **Rails** — ActiveRecord loading strategies and `strict_loading`, strong parameters, safe migrations (strong_migrations), Active Job/Sidekiq/Solid Queue, credentials, Hotwire/Turbo notes.
- **Sinatra/Roda/Hanami** — Rack basics, `Rack::Protection`, explicit escaping in templates.

Notes and commands: [frameworks.md](frameworks.md).
