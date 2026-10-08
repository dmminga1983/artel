---
name: python
description: Python stack pack — uv/poetry/pdm/pip projects, pyproject, typing (mypy/pyright), ruff, pytest, asyncio, packaging, security pitfalls, ORM N+1, profiling, build-error playbook and review checklist; Django, FastAPI, Flask, Celery, pandas/PyTorch notes. Use when writing, reviewing, testing or fixing Python code. Триггеры - «питон», «ошибка импорта», «виртуальное окружение».
paths: "**/*.py, **/*.pyi, pyproject.toml, setup.py, setup.cfg, requirements*.txt, uv.lock, poetry.lock, pdm.lock, Pipfile, tox.ini, noxfile.py, conftest.py"
---

# Python

Reply in the user's language.

Follow the project's existing conventions over these defaults. Long material lives in reference files:
[build-errors.md](build-errors.md) · [security.md](security.md) · [review-checklist.md](review-checklist.md) · [frameworks.md](frameworks.md).

## 1. Detect the project

Read before writing code:

| Look at | It tells you |
|---|---|
| `uv.lock` / `poetry.lock` / `pdm.lock` / `Pipfile.lock` / only `requirements*.txt` | Package manager: uv / Poetry / PDM / Pipenv / pip. **The lockfile decides** — never mix tools. |
| `pyproject.toml` `[project]`, `[tool.poetry]`, `[build-system]` | Name, deps, `requires-python`, build backend (hatchling, setuptools, poetry-core, pdm-backend, flit). |
| `.python-version`, `requires-python`, CI matrix, `Dockerfile` base image | Target Python version. Do not use syntax newer than the lowest supported version. |
| `[tool.ruff]`, `.flake8`, `[tool.black]`, `[tool.isort]`, `.pre-commit-config.yaml` | Linter and formatter. |
| `[tool.mypy]`, `mypy.ini`, `pyrightconfig.json`, `[tool.pyright]`, `py.typed` | Type checker and strictness. |
| `[tool.pytest.ini_options]`, `pytest.ini`, `conftest.py`, `tox.ini`, `noxfile.py` | Test runner, markers, plugins, async mode. |
| `manage.py`, `settings.py`, `FastAPI(`, `Flask(`, `celery.py` | Framework — then read [frameworks.md](frameworks.md). |
| `src/<pkg>/` vs `<pkg>/` at root | Layout. `src/` means tests run against the installed package. |

Run commands through the project's tool: `uv run pytest`, `poetry run pytest`, `pdm run pytest`, or the activated venv. Prefer `python -m pip` over bare `pip` so the right interpreter is used.

## 2. Defaults for new code

- **Project tool:** uv (`uv init`, `uv add`, `uv sync`, `uv run`) with a committed `uv.lock`. Poetry or PDM are fine if already used.
- **Metadata:** PEP 621 `[project]` table in `pyproject.toml`; `src/` layout for libraries; a `py.typed` marker if the package ships types.
- **Python:** a currently supported CPython release — check the official status page rather than assuming a version.
- **Lint + format:** ruff (`ruff check --fix`, `ruff format`). One tool instead of flake8 + isort + black.
- **Types:** full annotations on public functions; mypy or pyright in CI, strict on new modules.
- **Tests:** pytest, `tests/` mirroring the package, `pytest-cov` for coverage.
- **HTTP client:** `httpx` (sync and async) or `requests`, always with a timeout.
- **Config:** environment variables read once at startup into a typed settings object (e.g. pydantic-settings); `.env` in `.gitignore`, `.env.example` committed.
- **Data classes:** `@dataclass(slots=True, frozen=True)` for plain records; Pydantic at trust boundaries (HTTP, files, queues).

## 3. Idioms and design

1. **Type hints are documentation the checker enforces.** Use `X | None`, `collections.abc` (`Iterable`, `Mapping`, `Callable`) for parameters, concrete types for returns. `Protocol` for duck typing, `TypedDict` for dict-shaped JSON, `Literal`/`Enum` for closed sets. Avoid `Any` leaking out of modules.
2. **No mutable default arguments.** `def f(items: list[str] | None = None)` then `items = items or []` — or better, `if items is None`.
3. **Context managers for every resource:** files, locks, DB sessions, HTTP clients, temp dirs. Write your own with `contextlib.contextmanager`.
4. **`pathlib.Path`** over `os.path` string juggling; always pass `encoding="utf-8"` when opening text files.
5. **Generators for streams.** Iterate lazily (`yield`, generator expressions, `itertools`) instead of building huge lists.
6. **Composition and small functions** over deep inheritance; module-level functions are fine — not everything needs a class.
7. **Explicit imports.** No `from x import *`; no import-time side effects (network, DB, reading env into globals that tests cannot override).
8. **Equality and identity:** `is None`, never `== None`; do not rely on `is` for strings or ints.
9. **Time:** timezone-aware `datetime` (`datetime.now(tz=UTC)` with `from datetime import UTC` on 3.11+, else `timezone.utc`). Naive datetimes are bugs waiting.
10. **Money and exact decimals:** `decimal.Decimal`, never `float`.
11. **Asyncio:** never call blocking code (`requests`, `time.sleep`, sync DB drivers, heavy CPU) inside `async def` — use async libraries or `asyncio.to_thread`. Use `asyncio.TaskGroup` (3.11+) or `gather`; keep a reference to tasks from `create_task`; bound concurrency with `asyncio.Semaphore`; set timeouts (`asyncio.timeout` on 3.11+).
12. **Virtualenv per project.** Never `sudo pip install`; never install into the system interpreter (PEP 668 blocks it on many distros anyway).
13. **Pin in applications, range in libraries.** Apps commit a lockfile; libraries declare compatible ranges and never pin exact versions of dependencies.

