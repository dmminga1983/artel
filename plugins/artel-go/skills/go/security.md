# Go security pitfalls

Untrusted input: request params/body/headers, files, environment set by others, messages from queues, third-party API responses.

## SQL

```go
// UNSAFE
q := fmt.Sprintf("SELECT id FROM users WHERE email = '%s'", email)
rows, err := db.QueryContext(ctx, q)

// SAFE — placeholder syntax depends on the driver:
// MySQL / SQLite: ?      PostgreSQL (pgx, lib/pq): $1, $2 …
row := db.QueryRowContext(ctx, "SELECT id FROM users WHERE email = $1", email)

// Dynamic ORDER BY: whitelist, never interpolate input
cols := map[string]string{"name": "name", "created": "created_at"}
col, ok := cols[r.URL.Query().Get("sort")]
if !ok { col = "created_at" }
query := "SELECT id, name FROM users ORDER BY " + col
```

- GORM: `db.Where("email = ?", email)` is safe; `db.Where(fmt.Sprintf("email = '%s'", email))`, `db.Raw` / `db.Exec` with concatenation, and user input passed as the *first* argument of `Where`/`Order`/`Select` are not.
- sqlc: queries are parameterised by construction; dynamic parts (sorting, optional filters) still need care.
- Always `defer rows.Close()` and check `rows.Err()`.

## Templates

- `html/template` escapes by context (HTML, attribute, JS, CSS, URL). `text/template` escapes nothing — never use it for HTML.
- `template.HTML(s)`, `template.HTMLAttr`, `template.JS`, `template.URL`, `template.CSS` mark content as trusted and turn escaping off. Only use on constants or sanitised output.
- Parse templates once at startup (`template.Must(template.ParseFS(...))`), not per request; never build templates from user input (template injection).
- JSON APIs: `encoding/json` escapes `<`, `>`, `&` in strings by default (`SetEscapeHTML`), which helps when JSON ends up inside HTML.

## Files and paths

```go
// UNSAFE: ".." and absolute paths escape base
p := filepath.Join(baseDir, r.URL.Query().Get("file"))

// SAFE (Go 1.24+): operations confined to a directory, symlinks included
root, err := os.OpenRoot(baseDir)
if err != nil { return err }
defer root.Close()
f, err := root.Open(name)

// SAFE on older versions: reject non-local names first
if !filepath.IsLocal(name) { return errBadPath }  // Go 1.20+
f, err := os.Open(filepath.Join(baseDir, name))   // note: does not stop symlinks inside baseDir
```

- `http.FileServer(http.Dir(dir))` already rejects `..`, but serves dotfiles and directory listings; prefer `http.FileServerFS` with an `fs.FS` that contains only public files, and disable listings if needed.
- Archives (`archive/zip`, `archive/tar`): validate each entry name with `filepath.IsLocal` before writing; cap total extracted size (zip bombs); skip symlink entries unless needed.
- Uploads: generate your own file names; limit size with `http.MaxBytesReader`; sniff content type with `http.DetectContentType` rather than trusting the header.
- Temporary files: `os.CreateTemp`, `os.MkdirTemp`.

## Commands

```go
// UNSAFE
exec.Command("sh", "-c", "convert "+name+" out.png")

// SAFE — no shell; "--" stops option parsing for user values
cmd := exec.CommandContext(ctx, "git", "log", "--", branch)
```

## HTTP servers and clients

```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,  // protects against slow-header (Slowloris) attacks
    ReadTimeout:       15 * time.Second,
    WriteTimeout:      30 * time.Second, // streaming handlers may need per-request deadlines instead
    IdleTimeout:       60 * time.Second,
    MaxHeaderBytes:    1 << 20,
}

client := &http.Client{Timeout: 10 * time.Second} // http.DefaultClient has no timeout
```

- `http.ListenAndServe(addr, h)` creates a server with **no timeouts** — use an explicit `http.Server`.
- Limit request bodies: `r.Body = http.MaxBytesReader(w, r.Body, 1<<20)`.
- `json.NewDecoder(r.Body)` + `DisallowUnknownFields()` when strict input is wanted; validate values after decoding.
- Per-request deadlines for outbound calls: `ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)`.
- Always `defer resp.Body.Close()`; drain before closing if you want the connection reused.
- TLS: never `InsecureSkipVerify: true` outside tests; set a minimum TLS version per your policy.
- Cookies: `HttpOnly`, `Secure`, `SameSite`; sign/encrypt session data.
- CSRF: cookie-authenticated form endpoints need protection (recent Go versions include `http.CrossOriginProtection`; otherwise a middleware).
- Behind a proxy: do not trust `X-Forwarded-For` unless the proxy is the only ingress.

## SSRF

When fetching user-supplied URLs, check the IP **at dial time** so redirects and DNS rebinding are covered:

```go
dialer := &net.Dialer{
    Timeout: 5 * time.Second,
    Control: func(network, address string, _ syscall.RawConn) error {
        host, _, err := net.SplitHostPort(address)
        if err != nil { return err }
        ip, err := netip.ParseAddr(host)
        if err != nil { return err }
        ip = ip.Unmap() // treat IPv4-mapped IPv6 addresses as IPv4
        if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
            ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
            return errors.New("destination not allowed")
        }
        return nil
    },
}
client := &http.Client{
    Timeout:   10 * time.Second,
    Transport: &http.Transport{DialContext: dialer.DialContext, Proxy: nil},
}
```

Also allow-list URL schemes (`https`), cap response size with `io.LimitReader`, and limit redirects via `CheckRedirect`.

## Crypto and secrets

- Tokens and keys: `crypto/rand` (`rand.Read`, or `rand.Text()` on versions that have it). `math/rand` and `math/rand/v2` are not for security.
- Compare secrets with `subtle.ConstantTimeCompare`.
- Passwords: `golang.org/x/crypto/bcrypt` or argon2 (`golang.org/x/crypto/argon2`).
- Do not write your own crypto; use `crypto/aes` + `cipher.NewGCM` with random nonces, or higher-level libraries.
- JWT libraries: pin the expected signing method when parsing; validate `exp`, `aud`, `iss`.
- Secrets from env or a secret manager; never compiled in via `-ldflags -X` for anything sensitive.

## Debug endpoints

- `import _ "net/http/pprof"` registers handlers on `http.DefaultServeMux`. If the public server also uses the default mux, profiles (and heap contents) are exposed. Serve pprof on a separate, internal-only listener with its own mux.
- `expvar` has the same default-mux behaviour.

## Concurrency as a security issue

- Data races can corrupt auth state or leak data between requests — run `go test -race` and fix every report.
- Unbounded goroutines per request are a DoS vector — bound them.

## Dependencies

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...          # source mode: reports vulnerabilities in code paths you actually call
govulncheck -mode=binary ./bin/app
go list -m -u all          # available updates
```

- Commit `go.sum`; the checksum database verifies public modules on download.
- `GOPRIVATE` / `GONOSUMDB` for private modules so their paths are not leaked to the public proxy/checksum DB.
- Review new dependencies (maintenance, transitive count). `go mod why -m <module>` explains why one is present.
- gosec (via golangci-lint) catches many patterns above; triage, do not blanket-disable.
