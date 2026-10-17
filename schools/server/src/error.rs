//! Errors are RFC 9457 problem+json with a human `detail` (the web shows it as is) and a
//! stable machine `code` (the web maps codes to its own language; `detail` is the Slovak fallback):
//!
//! ```json
//! {"type":"about:blank","title":"Not Found","status":404,"detail":"Student not found.","code":"not_found"}
//! ```
//!
//! Some codes carry `params` (the missing `field`, the driving `kind` and its `max`) so a client
//! can word the sentence itself.

use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub params: Option<serde_json::Value>,
}

pub type AppResult<T> = Result<T, AppError>;

#[derive(Serialize)]
struct Problem<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    title: &'a str,
    status: u16,
    detail: &'a str,
    code: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<&'a serde_json::Value>,
}

impl AppError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self { status, code, message: message.into(), params: None }
    }
    /// Attach the values a client needs to word this error in its own language.
    pub fn with_params(mut self, params: serde_json::Value) -> Self {
        self.params = Some(params);
        self
    }
    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code, message)
    }
    /// 400 `invalid_body`.
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::bad_request("invalid_body", message)
    }
    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "unauthorized", "Prihlásenie vypršalo. Prihláste sa znova.")
    }
    pub fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, code, message)
    }
    /// 404 "`what` not found." (also for things the actor may not see). `code` names the
    /// resource (`student_not_found`, …) so the client can word it.
    pub fn not_found(code: &'static str, what: &str) -> Self {
        Self::new(StatusCode::NOT_FOUND, code, format!("{what} sa nenašiel."))
    }
    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, code, message)
    }
    pub fn internal() -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal", "Niečo sa pokazilo na našej strane.")
    }

    pub fn body(&self) -> serde_json::Value {
        serde_json::to_value(Problem {
            kind: "about:blank",
            title: self.status.canonical_reason().unwrap_or("Error"),
            status: self.status.as_u16(),
            detail: &self.message,
            code: self.code,
            params: self.params.as_ref(),
        })
        .expect("problem serialises")
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}: {}", self.status.as_u16(), self.code, self.message)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let mut res = (self.status, self.body().to_string()).into_response();
        res.headers_mut()
            .insert(header::CONTENT_TYPE, HeaderValue::from_static("application/problem+json"));
        res
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!(error = %err, "database error");
        AppError::internal()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        tracing::error!(error = %err, "internal error");
        AppError::internal()
    }
}

/// True when `err` is a unique-constraint violation on `constraint`.
pub fn is_unique_violation(err: &sqlx::Error, constraint: &str) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.constraint() == Some(constraint))
}
