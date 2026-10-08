# JavaScript / TypeScript security pitfalls

Untrusted input: request params/body/headers/cookies, URL fragments and query strings, `postMessage` data, third-party API responses, files, and anything in `localStorage`.

## XSS

Frameworks escape text interpolation. These APIs bypass it:

| API | Safe use |
|---|---|
| React `dangerouslySetInnerHTML={{ __html }}` | Only sanitised HTML: `DOMPurify.sanitize(html)`; prefer rendering Markdown to React elements. |
| Vue `v-html` | Sanitised HTML only; never on user content directly. |
| Svelte `{@html ...}` | Same. |
| Angular `[innerHTML]` | Angular sanitises it; `DomSanitizer.bypassSecurityTrustHtml/Url/ResourceUrl` turns that off — only for trusted constants. |
| DOM `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` | Use `textContent` / `createElement`; Trusted Types where supported. |
| `href`, `src`, `formaction` with user URLs | Parse with `new URL(value, base)` and allow only `http:`/`https:` (and `mailto:` if needed). React warns on `javascript:` URLs but do not rely on it. |
| `<a target="_blank">` to user URLs | Browsers now imply `noopener`, but add `rel="noopener noreferrer"` for older ones. |
| Server templates (EJS `<%-`, Handlebars `{{{ }}}`, Pug `!=`) | Use the escaping form (`<%=`, `{{ }}`). |
| JSON embedded in HTML (`<script>window.__DATA__ = ...`) | Serialise with a function that escapes `<`, `>`, `&`, ` `/` ` (frameworks do this for their own state). |

Defence in depth: a Content-Security-Policy without `unsafe-inline`/`unsafe-eval` (nonces or hashes), `HttpOnly` cookies.

## Prototype pollution

```ts
// UNSAFE: deep merge / set-by-path with attacker-controlled keys
merge({}, JSON.parse(body));            // {"__proto__": {"isAdmin": true}}
set(config, req.query.path, req.query.value);

// SAFER
const parsed = schema.parse(JSON.parse(body));    // validate shape, reject unknown keys
const lookup = new Map<string, string>();          // Map for user-keyed data
const dict = Object.create(null) as Record<string, string>;  // no prototype
if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("bad key");
```

- Keep merge/path utilities up to date — many old versions were vulnerable.
- `Object.hasOwn(obj, key)` instead of `key in obj` or `obj[key]` truthiness when checking user keys.
- Node: `node --disable-proto=delete` (or `throw`) hardens against `__proto__` access, if the project's dependencies tolerate it.

## Code execution and injection

- No `eval`, `new Function(...)`, string `setTimeout`/`setInterval`, `vm.runInNewContext` as a "sandbox" (it is not a security boundary).
- Shell: `child_process.exec(\`git log ${branch}\`)` is injectable. Use `execFile("git", ["log", "--", branch])` or `spawn` with an args array and no `shell: true`.
- SQL: parameterised queries or a query builder/ORM. `pg`: `client.query("select * from users where id = $1", [id])`. Prisma: `$queryRaw` tagged template is parameterised; `$queryRawUnsafe` with interpolation is not. Knex/Drizzle/TypeORM: use bindings, not string concatenation in `raw()`.
- NoSQL: reject objects where strings are expected (`{"$ne": null}` in a Mongo login query); validate with a schema.
- Regex: user-supplied patterns or vulnerable patterns (`(a+)+$`) cause ReDoS — bound input length, avoid nested quantifiers.
- Paths: `path.join(base, userInput)` can escape with `..`. Resolve and check: `const p = path.resolve(base, input); if (!p.startsWith(path.resolve(base) + path.sep)) throw ...`.
- Open redirects: `res.redirect(req.query.next)` — allow only relative paths or a host allow-list.

## SSRF

