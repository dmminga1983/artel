# Ruby frameworks — notes

Check the Rails version in `Gemfile.lock` and `config.load_defaults` in `config/application.rb` before applying anything below; behaviour changes between versions. Prefer the project's existing patterns.

## Rails

### Everyday commands

```sh
bin/setup                       # install gems, prepare DB (project-defined)
bin/dev                         # run app + JS/CSS watchers if Procfile.dev exists
bin/rails console               # add --sandbox to roll back all changes on exit
bin/rails routes -g order       # grep routes
bin/rails db:migrate            # run pending migrations
bin/rails db:rollback           # labelled: reverts the last migration (data in dropped columns is lost)
bin/rails db:prepare            # create + migrate (or load schema) as needed
bin/rails zeitwerk:check        # verify autoload naming
bin/rails credentials:edit --environment production
```

### ActiveRecord: N+1 and loading strategies

```ruby
# N+1
Post.limit(20).each { |p| p.author.name }

# preload: separate query per association (default for includes without references)
Post.includes(:author).limit(20)

# eager_load: single LEFT OUTER JOIN — needed when filtering/ordering on the association
Post.eager_load(:author).where(authors: { active: true })

# preload explicitly (never a JOIN)
Post.preload(comments: :user)
```

- `includes` picks `preload` or `eager_load` automatically; it switches to a JOIN when you `references(:authors)` or use a hash condition on the association table.
- Serializers, view partials and `to_json` are where N+1s hide — check them, not just controllers.
- Detect in dev/test:
  - `strict_loading`: per query (`Post.strict_loading`), per model (`self.strict_loading_by_default = true`), per association (`has_many :comments, strict_loading: true`), or app-wide `config.active_record.strict_loading_by_default = true`. Lazy loading then raises (or logs, depending on `config.active_record.action_on_strict_loading_violation`).
  - Bullet gem: enable in `config/environments/development.rb` / `test.rb` and make it raise in tests.
- Counts: `counter_cache: true` on `belongs_to` (plus a column), or `left_joins(:comments).group(:id).select("posts.*, COUNT(comments.id) AS comments_count")`.
- `size` uses a loaded collection or a COUNT; `count` always queries; `length` always loads.
- `exists?` instead of `present?` on relations; `pluck` for raw values; `find_each(batch_size: 1000)` / `in_batches` for large sets.
- `load_async` (Rails 7+) to run independent queries in parallel for a page.

### Strong parameters

```ruby
# Classic
def order_params
  params.require(:order).permit(:note, :delivery_date, line_items_attributes: [:id, :product_id, :quantity, :_destroy])
end

# Rails 8+: raises a 400 (ParameterMissing) instead of 500 on malformed nested input
def order_params
  params.expect(order: [:note, :delivery_date, line_items_attributes: [[:id, :product_id, :quantity, :_destroy]]])
end
```

- In `expect`, an array of hashes is written with double brackets (`[[...]]`).
- Never `permit!`; never permit ownership or role fields (`user_id`, `account_id`, `role`, `admin`) — set them from `current_user` server-side.
- `config.action_controller.action_on_unpermitted_parameters = :raise` in dev/test surfaces typos.

### Migrations safety

Use the `strong_migrations` gem if the project has it; it blocks the dangerous operations below with explanations.

