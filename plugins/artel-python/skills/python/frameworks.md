# Python frameworks

Detect the framework from dependencies and entry points, then follow the project's structure. These notes cover what senior engineers watch for.

## Django

**Detect:** `manage.py`, `settings.py` (or a `settings/` package), `INSTALLED_APPS`, `urls.py`.

- **Structure:** one app per bounded area; business logic in models/managers or a `services.py` layer, views thin. Avoid putting logic in signals — they hide control flow.
- **Settings:** split by environment (`base`, `dev`, `prod`) or read everything from env vars. Production: `DEBUG = False`, `ALLOWED_HOSTS`, `SECRET_KEY` from env, secure cookie flags; run `python manage.py check --deploy`.
- **ORM:**
  - N+1: `select_related("author")` for FK/one-to-one, `prefetch_related("tags")` for many-to-many and reverse FK; `Prefetch(...)` objects for filtered prefetches.
  - `only()` / `defer()` / `values()` for wide tables; `iterator()` for large exports.
  - `exists()` instead of `count() > 0`; `update()` / `bulk_create()` / `bulk_update()` for batches.
  - `F()` expressions for atomic increments; `select_for_update()` inside `transaction.atomic()` for row locks.
  - Wrap multi-write operations in `transaction.atomic()`; use `transaction.on_commit` to enqueue tasks only after commit.
- **Migrations:** always commit them; review generated SQL with `sqlmigrate`; on big tables avoid operations that rewrite or lock the table during traffic; separate schema and data migrations.
- **Security:** keep CSRF middleware; scope querysets by owner (`get_object_or_404(Order, pk=pk, user=request.user)`); autoescape on; `raw()` with params only.
- **Async:** async views exist, but the ORM's async API wraps sync code; do not mix sync ORM calls inside async views without `sync_to_async`.
- **DRF:** serializers validate input; set `permission_classes` explicitly (and a safe default in settings); paginate list endpoints; watch N+1 in nested serializers — fix with `select_related`/`prefetch_related` in `get_queryset`.
- **Tests:** `pytest-django` (`@pytest.mark.django_db`, `client`, `django_assert_num_queries`) or `django.test.TestCase`; factories (factory_boy) over fixtures JSON.
- **Run one test:** `pytest app/tests/test_x.py::test_name` or `python manage.py test app.tests.test_x.TestCase.test_name`.

## FastAPI

**Detect:** `FastAPI()` in the code, `fastapi` in deps, `uvicorn` as server.

- **Models:** Pydantic models for requests and responses; `response_model` (or return type annotation) controls what is serialised — never return ORM objects with secret fields without it. In Pydantic v2 use `model_validate` / `model_dump`, `ConfigDict(from_attributes=True)` for ORM objects.
- **Dependencies:** `Depends` for DB sessions (yield dependency that closes the session), current user, settings; override with `app.dependency_overrides` in tests.
- **Sync vs async:** `async def` endpoints run on the event loop — any blocking call stalls every request. If the code uses sync libraries, declare the endpoint with plain `def` (FastAPI runs it in a threadpool) or move work to `asyncio.to_thread`.
- **Lifespan:** create shared clients and pools in the `lifespan` context manager, not at import time.
- **Errors:** raise `HTTPException` for expected client errors; register exception handlers for domain errors; do not leak stack traces.
- **Background work:** `BackgroundTasks` is for small, best-effort work in the same process; use a queue (Celery, RQ, arq, etc.) for anything that must survive restarts.
- **Security:** explicit CORS origins; auth via dependencies (`OAuth2PasswordBearer`, API key header) applied at router level; field limits in models.
- **Tests:** `fastapi.testclient.TestClient` for sync tests; for async tests `httpx.AsyncClient` with `httpx.ASGITransport(app=app)`.
- **SQLAlchemy 2.x:** `select()` style, `AsyncSession` with an async driver only in async code; `expire_on_commit=False` is common for API responses; eager-load relationships needed in the response (`selectinload`) — lazy loads fail or block in async.

## Flask