## 4. Errors and logging

- Catch the **narrowest** exception you can handle. Never bare `except:`; `except Exception` only at boundaries (request handler, worker loop, CLI main) where you log and convert.
- Re-raise with context: `raise ConfigError("missing DB URL") from err`. Use `from None` only when hiding the cause is deliberate.
- Define a small hierarchy of domain exceptions per package (`class BillingError(Exception)`), not string matching on messages.
- `logger = logging.getLogger(__name__)` per module; configure handlers once in the entry point. Libraries must not call `logging.basicConfig`.
- Lazy formatting: `logger.info("user %s logged in", user_id)` — not f-strings — so the message is built only if emitted and aggregators can group it.
- `logger.exception(...)` inside `except` to include the traceback. Do not log and re-raise the same error at every layer.
- Never log secrets, tokens, passwords, full request bodies or personal data. Use structured logging (JSON) in services.
- `warnings.warn(..., DeprecationWarning, stacklevel=2)` for deprecations; run tests with warnings as errors where the project allows.

## 5. Testing

- **pytest.** Plain `assert`, files `tests/test_*.py`, functions `test_*`.
- **Fixtures** in `conftest.py`; scope (`function`, `module`, `session`) only as wide as safe. Use `yield` fixtures for setup/teardown. Built-ins: `tmp_path`, `monkeypatch`, `capsys`, `caplog`.
- **Parametrize** instead of loops: `@pytest.mark.parametrize("raw, expected", [...], ids=[...])`.
- **Errors:** `with pytest.raises(ValueError, match="must be positive"):`.
- **Patching:** `monkeypatch.setenv`, `monkeypatch.setattr(module, "name", fake)`; with `unittest.mock.patch`, patch **where the name is looked up**, not where it is defined. Prefer fakes and dependency injection over deep mocking.
- **Async:** `pytest-asyncio` (respect the configured `asyncio_mode`) or anyio's pytest plugin — whichever the project uses.
- **HTTP:** mock at the transport level (`respx` for httpx, `responses` for requests) or use the framework test client.
- **DB:** real database in a container or transactional fixture rolled back per test; avoid mocking the ORM.
- **Run one test:** `pytest tests/test_x.py::test_name -x`, by keyword `-k "parse and not slow"`, last failures `--lf`, verbose `-vv`, show prints `-s`.
- **Coverage:** `pytest --cov=<package> --cov-report=term-missing`. Coverage is a guide to untested branches, not a target to game.
- Property-based tests with `hypothesis` for parsers, serialisers and math.

## 6. Security pitfalls

Full list with safe/unsafe snippets: [security.md](security.md).

- **SQL injection:** never build SQL with f-strings, `%` or `+`. Use the ORM, or parameters: DB-API `cursor.execute(sql, params)`, SQLAlchemy `text("... where id = :id")` with bound values, Django `raw(sql, params)`. Identifiers (table/column names) cannot be parameters — whitelist them.
- **Unsafe deserialisation:** `pickle`, `shelve`, `marshal`, `joblib`, `pandas.read_pickle`, `torch.load` without `weights_only=True` all execute code from untrusted input. `yaml.load` → `yaml.safe_load`.
- **Code execution:** no `eval`/`exec` on input; `ast.literal_eval` for Python literals, `json` for data.
- **Shell injection:** `subprocess.run([...], check=True)` with a list; never `shell=True` with user data; never `os.system`. `shlex.quote` only if a shell is truly unavoidable.
- **Path traversal:** resolve and check containment — `(base / name).resolve().is_relative_to(base.resolve())`. Archives: `tarfile` with the `"data"` extraction filter, check `zipfile` member names.
- **SSRF:** for user-supplied URLs, allow-list schemes and hosts, resolve DNS and reject private/loopback/link-local ranges, disable redirects or re-check each hop, set timeouts.
- **XML:** use `defusedxml` for untrusted XML.
- **Randomness:** `secrets` for tokens and passwords, never `random`. Passwords: argon2/bcrypt/scrypt via a vetted library; constant-time compare with `hmac.compare_digest`.
- **Django:** `DEBUG = False` in production; explicit `ALLOWED_HOSTS`; `SECRET_KEY` from the environment, never committed; run `python manage.py check --deploy`. Flask: never run the debugger in production.
- **Templates:** keep autoescape on; `mark_safe` / `|safe` / `Markup` only on trusted content.
- **Dependencies:** `pip-audit` (or `uv run pip-audit`) in CI; commit lockfiles; enable hash checking where the tool supports it.

