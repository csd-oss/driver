//! Sign-in for the dashboard (email + password → session cookie) and for the app (a bearer token
//! issued when a student joins with a code).
//!
//! - `POST /api/v1/auth/login {email, password}` sets the `schools_session` cookie (30 days,
//!   sliding) and returns the signed-in person; `POST /api/v1/auth/logout`; `GET /api/v1/auth/me`.
//! - Every other staff request needs the cookie: without it, 401 problem+json `unauthorized`.
//!   Cookie-authenticated writes must come from the dashboard's own page ([`crate::net::from_own_page`]).
//! - The app sends `Authorization: Bearer <token>`; [`AppPrincipal`] resolves it to a student.

use crate::crypto::{hash_token, random_token, verify_password};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

pub const SESSION_COOKIE: &str = "schools_session";
pub const SESSION_DAYS: i64 = 30;
const TOUCH_EVERY: Duration = Duration::minutes(10);

/// The signed-in staff member.
#[derive(Debug, Clone, Serialize)]
pub struct Principal {
    pub user_id: Uuid,
    pub school_id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    #[serde(skip)]
    pub session_id: Uuid,
}

impl Principal {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
    pub fn require_admin(&self) -> AppResult<()> {
        if self.is_admin() {
            Ok(())
        } else {
            Err(AppError::forbidden("Toto môže urobiť len správca autoškoly."))
        }
    }
}

pub fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v)
}

fn is_safe(method: &Method) -> bool {
    matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS)
}

#[derive(sqlx::FromRow)]
struct SessionRow {
    id: Uuid,
    user_id: Uuid,
    last_seen_at: OffsetDateTime,
    school_id: Uuid,
    email: String,
    name: String,
    role: String,
}

/// The session's user, sliding its expiry at most every ten minutes.
pub async fn principal_from_session(db: &PgPool, token: &str) -> AppResult<Principal> {
    let row = sqlx::query_as::<_, SessionRow>(
        "SELECT s.id, s.user_id, s.last_seen_at, u.school_id, u.email, u.name, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active",
    )
    .bind(hash_token(token))
    .fetch_optional(db)
    .await?
    .ok_or_else(AppError::unauthorized)?;
    if row.last_seen_at < OffsetDateTime::now_utc() - TOUCH_EVERY {
        sqlx::query("UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1")
            .bind(row.id)
            .bind(SESSION_DAYS as i32)
            .execute(db)
            .await?;
    }
    Ok(Principal {
        user_id: row.user_id,
        school_id: row.school_id,
        email: row.email,
        name: row.name,
        role: row.role,
        session_id: row.id,
    })
}

impl FromRequestParts<AppState> for Principal {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let cookie = cookie_value(&parts.headers, SESSION_COOKIE).ok_or_else(AppError::unauthorized)?;
        if !is_safe(&parts.method)
            && !crate::net::from_own_page(&parts.headers, &state.config.app_origin(), &state.config.allowed_origins)
        {
            return Err(AppError::forbidden("Táto zmena musí prísť zo stránky aplikácie."));
        }
        principal_from_session(&state.db, cookie).await
    }
}

/// The student behind an app bearer token.
#[derive(Debug, Clone)]
pub struct AppPrincipal {
    pub link_id: Uuid,
    pub student_id: Uuid,
    pub school_id: Uuid,
    pub lang: i32,
}

impl FromRequestParts<AppState> for AppPrincipal {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or_else(AppError::unauthorized)?;
        let row: Option<(Uuid, Uuid, Uuid, i32)> = sqlx::query_as(
            "SELECT l.id, l.student_id, s.school_id, l.lang
               FROM app_links l JOIN students s ON s.id = l.student_id
              WHERE l.token_hash = $1 AND l.revoked_at IS NULL",
        )
        .bind(hash_token(token))
        .fetch_optional(&state.db)
        .await?;
        let (link_id, student_id, school_id, lang) = row.ok_or_else(AppError::unauthorized)?;
        Ok(AppPrincipal { link_id, student_id, school_id, lang })
    }
}

pub fn set_cookie(token: &str, secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    let max_age = SESSION_DAYS * 24 * 3600;
    HeaderValue::from_str(&format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}"))
        .expect("cookie is ascii")
}

pub fn clear_cookie(secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{secure}"))
        .expect("cookie is ascii")
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(sqlx::FromRow)]
struct LoginRow {
    id: Uuid,
    school_id: Uuid,
    email: String,
    name: String,
    role: String,
    password_hash: String,
}

/// `POST /api/v1/auth/login`: 200 with the person and the cookie; 401 `bad_credentials` otherwise
/// (the same answer for an unknown address and a wrong password).
pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> AppResult<Response> {
    if !crate::net::from_own_page(&headers, &state.config.app_origin(), &state.config.allowed_origins) {
        return Err(AppError::forbidden("Prihlásenie musí prísť zo stránky aplikácie."));
    }
    let row = sqlx::query_as::<_, LoginRow>(
        "SELECT id, school_id, email, name, role, password_hash FROM users WHERE lower(email) = lower($1) AND active",
    )
    .bind(req.email.trim())
    .fetch_optional(&state.db)
    .await?;
    let bad = || AppError::new(StatusCode::UNAUTHORIZED, "bad_credentials", "Nesprávny e-mail alebo heslo.");
    let Some(user) = row else { return Err(bad()) };
    if !verify_password(&req.password, &user.password_hash) {
        return Err(bad());
    }
    let token = random_token(32);
    let session_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(session_id)
    .bind(user.id)
    .bind(hash_token(&token))
    .bind(OffsetDateTime::now_utc() + Duration::days(SESSION_DAYS))
    .bind(crate::net::user_agent(&headers).map(|u| u.chars().take(400).collect::<String>()))
    .execute(&state.db)
    .await?;
    let who = Principal {
        user_id: user.id,
        school_id: user.school_id,
        email: user.email,
        name: user.name,
        role: user.role,
        session_id,
    };
    let mut res = Json(who).into_response();
    res.headers_mut().insert(header::SET_COOKIE, set_cookie(&token, state.config.cookie_secure));
    Ok(res)
}

/// `POST /api/v1/auth/logout`: 204, also without a session; the cookie is cleared.
pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(cookie) = cookie_value(&headers, SESSION_COOKIE) {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(hash_token(cookie))
            .execute(&state.db)
            .await?;
    }
    let mut res = StatusCode::NO_CONTENT.into_response();
    res.headers_mut().insert(header::SET_COOKIE, clear_cookie(state.config.cookie_secure));
    Ok(res)
}

/// `GET /api/v1/auth/me`: who is signed in (401 when nobody).
pub async fn me(who: Principal) -> Json<Principal> {
    Json(who)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cookie_parsing() {
        let mut h = HeaderMap::new();
        h.insert(header::COOKIE, "a=1; schools_session=tok; b=2".parse().unwrap());
        assert_eq!(cookie_value(&h, SESSION_COOKIE), Some("tok"));
        assert_eq!(cookie_value(&h, "missing"), None);
    }
}