**Detect:** `Flask(__name__)`, `create_app`, `flask` in deps.

- Application factory `create_app(config)` + blueprints; extensions (`db = SQLAlchemy()`) created at module level and `init_app` in the factory.
- Config from environment (`app.config.from_prefixed_env()` or explicit reads); `SECRET_KEY` required.
- Run dev server with `flask --app <module> run --debug`; production behind a WSGI server (gunicorn, waitress), never the debug server.
- `g` and `current_app` are request/app-context bound — do not use them in background threads without pushing a context.
- CSRF: Flask-WTF or equivalent. Sessions are signed, not encrypted — do not store secrets in them.
- Tests: `app.test_client()`, `app.test_request_context()`; pytest fixtures for `app` and `client`.

## Celery

**Detect:** `celery.py`, `Celery(` app, `@shared_task` / `@app.task`.

- **Idempotent tasks:** tasks can run more than once (retries, redelivery, `acks_late`). Make them safe to repeat (unique keys, upserts, state checks).
- **Arguments:** pass IDs and primitives, not ORM objects or large payloads; re-fetch inside the task.
- **Serializer:** JSON (`task_serializer="json"`, `accept_content=["json"]`); pickle allows code execution from a compromised broker.
- **Retries:** `autoretry_for=(TransientError,)`, `retry_backoff=True`, `max_retries`; do not retry on programming errors.
- **Limits:** `time_limit` / `soft_time_limit` per task; `worker_prefetch_multiplier` low for long tasks; with `acks_late` and a Redis broker, keep the visibility timeout longer than the longest task.
- **Transactions:** enqueue after commit (`transaction.on_commit(lambda: task.delay(obj.id))` in Django) or the worker may not see the row.
- **Scheduling:** Celery beat runs exactly one instance; do not start it inside every worker replica.
- **Tests:** call the task function directly for unit tests; eager mode (`task_always_eager`) hides serialization and transaction issues, so keep an integration test with a real worker for critical flows.

## Data and ML

### pandas / NumPy
- Vectorise: column operations, `np.where`, `merge`, `groupby().agg()`; avoid `iterrows`, row-wise `apply`, and growing a DataFrame in a loop (collect rows in a list, build once).
- Read with explicit `dtype`, `usecols`, `parse_dates`; `category` dtype for low-cardinality strings; Parquet over CSV for intermediate data.
- Chained assignment (`df[df.a > 0]["b"] = 1`) does not reliably modify `df` — use `df.loc[mask, "b"] = 1`. Newer pandas versions enable copy-on-write semantics; check the project's pandas version.
- Watch silent dtype changes: integer columns with missing values become float unless a nullable dtype (`Int64`) is used.
- `read_pickle` and `np.load(allow_pickle=True)` are unsafe on untrusted files.
- Memory: `df.info(memory_usage="deep")`; process large files in chunks (`chunksize=`) or use a columnar engine.

### PyTorch
- Device: create tensors on the target device; move model and batch with `.to(device)`; avoid frequent `.item()` / `.cpu()` in the training loop (forces sync).
- Modes: `model.train()` for training, `model.eval()` + `torch.inference_mode()` (or `no_grad()`) for evaluation and inference — otherwise dropout/batch-norm behave wrongly and memory grows.
- Loading: `torch.load(path, weights_only=True)` or `safetensors`; never load untrusted full pickled models.
- Data: `DataLoader` with `num_workers` > 0 and `pin_memory=True` for GPU training; on platforms that spawn processes, guard the entry point with `if __name__ == "__main__":`.
- Reproducibility: seed `random`, `numpy`, `torch` (and CUDA); record library versions; deterministic algorithms only when needed (slower).
- Save `state_dict()`, not the whole model object.
- Out-of-memory on GPU: smaller batch, mixed precision (`torch.autocast`), gradient accumulation, free references to tensors from previous steps.

### Notebooks
- Restart and run all before trusting results; move reusable code into modules with tests.
- Do not commit outputs containing data or secrets; consider stripping outputs in pre-commit.