- **Add an index** on a large PostgreSQL table without locking writes:

  ```ruby
  class AddIndexOnOrdersUserId < ActiveRecord::Migration[7.1]
    disable_ddl_transaction!

    def change
      add_index :orders, :user_id, algorithm: :concurrently
    end
  end
  ```

  (Use the migration version that matches the app's Rails.)
- **Add a column with a default**: cheap on PostgreSQL 11+ and recent MySQL for non-volatile defaults; on older engines add without default, backfill, then set default.
- **`NOT NULL` on an existing column**: add a check constraint with `validate: false`, validate it in a separate migration, then change null — avoids a full-table lock (PostgreSQL).
- **Backfill data** in batches in a separate migration or a job (`in_batches.update_all(...)`), not in the schema migration; don't use application models in migrations (they change later) — use SQL or a minimal inline model class.
- **Remove a column**: first deploy `self.ignored_columns += ["legacy_flag"]`, then drop in a later deploy — running processes cache the column list.
- **Rename a column/table**: unsafe with running code; add new → write both → backfill → switch reads → drop old.
- **Change column type**: usually rewrites the table; do it as add-new-column + backfill.
- **Foreign keys**: `add_foreign_key ..., validate: false` then `validate_foreign_key` in a separate migration.
- Keep `db/schema.rb` (or `structure.sql`) in sync and committed; review its diff.
- Data-destroying commands (`db:drop`, `db:reset`, `db:schema:load`) are labelled destructive; never run against production.

### Background jobs

- Active Job on top of an adapter: Solid Queue (DB-backed, default in Rails 8), Sidekiq (Redis), GoodJob (PostgreSQL). Check `config.active_job.queue_adapter`.
- **Idempotent** jobs: they can run twice (retry, crash after side effect). Use unique keys, state checks (`return if order.refunded?`), or DB constraints.
- Pass IDs or GlobalID-serialisable records, not big hashes; a record deleted before the job runs raises `ActiveJob::DeserializationError` — handle with `discard_on`.
- Retries: `retry_on SomeTransientError, wait: :polynomially_longer, attempts: 5`; `discard_on` for permanent errors. (Sidekiq native workers use `sidekiq_options retry:`.)
- Enqueue **after commit** — otherwise the worker may run before the row exists. Use `after_commit` / `after_create_commit` callbacks or check the Active Job setting for enqueuing after transaction commit in your Rails version.
- Long jobs: make them resumable/chunked; set timeouts on HTTP calls inside jobs.
- Scheduled/recurring: `config/recurring.yml` (Solid Queue), sidekiq-cron, or the platform scheduler.
- Tests: `assert_enqueued_with(job: X, args: [...])`, `perform_enqueued_jobs { ... }`, RSpec `have_enqueued_job`.

### Credentials and configuration

- `bin/rails credentials:edit` opens `config/credentials.yml.enc` decrypted with `config/master.key`; per-environment: `config/credentials/production.yml.enc` + `production.key`.
- Keys are gitignored by new apps — verify `.gitignore` before the first push.
- Read with `Rails.application.credentials.dig(:stripe, :secret_key)`; `credentials.fetch(:x)`-style access raises on missing keys (prefer for required values).
- ENV-based config (12-factor) is equally fine — `ENV.fetch("X")` in `config/` so a missing value fails at boot.
- `config/environments/production.rb`: `config.force_ssl = true`, `config.log_level`, `config.hosts` for DNS rebinding protection.

### Views, Hotwire

- ERB escapes by default; `raw`, `html_safe`, `<%==` bypass it.
- `sanitize(html, tags: %w[p a strong em], attributes: %w[href])` for user rich text; Action Text sanitises its own content.
- Turbo Streams broadcast from models (`broadcasts_to`) run on commit — mind N+1 inside broadcast partials and authorisation of stream names (signed stream names via `turbo_stream_from`).

### Authentication and authorisation

- Rails 8 has an authentication generator (`bin/rails generate authentication`); Devise is common in older apps — follow what exists.
- `has_secure_password` (bcrypt) for passwords; rate limiting with `rate_limit` (Rails 7.2+) or Rack::Attack.
- Object-level authorisation (Pundit, Action Policy, CanCanCan, or scoped queries `current_user.orders.find(params[:id])`) on every member action — IDOR is the most common real bug.

## Sidekiq specifics

- Arguments must be JSON-native (strings, numbers, booleans, arrays, hashes with string keys); Sidekiq warns or raises on symbols/objects in strict mode.
- Use `perform_async` after commit; `sidekiq_retries_exhausted` for final failure handling.
- Protect the Web UI behind authentication (`authenticate :user, ->(u) { u.admin? }` in routes or Rack auth).

## Sinatra, Roda, Hanami, plain Rack

- Rack apps get no CSRF/XSS protection by default: use `rack-protection` (Sinatra includes it), `Rack::Csrf` or framework equivalents.
- ERB outside Rails does **not** escape automatically unless configured (e.g. Erubi with `escape: true`, Sinatra `set :erb, escape_html: true`); verify.
- Sequel: use placeholders/datasets (`DB[:users].where(email: email)`), never `DB["... #{x}"]` without placeholders; `Sequel.lit` is the raw-SQL escape hatch to review.
- Hanami: actions are objects with explicit params validation — use `params.valid?`.
