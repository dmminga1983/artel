# Ruby and Rails security — safe patterns

Dangerous form first, safe form second. Run `bundle exec brakeman` after fixes and escalate unclear cases to the `security-auditor` agent.

## SQL injection

```ruby
# Dangerous
User.where("email = '#{params[:email]}'")
Order.order(params[:sort])
Product.select("name, #{params[:extra]}")
User.find_by_sql("SELECT * FROM users WHERE name LIKE '%#{q}%'")
Post.joins("INNER JOIN tags ON tags.name = '#{tag}'")
User.where(params[:conditions])           # string or array from params

# Safe
User.where(email: params[:email])
User.where("created_at > ?", 1.week.ago)
User.where("name LIKE ?", "%#{User.sanitize_sql_like(q)}%")
User.find_by_sql(["SELECT * FROM users WHERE name = ?", name])

SORTABLE = %w[created_at total].freeze
column = SORTABLE.include?(params[:sort]) ? params[:sort] : "created_at"
direction = params[:dir] == "asc" ? :asc : :desc
Order.order(column => direction)
```

Methods that accept raw SQL strings and need review: `where`, `order`, `reorder`, `select`, `pluck`, `group`, `having`, `joins`, `from`, `lock`, `find_by_sql`, `exists?` with a string, `calculate`/`sum` with a string, `connection.execute`, `Arel.sql`. Recent Rails raise on non-attribute arguments to `order`/`pluck` unless wrapped in `Arel.sql` — that wrapper is a review flag.

## Mass assignment

```ruby
# Dangerous
User.create(params[:user].permit!)
current_user.update(params.require(:user).permit(:name, :role))

# Safe
current_user.update(params.require(:user).permit(:name, :email))
order = current_user.orders.build(order_params) # ownership from the session, not params
```

Nested attributes (`accepts_nested_attributes_for`) need `:id` permitted for updates — and the parent scope must prevent attaching other users' children.

## XSS

- `<%= %>` escapes; `raw(x)`, `x.html_safe`, `<%== x %>`, `render html: x`, `content_tag` with `html_safe` content do not.
- `html_safe` doesn't make anything safe — it **marks** a string as already safe. Only call it on strings you built from escaped parts (`safe_join`, `tag` helpers, `format` with `ERB::Util.h` on inputs).
- User rich text: `sanitize(html)` with explicit `tags:`/`attributes:` allowlists, or Action Text.
- Links: `link_to name, user_url` — validate that `user_url` starts with `https://` (or use `URI.parse` and check `scheme`); `javascript:` URLs are not blocked by escaping.
- JSON in views: `json_escape` / `j` helper, or pass data via `data-` attributes; `to_json` output inside `<script>` must be escaped.
- `Content-Security-Policy` via `config/initializers/content_security_policy.rb` as defence in depth.

## Deserialisation, reflection, code loading

```ruby
# Dangerous with untrusted input
Marshal.load(cookies[:cart])
YAML.unsafe_load(params[:config])        # and YAML.load on Psych < 4
params[:type].constantize.new
obj.send(params[:method])

# Safe
JSON.parse(payload)
YAML.safe_load(text, permitted_classes: [Date])
HANDLERS = { "csv" => CsvExport, "pdf" => PdfExport }.freeze
HANDLERS.fetch(params[:type]).new
```

Also review: `eval`, `instance_eval`/`class_eval` with strings, `Object.const_get` with input, `serialize` columns using YAML with broad `permitted_classes`.

## Commands and files

```ruby
# Dangerous
`convert #{path} out.png`
system("tar -xf #{file}")
open(params[:url])               # Kernel#open runs a command if the string starts with "|"
File.read(Rails.root.join("uploads", params[:name]))   # path traversal

# Safe
system("convert", path, "out.png", exception: true)
stdout, status = Open3.capture2("tar", "-xf", file)
URI.parse(url).then { |u| raise ArgumentError unless u.is_a?(URI::HTTPS) }  # then fetch with an HTTP client
base = Rails.root.join("uploads").realpath
target = base.join(File.basename(params[:name])).realpath
raise ActiveRecord::RecordNotFound unless target.to_s.start_with?(base.to_s + File::SEPARATOR)
send_file target
```

SSRF: outbound HTTP to user-supplied URLs needs a host allowlist or private-IP blocking after DNS resolution, timeouts, and no automatic redirects.

## Redirects

- `redirect_to params[:return_to]` → open redirect. Allow only relative paths (`url.start_with?("/") && !url.start_with?("//")`) or a host allowlist. Recent Rails raise `UnsafeRedirectError` for other hosts unless `allow_other_host: true`; don't pass that with user input.

## CSRF, sessions, cookies

- `protect_from_forgery with: :exception` (default in `ActionController::Base`). Don't `skip_forgery_protection` for cookie-authenticated endpoints; webhooks skip it but verify signatures.
- `reset_session` on login; `cookies.encrypted`/`signed` for client-held state; `httponly`, `secure`, `same_site: :lax`.
- `config.force_ssl = true` in production.

## File uploads (Active Storage)

- Validate content type and size (Rails has no built-in Active Storage validators — use the `active_storage_validations` gem or a custom validation); content type is detected from the file content by Marcel, but don't trust the filename.
- Private services by default; serve via signed, expiring URLs; authorise before generating them.
- Image variants process untrusted files with libvips/ImageMagick — keep them patched; avoid SVG unless sanitised.

## Secrets and logging

- Credentials or ENV only; `config/master.key` and `*.key` in `.gitignore`.
- `config.filter_parameters += [:passw, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn]` (new apps ship a similar list) — extend it for new sensitive fields.
- VCR/WebMock cassettes and fixtures must not contain real tokens: `filter_sensitive_data`.

## Dependencies and scanners

```sh
bundle exec brakeman                 # static analysis for Rails (or bin/brakeman)
bundle exec brakeman -w2             # medium+ confidence only
bundle exec bundle-audit check --update   # gem CVEs against ruby-advisory-db
```

- Brakeman false positives go into its ignore file (`brakeman -I` interactive) with a note explaining why — never silence broadly.
- Review `Gemfile.lock` diffs; pin git-sourced gems to a commit (`ref:`), not a branch.