When the server fetches user-provided URLs (webhooks, link previews, image proxies):
1. Parse with `new URL()`; allow `https:` (and `http:` if required) only.
2. Allow-list hosts where possible; otherwise resolve DNS and reject loopback, private (RFC 1918), link-local (includes cloud metadata), and IPv6 equivalents.
3. Pin the connection to the checked IP (custom `lookup` on the agent) to avoid DNS rebinding.
4. `redirect: "manual"` in `fetch` and re-validate each hop.
5. Timeout with `AbortSignal.timeout(ms)` and cap response size.

## Secrets in client bundles

Everything reachable from client code is public, minified or not.

| Framework | Exposed to the browser | Server-only |
|---|---|---|
| Next.js | `NEXT_PUBLIC_*` (inlined at build time) | other `process.env.*` used in server components, route handlers, server actions |
| Vite (React/Vue/Svelte) | `import.meta.env.VITE_*` (prefix configurable via `envPrefix`) | nothing — Vite apps have no server; use a backend |
| SvelteKit | `$env/static/public`, `$env/dynamic/public` (`PUBLIC_` prefix) | `$env/static/private`, `$env/dynamic/private` (only importable in server modules) |
| Nuxt | `runtimeConfig.public` | top-level `runtimeConfig` keys (server only) |
| Create React App (legacy) | `REACT_APP_*` | — |

- In Next.js add `import "server-only"` to modules that read secrets so a client import fails the build.
- Do not widen the prefix (e.g. `envPrefix: ""`) — it exposes every env var.
- Source maps in production can reveal source; upload them to the error tracker instead of serving them publicly, if that matters to the project.

## Server-side frameworks

- **Next.js Server Actions / route handlers** are public endpoints: check session and authorisation inside each one; validate arguments with a schema; do not trust hidden form fields.
- **Express:** `helmet()` for headers; `app.disable("x-powered-by")`; body size limits (`express.json({ limit: "100kb" })`); set `trust proxy` correctly before relying on `req.ip`/`req.secure`; rate-limit auth routes; CSRF protection for cookie-authenticated form posts.
- **CORS:** explicit origin list; never reflect `Origin` with `credentials: true`.
- **Cookies:** `httpOnly`, `secure`, `sameSite: "lax"` or `"strict"`; sign/encrypt session cookies.
- **JWT:** `jwt.verify(token, key, { algorithms: ["RS256"] })` (pin algorithms), check `exp`/`aud`/`iss`; short-lived access tokens; never accept `alg: none`.
- **Passwords:** argon2 or bcrypt; `crypto.timingSafeEqual` for secret comparison; `crypto.randomUUID()` / `crypto.getRandomValues` / `randomBytes` for tokens, never `Math.random()`.
- **Errors:** do not send stack traces to clients in production.

## Supply chain

```bash
npm audit --omit=dev          # production deps only
pnpm audit --prod
yarn npm audit                # Yarn Berry
npm ls <pkg>                  # why is this version installed?
```

- **Lockfile integrity:** commit the lockfile; CI uses `npm ci` / `pnpm install --frozen-lockfile` / `yarn install --immutable` / `bun install --frozen-lockfile`, which fail instead of silently changing the tree. Lockfiles record integrity hashes — review lockfile diffs that change `resolved` URLs to unexpected registries.
- **Install scripts:** `preinstall`/`postinstall` of dependencies run arbitrary code. Recent pnpm blocks them unless allowed; with npm consider `--ignore-scripts` in CI where builds still work, or `ignore-scripts=true` in `.npmrc` plus explicit rebuilds.
- **Dependency confusion:** use a scope for internal packages (`@yourscope/...`) and map that scope to the private registry in `.npmrc` (`@yourscope:registry=<private registry URL>`); never publish internal names unscoped. Optionally reserve the scope on the public registry.
- **Typosquats:** check name, download history, repository link and maintainers before adding a package.
- **Provenance:** prefer packages published with provenance; publish your own with provenance from CI.
- **Pin GitHub Actions** by commit SHA for third-party actions.
