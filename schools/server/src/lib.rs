//! Driver for driving schools: the server library. `main.rs` is a thin CLI over it so tests can
//! boot the whole app in-process.

pub mod api;
pub mod auth;
pub mod config;
pub mod crypto;
pub mod error;
pub mod net;
pub mod pdf;
pub mod readiness;
pub mod seed;
pub mod spa;
pub mod state;

use axum::Router;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use state::AppState;
use std::time::Duration;
use tower_http::trace::TraceLayer;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// The whole HTTP app: API, then the dashboard's static files with index.html as fallback.
pub fn app(state: AppState) -> Router {
    let router = api::router(state.clone());
    let router = match state.config.web_dist.clone() {
        Some(dir) => router.fallback_service(spa::service(dir)),
        None => router.fallback(spa::no_web),
    };
    router.layer(TraceLayer::new_for_http()).with_state(state)
}

pub async fn connect(database_url: &str) -> anyhow::Result<PgPool> {
    Ok(PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await?)
}