## 7. Performance pitfalls

- **Measure first.** `python -m cProfile -o out.prof script.py` then inspect with `pstats` or snakeviz; attach to a live process with `py-spy top` / `py-spy record` (no code changes, low overhead). Memory: `tracemalloc`. Import time: `python -X importtime`.
- **ORM N+1:** a query per row in a loop. Django: `select_related` (FK/one-to-one), `prefetch_related` (many). SQLAlchemy: `selectinload` / `joinedload`; consider `lazy="raise"` on relationships to catch it. Count queries in tests (Django `assertNumQueries`).
- **Bulk operations:** `bulk_create`, `executemany`, `COPY`; paginate large querysets (`iterator()`, keyset pagination).
- **Data structures:** `set`/`dict` for membership, `collections.deque` for queues, `"".join(parts)` for building strings, `functools.cache`/`lru_cache` for pure functions.
- **Generators** to stream files and query results instead of loading everything.
- **CPU-bound work:** the GIL limits threads — use `multiprocessing`/`ProcessPoolExecutor`, vectorised NumPy/pandas, or a compiled extension. Threads and asyncio help only for I/O.
- **Pandas:** vectorised ops, not `iterrows`/`apply` over rows; specify `dtype`/`usecols` when reading.
- **Reuse clients:** one `httpx.Client`/`requests.Session`/DB pool per process, not per call.

## 8. Build and run errors

Full table with more cases: [build-errors.md](build-errors.md).

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'x'` | Package not installed in **this** interpreter, venv not active, or wrong tool | `python -c "import sys; print(sys.executable)"`; install with the project's tool (`uv add x`, `poetry add x`); run via `uv run` / `poetry run`. |
| `ModuleNotFoundError` for your own package | `src/` layout not installed, running a file inside the package, missing `__init__.py` with tooling that needs it | Install editable (`uv sync`, `pip install -e .`); run as `python -m pkg.module`. |
| `ImportError: cannot import name 'X' from partially initialized module` | Circular import | Move shared code to a third module, import inside the function, or use `if TYPE_CHECKING:` for type-only imports. |
| `ImportError: cannot import name 'X'` (not circular) | API removed/renamed in a newer dependency version | Check the changelog; pin a compatible range or update the call. |
| Resolver conflict / `ResolutionImpossible` / Poetry "version solving failed" | Two deps require incompatible versions | Read the chain the resolver prints; relax your own constraint or upgrade the dependency that pins; never `--force` past it. |
| `error: externally-managed-environment` | Installing into the system Python (PEP 668) | Create a venv (`uv venv`, `python -m venv .venv`) or use `pipx` for CLI tools. |
| `Failed building wheel for X` / `Python.h: No such file` / `gcc` not found | No prebuilt wheel for this Python/OS, so pip compiles from source | Use a Python version the package ships wheels for; or install compiler and headers (e.g. `python3-dev`, `build-essential`, plus library dev packages). |
| `SyntaxError` on valid-looking code | Running an older Python than the code targets (e.g. `match`, `X \| Y` at runtime) | Check `python --version` against `requires-python`. |
| Works locally, fails in CI | Unlocked deps, different Python, missing env var, test order dependence | Install from the lockfile; match versions; run tests in random order (pytest-randomly) to expose order dependence. |
| `RuntimeWarning: coroutine '...' was never awaited` | Missing `await` | Await it, or schedule with `TaskGroup`/`create_task` and keep the reference. |

## 9. Review checklist

Full checklist: [review-checklist.md](review-checklist.md).

- [ ] Uses the project's package manager; lockfile updated with that tool only.
- [ ] Public functions typed; type checker and `ruff check` pass; no new `# type: ignore` without a reason.
- [ ] No bare `except`, no swallowed errors, `raise ... from` where wrapping.
- [ ] No SQL string building, `pickle`/`yaml.load`/`eval`/`shell=True` on untrusted data.
- [ ] Timeouts on every network call; resources closed by context managers.
- [ ] No blocking calls inside `async def`.
- [ ] No N+1 queries in loops; large data streamed.
- [ ] Secrets only from environment; nothing sensitive logged.
- [ ] Tests cover the change, including error paths; one-test command shown green.

## 10. Frameworks

Details: [frameworks.md](frameworks.md).

- **Django:** fat models/services, thin views; migrations reviewed and committed; `select_related`/`prefetch_related`; settings split by env; `check --deploy`.
- **FastAPI:** Pydantic models at the edge, `Depends` for DB sessions and auth; `async def` only with async I/O, otherwise plain `def`; lifespan for startup/shutdown.
- **Flask:** application factory + blueprints; config from env; extensions initialised in the factory.
- **Celery:** idempotent tasks, pass IDs not objects, JSON serializer, explicit retries with backoff, time limits.
- **Data/ML:** pandas vectorisation and dtypes; PyTorch `model.eval()` + `torch.inference_mode()` for inference, `weights_only=True` loading, seeded runs.
