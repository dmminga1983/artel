# Rust frameworks — notes and gotchas

Always check the project's crate versions first (`cargo tree -i axum --depth 0`); several of these crates have breaking changes between minor 0.x releases.

## axum

```rust
use axum::{extract::{Path, State}, http::StatusCode, response::IntoResponse, routing::get, Json, Router};

#[derive(Clone)]
struct AppState { db: sqlx::PgPool }

async fn get_user(State(st): State<AppState>, Path(id): Path<i64>) -> Result<Json<User>, AppError> {
    let user = sqlx::query_as::<_, User>("SELECT id, name FROM users WHERE id = $1")
        .bind(id)
        .fetch_one(&st.db)
        .await?;
    Ok(Json(user))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let state = AppState { db: sqlx::PgPool::connect(&std::env::var("DATABASE_URL")?).await? };
    let app = Router::new()
        .route("/users/{id}", get(get_user))   // axum 0.8+; older versions use "/users/:id"
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

- **Extractor order:** anything consuming the body (`Json`, `Form`, `String`, `Bytes`, `Request`) must be the last argument; at most one.
- **Error type:** define `AppError` wrapping `anyhow::Error` or your enum and `impl IntoResponse` — map internal errors to 500 with a generic message, and log details server-side.
- **Middleware:** `tower-http` — `TraceLayer`, `CorsLayer` (explicit origins, not `Any`, when credentials are involved), `TimeoutLayer`, `CompressionLayer`, `RequestBodyLimitLayer`. axum also has `DefaultBodyLimit`.
- **Decode handler errors** with `#[axum::debug_handler]` (needs the `macros` feature).
- **Graceful shutdown:** `axum::serve(...).with_graceful_shutdown(signal)`.
- **Testing:** build the `Router` in a function and drive it with `tower::ServiceExt::oneshot(request)`, no network needed.

## actix-web

```rust
use actix_web::{web, App, HttpServer, HttpResponse};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let state = web::Data::new(AppState::new());       // created once, outside the closure
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .app_data(web::JsonConfig::default().limit(64 * 1024))
            .route("/health", web::get().to(|| async { HttpResponse::Ok().finish() }))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

- The factory closure runs once **per worker**: state built inside it is not shared.
- `web::Data<T>` wraps `Arc<T>`; for mutable shared state use `Mutex`/`RwLock` inside, or an actor/channel.
- Missing `app_data` for an extractor produces a 500 at runtime, not a compile error — test every route.
- Testing: `actix_web::test::init_service` + `test::TestRequest`.

## serde

- `#[derive(Serialize, Deserialize)]` with the `derive` feature.
- Naming: `#[serde(rename_all = "camelCase")]`; field-level `rename`.
- Optional and defaults: `#[serde(default)]`, `#[serde(skip_serializing_if = "Option::is_none")]`.
- Strict input: `#[serde(deny_unknown_fields)]` (not compatible with `flatten`).
- Enums: externally tagged by default; `#[serde(tag = "type")]` (internal), `#[serde(tag = "t", content = "c")]` (adjacent), `#[serde(untagged)]` (slow, poor error messages — avoid for big inputs).
- Validation: serde checks shape, not business rules — validate after deserialising (or `#[serde(try_from = "Raw")]`), or use the `validator` crate.
- Untrusted data: limit input size before parsing; `serde_json` has a default recursion limit; avoid `#[serde(borrow)]` lifetimes leaking into long-lived types.
- Keep wire DTOs separate from domain types when they diverge.

## sqlx

- Runtime queries: `sqlx::query("... WHERE id = $1").bind(id)` (Postgres `$1`, MySQL/SQLite `?`).
- Compile-time checked: `sqlx::query!` / `query_as!` connect to `DATABASE_URL` at build time. For CI and offline builds: `cargo sqlx prepare` (workspace: `cargo sqlx prepare --workspace`) writes `.sqlx/`; commit it; builds then use it when `SQLX_OFFLINE=true` or no database is reachable.
- Migrations: `sqlx migrate add <name>`, `sqlx migrate run`; embed with `sqlx::migrate!().run(&pool).await?`.
- Dynamic queries: `QueryBuilder::new("SELECT ... WHERE 1=1").push(" AND name = ").push_bind(name)`. Identifiers (table/column names) cannot be bound — whitelist them.
- Pools: create one `PgPool` at startup and clone it (it is an `Arc`); set `max_connections` and acquire timeouts.
- Tests: `#[sqlx::test]` creates an isolated database per test and can apply migrations/fixtures.

## diesel

- CLI: `diesel setup`, `diesel migration generate <name>`, `diesel migration run`, `diesel migration redo`. `schema.rs` is generated (`diesel print-schema` / configured in `diesel.toml`).
- Diesel is synchronous: in async apps use `diesel-async`, or a pool (`deadpool-diesel`, `r2d2`) with `spawn_blocking`.
- Raw SQL: `diesel::sql_query("... WHERE id = $1").bind::<diesel::sql_types::BigInt, _>(id)` — never `format!`.
- N+1: use `belonging_to` + `grouped_by` or joins instead of a query per row.

## clap

```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(version, about)]
struct Cli {
    /// Increase verbosity
    #[arg(short, long, action = clap::ArgAction::Count)]
    verbose: u8,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd { Sync { #[arg(long)] dry_run: bool } }

#[test]
fn cli_is_valid() { use clap::CommandFactory; Cli::command().debug_assert(); }
```

- `#[arg(env = "APP_TOKEN")]` needs the `env` feature; never put secrets in default values or help text.
- `ValueEnum` for closed sets of options; `value_parser` for ranges and custom types.
- Exit codes: return `anyhow::Result<()>` from `main` or map errors to `std::process::ExitCode`.

## tokio essentials

- Features: `macros` + `rt-multi-thread` for `#[tokio::main]`; add `net`, `fs`, `time`, `sync`, `signal`, `process` as needed (`full` is fine for apps, not for libraries).
- `tokio::spawn` needs `Send + 'static` futures; `JoinSet` to manage groups; `tokio_util::sync::CancellationToken` for shutdown.
- `tokio::select!` drops the losing branches — make sure those futures are cancellation-safe (the tokio docs list which methods are).
- Channels: `mpsc` (bounded by default — prefer bounded), `oneshot`, `broadcast`, `watch`.
- `spawn_blocking` for CPU-heavy or blocking work; consider `rayon` for data parallelism.
