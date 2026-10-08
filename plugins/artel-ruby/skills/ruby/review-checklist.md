# Ruby and Rails review checklist

Use with the `code-reviewer` agent. Report findings as *file:line — problem — fix*, most severe first.

## Correctness
- [ ] Required values via `fetch` (hash, ENV, credentials) so missing ones fail loudly.
- [ ] No bare `rescue`/`rescue Exception`; rescued errors handled or re-raised with context.
- [ ] `Time.current`/`Time.zone` in Rails; UTC in storage; no `Date.today` vs zone mismatches.
- [ ] Money as integer cents or `BigDecimal`.
- [ ] Validations backed by DB constraints (unique index for `validates :uniqueness`, `null: false`, foreign keys).
- [ ] Callbacks don't hide business logic or side effects; side effects run after commit.

## Design
- [ ] Models are not god objects; business processes in service/command objects; complex queries in scopes/query objects.
- [ ] No `method_missing`/monkey-patching/`send` with computed names in app code.
- [ ] Constants and file names follow Zeitwerk; `bin/rails zeitwerk:check` passes.
- [ ] Controllers thin; strong-params method per resource.

## Security
- [ ] No interpolated SQL; sort/filter inputs allowlisted; every `Arel.sql` justified.
- [ ] Strong parameters explicit, no `permit!`, no role/ownership fields permitted; ownership set from `current_user`.
- [ ] Object-level authorisation on member actions (scoped `find` or policy).
- [ ] No `html_safe`/`raw`/`<%==` on user data; user HTML sanitised; user URLs scheme-checked.
- [ ] No `Marshal.load`/`YAML.unsafe_load`/`constantize`/`send` on input; no shell strings with input.
- [ ] Redirects limited to relative paths or allowlisted hosts.
- [ ] CSRF protection intact; webhooks verify signatures.
- [ ] Secrets in credentials/ENV; new sensitive fields in `filter_parameters`; no secrets in cassettes/fixtures.
- [ ] Brakeman and bundler-audit clean.

## Data and performance
- [ ] No N+1 in controllers, views, serializers, mailers (Bullet/`strict_loading` quiet).
- [ ] Large sets with `find_each`/`in_batches`; `exists?`/`pluck` instead of loading records.
- [ ] Indexes for new foreign keys and query columns.
- [ ] Migrations safe for production size: concurrent indexes, no long locks, column removals via `ignored_columns`, backfills separate, reversible.
- [ ] `schema.rb`/`structure.sql` diff matches the migration.

## Jobs
- [ ] Idempotent; retries and discards declared; enqueued after commit.
- [ ] Arguments small and serialisable; deleted-record case handled.
- [ ] Timeouts on external calls.

## Tests and tooling
- [ ] Tests for new behaviour and the fixed bug; edge cases (empty, nil, limits, unicode, time zones).
- [ ] Factories minimal (`build`/`build_stubbed` where possible); no real HTTP (WebMock/VCR).
- [ ] No `sleep`; time frozen with `travel_to`.
- [ ] RuboCop/Standard clean without new disables; `.rubocop_todo.yml` not grown silently.
