# PHP security — safe patterns

Each item: the dangerous form, then the safe one. Escalate anything you can't fix safely to the `security-auditor` agent.

## SQL injection

```php
// Dangerous
$pdo->query("SELECT * FROM users WHERE email = '$email'");
DB::select("SELECT * FROM orders WHERE status = '{$request->status}'");
User::whereRaw("name LIKE '%" . $term . "%'")->get();
$em->createQuery("SELECT u FROM App\Entity\User u WHERE u.email = '$email'");

// Safe — bound parameters
$stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email');
$stmt->execute(['email' => $email]);
DB::select('SELECT * FROM orders WHERE status = ?', [$request->status]);
User::where('name', 'like', '%' . addcslashes($term, '%_\\') . '%')->get();
$em->createQuery('SELECT u FROM App\Entity\User u WHERE u.email = :email')->setParameter('email', $email);
```

Identifiers (column names, sort direction, table names) cannot be bound — allowlist them:

```php
$sort = in_array($request->query('sort'), ['created_at', 'total'], true) ? $request->query('sort') : 'created_at';
$dir  = $request->query('dir') === 'asc' ? 'asc' : 'desc';
$query->orderBy($sort, $dir);
```

Watch every `*Raw` method (`selectRaw`, `whereRaw`, `havingRaw`, `orderByRaw`, `DB::raw`) and Doctrine `executeQuery`/`executeStatement` built with concatenation. Set `PDO::ATTR_EMULATE_PREPARES => false` for real server-side prepares where the driver supports it.

## XSS and output escaping

| Context | Blade | Twig | Plain PHP |
|---|---|---|---|
| HTML text | `{{ $x }}` | `{{ x }}` | `htmlspecialchars($x, ENT_QUOTES \| ENT_SUBSTITUTE, 'UTF-8')` |
| Quoted HTML attribute | `{{ $x }}` inside quotes | `{{ x\|e('html_attr') }}` | same as above, always quote attributes |
| JavaScript data | `@json($x)` / `{{ Js::from($x) }}` | a `data-` attribute: `data-config="{{ x\|json_encode }}"`, read with `JSON.parse` in JS | `json_encode($x, JSON_HEX_TAG \| JSON_HEX_AMP \| JSON_HEX_APOS \| JSON_HEX_QUOT)` |
| URL | validate the scheme (`https:` only) before output; `javascript:` URLs survive HTML escaping | `\|e('url')` for components | `rawurlencode()` for components |
| Unescaped (danger) | `{!! $x !!}`, `new HtmlString` | `\|raw` | `echo $x` |

User-supplied rich HTML must go through an HTML sanitiser (for example HTML Purifier or Symfony HtmlSanitizer) before it is rendered raw. Add a Content-Security-Policy header as defence in depth.

## CSRF

- Laravel: CSRF middleware is on for the `web` group; every state-changing form has `@csrf`; AJAX sends the `X-CSRF-TOKEN` / `X-XSRF-TOKEN` header. Exclusions (webhooks) must verify the provider's signature.
- Symfony: form component handles tokens; manual forms use `csrf_token()` / `isCsrfTokenValid()`.
- Never change state on `GET`.
- Session cookies `SameSite=Lax` (or `Strict`) is defence in depth, not a replacement.

## Mass assignment and authorization

- Allowlist with `$fillable`; feed models `validated()` data only.
- Check authorization per object (policies/voters), not just "is logged in" — IDOR (`/invoices/123` of another user) is the most common real bug.

## File uploads

1. Limit size (framework rule + `upload_max_filesize`/`post_max_size` + web server body limit).
2. Check type by content (`finfo` / framework `mimetypes` rule), not by the client extension or `Content-Type` header; allowlist types.
3. Generate the stored file name (`$file->store('avatars')` / `hashName()`); never use `getClientOriginalName()` as a path.
4. Store outside the web root or on a private disk; if public, make sure the server never executes PHP in that directory.
5. Images: re-encode (strip metadata, neutralise polyglots) if feasible; SVG is active content — sanitise or don't accept.
6. Serve downloads through a controller that checks access, with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
7. Archives: guard against path traversal (`../`) and zip bombs when extracting.

## Deserialization

```php
// Dangerous: untrusted data can instantiate arbitrary classes (gadget chains)
$data = unserialize($_COOKIE['cart']);

// Safe
$data = json_decode($_COOKIE['cart'] ?? '[]', true, 512, JSON_THROW_ON_ERROR);
// If serialize format is unavoidable:
$data = unserialize($payload, ['allowed_classes' => false]);
```

Also: signed/encrypted cookies (framework) for client-held state; don't pass user paths to filesystem functions with stream wrappers (`phar://`, `php://`, `data://`).

## Command execution, file paths, SSRF

- Avoid shelling out; if needed, use Symfony Process with an argument array (`new Process(['convert', $in, $out])`) or `escapeshellarg()` for each argument.
- File paths from input: resolve with `realpath()` and check the result is inside an allowed base directory.
- `include`/`require` never take user input.
- Outbound HTTP to user-supplied URLs (webhooks, image fetch): allowlist hosts/schemes, block private and link-local IP ranges after DNS resolution, set timeouts, disable redirects or re-check each hop.

## Authentication and crypto

- `password_hash($pw, PASSWORD_DEFAULT)` + `password_verify()`; `password_needs_rehash()` on login.
- Tokens: `bin2hex(random_bytes(32))`; compare with `hash_equals()`.
- Encryption: use the framework's encrypter or libsodium (`sodium_crypto_secretbox`); never hand-rolled `openssl_encrypt` without authentication.
- `session_regenerate_id(true)` (framework does it) after login; rate-limit login, reset and OTP endpoints.

## Configuration and secrets

- `.env` in `.gitignore`; `.env.example` committed without values; check history for leaked keys before publishing (`/artel:secure-publish`).
- Production: debug off, `display_errors=Off`, `expose_php=Off`, HTTPS with HSTS, secure cookies.
- Never log request bodies wholesale (passwords, tokens); scrub in exception reporters.

## Dependencies

- `composer audit` (checks `composer.lock` against security advisories) — run in CI and before releases; `composer audit --no-dev` for production-only view.
- Review `composer.lock` diffs in PRs; new packages from unknown authors deserve a look at the source.
- `config.allow-plugins` in `composer.json` lists which Composer plugins may run code during install — keep it explicit.
