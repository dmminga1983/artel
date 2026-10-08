# Python security pitfalls

Each item: what goes wrong → the safe pattern. Untrusted input means anything from a request, file, queue, environment the user controls, or third-party API.

## Injection

### SQL

```python
# UNSAFE — string building
cur.execute(f"SELECT * FROM users WHERE email = '{email}'")
cur.execute("SELECT * FROM users WHERE email = '%s'" % email)

# SAFE — DB-API parameters (placeholder style depends on the driver: %s, ?, :name)
cur.execute("SELECT * FROM users WHERE email = %s", (email,))

# SAFE — SQLAlchemy
from sqlalchemy import text, select
session.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})
session.execute(select(User).where(User.email == email))

# SAFE — Django
User.objects.filter(email=email)
User.objects.raw("SELECT * FROM app_user WHERE email = %s", [email])
```

- Django `extra()`, `RawSQL`, and `cursor.execute` need the same parameter discipline.
- Column/table names and `ORDER BY` direction cannot be bound — map user choices through a whitelist dict.
- `LIKE` patterns: escape `%` and `_` in user input if they must be literal.

### Shell

```python
# UNSAFE
os.system(f"convert {name} out.png")
subprocess.run(f"git log {branch}", shell=True)

# SAFE — argument list, no shell
subprocess.run(["git", "log", "--", branch], check=True, capture_output=True, text=True, timeout=30)
```

- Put `--` before user-supplied positional arguments so values starting with `-` are not read as options.
- If a shell is unavoidable, `shlex.quote` every interpolated value — and reconsider.

### Code evaluation

- `eval`, `exec`, `compile` on input = remote code execution. Use `ast.literal_eval` for Python literals, `json.loads` for data, a real parser for expressions.
- Template engines: never build a Jinja2 template *from* user input (`Template(user_string)`) — that is server-side template injection. Pass user data as variables. Use `SandboxedEnvironment` if user templates are a product feature.
- Formatting: `user_string.format(**ctx)` lets the user read attributes of objects in `ctx` — avoid formatting user-provided format strings.

## Deserialisation

| Unsafe on untrusted data | Safe alternative |
|---|---|
| `pickle.load(s)`, `shelve`, `marshal`, `dill`, `joblib.load` | JSON, MessagePack, protobuf; sign with HMAC if pickle is used between trusted services. |
| `yaml.load(data)` / `yaml.load(data, Loader=yaml.Loader)` / `yaml.unsafe_load` | `yaml.safe_load(data)` |
| `pandas.read_pickle` | `read_parquet`, `read_csv`, `read_json` |
| `torch.load(path)` on downloaded checkpoints | `torch.load(path, weights_only=True)` (the default in recent PyTorch; keep it explicit), or the `safetensors` format |
| `numpy.load(..., allow_pickle=True)` | keep `allow_pickle=False` (the default) |
| Celery/Kombu with the pickle serializer | JSON serializer and `accept_content=["json"]` |

## Files and paths

```python
from pathlib import Path

BASE = Path("/srv/uploads").resolve()

def safe_path(name: str) -> Path:
    p = (BASE / name).resolve()
    if not p.is_relative_to(BASE):          # Python 3.9+
        raise PermissionError("path escapes upload dir")
    return p
```

- Do not trust `os.path.join(base, user)` — an absolute `user` replaces `base`, and `..` walks out.
- Uploaded file names: generate your own (`uuid4().hex` + validated extension); never reuse the client name as a path.
- `tarfile`: pass `filter="data"` to `extractall`/`extract` (available on 3.12 and backported to security releases of earlier versions); without it, members can write outside the target or create device files.
- `zipfile`: check every member name with the containment check above before extracting.
- Temp files: `tempfile.NamedTemporaryFile` / `mkstemp` / `TemporaryDirectory`, never `tempfile.mktemp` (race).
- Flask: `send_from_directory`, not `send_file` with a joined path. Django: serve user uploads from storage or a separate domain, not through `static`.

## SSRF (server-side request forgery)

When the server fetches a URL the user supplied (webhooks, previews, imports):

1. Allow only `https` (and `http` if needed). Reject `file:`, `gopher:`, etc.
2. Prefer an allow-list of hosts. Otherwise resolve the hostname and reject loopback, private, link-local (cloud metadata lives at a link-local address), multicast and reserved ranges using `ipaddress.ip_address(addr).is_private`, `.is_loopback`, `.is_link_local`, `.is_reserved`.
3. Connect to the IP you checked (or re-check after connect) to avoid DNS rebinding.
4. Disable automatic redirects or re-validate every hop (`follow_redirects=False` in httpx, `allow_redirects=False` in requests).
5. Always set a timeout and a maximum response size.

## Web framework settings

### Django (production)

```python
import os
DEBUG = False
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]                 # fail fast if missing
ALLOWED_HOSTS = os.environ["DJANGO_ALLOWED_HOSTS"].split(",")
CSRF_TRUSTED_ORIGINS = [...]                                  # needed for HTTPS cross-origin form posts
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000                                # after confirming HTTPS works everywhere
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # only behind a proxy that sets it
```

- Run `python manage.py check --deploy` against production settings.
- `DEBUG = True` in production leaks settings, SQL and stack traces.
- Keep `CsrfViewMiddleware`; do not blanket `@csrf_exempt` views.
- Templates autoescape; `mark_safe`, `|safe`, `{% autoescape off %}` only on trusted HTML. Sanitise user HTML with a maintained sanitiser library.
- Use `get_object_or_404(Model, pk=pk, owner=request.user)` — scope queries to the user to prevent IDOR.

### Flask

- Never `app.run(debug=True)` or `FLASK_DEBUG=1` in production: the Werkzeug debugger allows code execution.
- `SECRET_KEY` from the environment; set `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SAMESITE`.
- CSRF protection is not built in — use Flask-WTF or an equivalent for form posts.

### FastAPI

- Validate everything with Pydantic models; set `max_length` and numeric bounds on fields.
- Restrict CORS origins explicitly; never `allow_origins=["*"]` together with credentials.
- Return `response_model` types so internal fields (password hashes) are not serialised.

## Crypto and secrets

- `secrets.token_urlsafe()`, `secrets.choice` for tokens; `random` is predictable.
- Passwords: argon2-cffi, bcrypt, or Django's hashers. Never plain SHA-256/MD5.
- Compare secrets with `hmac.compare_digest`.
- JWT: pin the accepted algorithms when decoding; verify `exp`, `aud`, `iss`.
- TLS: do not set `verify=False` on HTTP clients outside a local test.
- Secrets from environment or a secret manager; `.env` in `.gitignore`, `.env.example` with placeholders committed.

## XML, regex, resources

- Untrusted XML: `defusedxml` (blocks entity expansion and external entities).
- Regex on untrusted input: avoid nested quantifiers like `(a+)+`; bound input length.
- Limit request body size, upload size, decompressed size (zip bombs), and pagination size.

## Dependencies and supply chain

```bash
pip-audit                       # audit the current environment
pip-audit -r requirements.txt   # audit a requirements file
uv run pip-audit                # inside a uv project
```

- Commit the lockfile; install from it in CI (`uv sync --locked`, `poetry install` with an unchanged lock, `pip install -r requirements.txt --require-hashes`).
- Check new package names for typosquats before adding them.
- Use a private index for internal packages with care: configure the tool so internal names resolve only from the internal index (uv supports pinning a package to a named index); otherwise a public package with the same name can win (dependency confusion).
- Bandit (`bandit -r src`) or ruff's `S` (flake8-bandit) rules catch many of the patterns above.
