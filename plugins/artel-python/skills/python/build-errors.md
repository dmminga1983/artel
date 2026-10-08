# Python build and run errors

Read the **first** traceback frame that points into the project, and the first resolver message — later errors are usually consequences.

## First checks

```bash
python --version                                  # which Python?
python -c "import sys; print(sys.executable)"     # which interpreter is actually running?
python -m pip --version                           # which pip, for which interpreter?
python -m pip show <package>                      # is it installed here, which version?
uv tree        # or: poetry show --tree / pdm list --tree / python -m pipdeptree
```

If `sys.executable` is not inside the project venv (`.venv/bin/python`, or the path printed by `poetry env info --path`), the venv is not active: activate it (`source .venv/bin/activate`, Windows `.venv\Scripts\activate`) or run through the tool (`uv run …`, `poetry run …`, `pdm run …`).

## Imports

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError: No module named 'x'` | Installed in a different interpreter; venv not active; package is an optional extra | Check `sys.executable`; install with the project tool; add the extra (`pkg[extra]`). |
| Distribution name ≠ import name | e.g. installing `PyYAML` imports `yaml`, `Pillow` imports `PIL`, `scikit-learn` imports `sklearn`, `beautifulsoup4` imports `bs4` | Install the distribution name, import the module name. |
| `ModuleNotFoundError` for the project's own package | `src/` layout but package not installed; running `python pkg/sub/mod.py` directly; tests run from the wrong directory | `uv sync` / `pip install -e .`; run `python -m pkg.sub.mod`; configure `pythonpath`/`testpaths` in pytest config only if the project already does. |
| `ImportError: attempted relative import with no known parent package` | Running a module inside a package as a script | `python -m package.module`. |
| `ImportError: cannot import name 'X' from partially initialized module 'a'` | Circular import between `a` and `b` | Extract shared pieces to a new module; import lazily inside the function; type-only imports under `if TYPE_CHECKING:` with `from __future__ import annotations`. |
| A local file shadows a library (`random.py`, `email.py`, `requests.py`, `test.py`) | Your module name hides the stdlib/dependency | Rename the file and delete stale `__pycache__`. |
| `AttributeError: module 'x' has no attribute 'y'` | Shadowing as above, or API changed between versions | Print `x.__file__`; check the dependency changelog. |

## Dependency resolution

| Symptom | Likely cause | Fix |
|---|---|---|
| pip `ResolutionImpossible`, uv "No solution found", Poetry "version solving failed" | Incompatible constraints somewhere in the tree | Read the full chain printed; loosen the project's own constraint, upgrade the package that pins too tightly, or pick a different version of the top-level dep. Do not force-install. |
| `requires-python` conflicts | A dependency requires a newer/older Python than the project declares | Raise `requires-python` deliberately, or choose a dependency version that supports the range. |
| Lockfile out of date (`uv lock --check` fails, Poetry says `pyproject.toml changed significantly`) | `pyproject.toml` edited without relocking | `uv lock` / `poetry lock` / `pdm lock` with the project's tool, commit the lockfile. |
| Hash mismatch with `--require-hashes` | Requirements regenerated on a different platform, or a package was re-published | Regenerate hashes with the same tool (`pip-compile --generate-hashes`, `uv pip compile --generate-hashes`); investigate before trusting a changed hash. |
| `pip` warns "dependency conflicts" after install but proceeds | pip installed something that breaks another package's constraint | Fix the constraint; `python -m pip check` lists broken requirements. |

## Environment

| Symptom | Likely cause | Fix |
|---|---|---|
| `error: externally-managed-environment` | PEP 668: system Python is managed by the OS | Use a venv; `pipx install` for CLI tools; never `--break-system-packages` on a real system. |
| `Permission denied` installing packages | Installing into a system location | Venv; never `sudo pip`. |
| `python: command not found` / `python` is Python 2 | Only `python3` on PATH | Use `python3`, or the venv's `python`; uv can install and select an interpreter (`uv python install`, `.python-version`). |
| Different behaviour in IDE vs terminal | IDE uses another interpreter | Point the IDE at `.venv`. |
| Env var missing at runtime (`KeyError: 'DATABASE_URL'`) | `.env` not loaded, or not provided in CI/container | Load `.env` explicitly in development; set it in CI secrets/container env; fail at startup with a clear message. |

## Native builds (C extensions)

| Symptom | Likely cause | Fix |
|---|---|---|
| `Failed building wheel for X`, `error: Microsoft Visual C++ 14.0 or greater is required`, `gcc: command not found` | No prebuilt wheel for this Python version / OS / CPU, so the source distribution is compiled | Prefer a Python version and platform the project ships wheels for (check its files on PyPI); else install a compiler. |
| `fatal error: Python.h: No such file or directory` | Python headers missing | Debian/Ubuntu: `python3-dev`; Fedora: `python3-devel`. |
| `pg_config executable not found` (psycopg2) | PostgreSQL client headers missing | Install `libpq-dev`/`postgresql-devel`, or use psycopg 3 with its binary extra, or `psycopg2-binary` for development only. |
| `error: can't find Rust compiler` | Package with Rust extension, no wheel available | Use a version with wheels for your platform, or install Rust via the official installer. |
| Works on x86, fails on ARM or Alpine | No wheels for that architecture / musl | Use a glibc-based image (`python:<ver>-slim`) or build deps in the image. |

## Runtime

| Symptom | Likely cause | Fix |
|---|---|---|
| `SyntaxError` on `match`, `X \| Y`, `except*`, PEP 695 generics | Running an older interpreter | Check version against `requires-python`. |
| `TypeError: 'type' object is not subscriptable` (`list[int]` at runtime) | Python older than the syntax used | `from __future__ import annotations` for annotations only, or `typing.List` on very old versions. |
| `RuntimeWarning: coroutine ... was never awaited` | Missing `await` | Add `await` or schedule properly. |
| `RuntimeError: This event loop is already running` / `asyncio.run() cannot be called from a running event loop` | Nested `asyncio.run` (e.g. in Jupyter or inside async code) | `await` the coroutine directly; in notebooks use top-level `await`. |
| `RuntimeError: Task got Future attached to a different loop` | Objects created on one loop used on another (often module-level clients in tests) | Create clients inside the running loop; align pytest-asyncio loop scope with fixture scope. |
| `UnicodeDecodeError` / `UnicodeEncodeError` | Default encoding differs by OS/locale | Pass `encoding="utf-8"` explicitly; Python's UTF-8 mode (`PYTHONUTF8=1`) for legacy code. |
| `RecursionError` | Unbounded recursion, often `__getattr__` or property calling itself | Fix the recursion; do not just raise the limit. |
| Tests pass alone, fail together | Shared state, module-level singletons, unreset monkeypatches, order dependence | Isolate with fixtures; run in random order to reproduce. |

## Type checker

| Symptom | Fix |
|---|---|
| `error: Skipping analyzing "x": module is installed, but missing library stubs or py.typed marker` | Install `types-x` stubs if they exist; otherwise a per-module `ignore_missing_imports` override with a comment. |
| `Incompatible types in assignment (expression has type "X \| None" ...)` | Narrow with `if x is None: ...` / early return; do not cast it away. |
| mypy and pyright disagree | Follow the checker the project's CI runs. |
