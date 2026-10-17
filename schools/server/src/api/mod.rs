//! The HTTP API. Staff routes need the session cookie ([`crate::auth::Principal`]); app routes
//! need the bearer token ([`crate::auth::AppPrincipal`]). Errors are problem+json.
//!
//! | Route | |
//! |---|---|
//! | `GET /api/v1/health` | `{ok}` |
//! | `POST /api/v1/auth/login`, `/logout`, `GET /api/v1/auth/me` | sign-in ([`crate::auth`]) |
//! | `GET/PATCH /api/v1/school`, `GET /api/v1/school/overview`, `GET /api/v1/instructors`, `GET /api/v1/branches` | [`school`] |
//! | `/api/v1/groups…` | courses, their students, join codes, theory lessons + attendance ([`groups`]) |
//! | `/api/v1/students…` | students, enrolment, progress, driving lessons, documents ([`students`]) |
//! | `/api/v1/documents/{id}/pdf` | a generated PDF ([`students`]) |
//! | `/api/v1/app/join`, `/me`, `/sync`, `/unlink` | the mobile app ([`app`]) |

pub mod app;
pub mod groups;
pub mod school;
pub mod students;

use crate::auth;
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::rejection::JsonRejection;
use axum::extract::{DefaultBodyLimit, FromRequest, Request};
use axum::http::Method;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub fn router(state: AppState) -> Router<AppState> {
    // The app (a native client) sends a bearer token and no cookie; the dashboard runs on the
    // same origin in production and through Vite's proxy in development. CORS is only for a
    // dashboard served from elsewhere (SCHOOLS_ALLOWED_ORIGINS).
    let mut origins: Vec<axum::http::HeaderValue> = state
        .config
        .allowed_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    if let Ok(v) = state.config.app_origin().parse() {
        origins.push(v);
    }
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::PUT, Method::DELETE])
        .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION])
        .allow_credentials(true);
    Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/auth/me", get(auth::me))
        .merge(school::routes())
        .merge(groups::routes())
        .merge(students::routes())
        .merge(app::routes())
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .layer(cors)
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

/// `axum::Json` whose rejection is a problem+json 400 `invalid_body`.
pub struct JsonBody<T>(pub T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequest<S> for JsonBody<T> {
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        match Json::<T>::from_request(req, state).await {
            Ok(Json(v)) => Ok(JsonBody(v)),
            Err(JsonRejection::MissingJsonContentType(_)) => {
                Err(AppError::invalid("Pošlite telo ako JSON (content-type: application/json)."))
            }
            Err(e) => Err(AppError::invalid(format!("Telo požiadavky nezodpovedá tejto ceste: {}", e.body_text()))),
        }
    }
}

/// A non-empty, trimmed string or a 400 naming the field.
pub fn required(field: &str, value: &str) -> Result<String, AppError> {
    let v = value.trim();
    if v.is_empty() {
        return Err(AppError::invalid(format!("Pole `{field}` je povinné.")));
    }
    Ok(v.to_owned())
}
