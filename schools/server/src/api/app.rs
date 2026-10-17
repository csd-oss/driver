//! What the mobile app talks to. Joining is one request with a code; everything after that
//! carries the bearer token the join returned.
//!
//! | Route | |
//! |---|---|
//! | `POST /api/v1/app/join {code, device_id, lang, app_version?, name?}` | → `{token, school, group, student}` |
//! | `GET /api/v1/app/me` | the link as the app shows it |
//! | `POST /api/v1/app/sync {attempts, mock_exams, exam_results, snapshot}` | idempotent upsert of the app's own rows |
//! | `POST /api/v1/app/unlink` | revokes the token; the school keeps what was synced |

use super::JsonBody;
use crate::auth::AppPrincipal;
use crate::crypto::{hash_token, normalize_code, random_token};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgConnection;
use time::OffsetDateTime;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/v1/app/join", post(join))
        .route("/api/v1/app/me", get(me))
        .route("/api/v1/app/sync", post(sync))
        .route("/api/v1/app/unlink", post(unlink))
}

#[derive(Deserialize)]
pub struct JoinRequest {
    pub code: String,
    pub device_id: String,
    pub lang: Option<i32>,
    pub app_version: Option<String>,
    /// What the student typed when the code is a group code and we have to create them.
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Serialize)]
pub struct LinkInfo {
    pub school_id: Uuid,
    pub school_name: String,
    pub group_id: Option<Uuid>,
    pub group_name: Option<String>,
    pub student_id: Uuid,
    pub student_name: String,
    #[serde(with = "time::serde::rfc3339")]
    pub linked_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    pub last_sync_at: Option<OffsetDateTime>,
}

#[derive(Serialize)]
pub struct JoinResponse {
    pub token: String,
    #[serde(flatten)]
    pub link: LinkInfo,
}

#[derive(sqlx::FromRow)]
struct CodeRow {
    id: Uuid,
    school_id: Uuid,
    group_id: Option<Uuid>,
    student_id: Option<Uuid>,
    uses_left: Option<i32>,
}

async fn link_info(conn: &mut PgConnection, link_id: Uuid) -> AppResult<LinkInfo> {
    #[derive(sqlx::FromRow)]
    struct Row {
        school_id: Uuid,
        school_name: String,
        group_id: Option<Uuid>,
        group_name: Option<String>,
        student_id: Uuid,
        first_name: String,
        last_name: String,
        linked_at: OffsetDateTime,
        last_sync_at: Option<OffsetDateTime>,
    }
    let r = sqlx::query_as::<_, Row>(
        "SELECT sc.id AS school_id, sc.name AS school_name, g.id AS group_id, g.name AS group_name,
                s.id AS student_id, s.first_name, s.last_name, l.linked_at, l.last_sync_at
           FROM app_links l
           JOIN students s ON s.id = l.student_id
           JOIN schools sc ON sc.id = s.school_id
           LEFT JOIN LATERAL (SELECT g.id, g.name FROM enrolments e JOIN groups g ON g.id = e.group_id
                              WHERE e.student_id = s.id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1) g ON true
          WHERE l.id = $1",
    )
    .bind(link_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(AppError::unauthorized)?;
    Ok(LinkInfo {
        school_id: r.school_id,
        school_name: r.school_name,
        group_id: r.group_id,
        group_name: r.group_name,
        student_id: r.student_id,
        student_name: format!("{} {}", r.first_name, r.last_name),
        linked_at: r.linked_at,
        last_sync_at: r.last_sync_at,
    })
}

/// `POST /api/v1/app/join`. A student code links that student; a group code enrols a new student
/// (named from the request) or, when this device was linked before to a student of the group,
/// re-links the same student. 404 `bad_code` for an unknown, expired or used-up code.
async fn join(State(state): State<AppState>, JsonBody(req): JsonBody<JoinRequest>) -> AppResult<Json<JoinResponse>> {
    let code = normalize_code(&req.code);
    if code.len() < 6 {
        return Err(AppError::bad_request("bad_code_format", "Kód má 8 znakov."));
    }
    let device_id = super::required("device_id", &req.device_id)?;
    let lang = req.lang.unwrap_or(1).clamp(1, 3);
    let mut tx = state.db.begin().await?;
    let row = sqlx::query_as::<_, CodeRow>(
        "SELECT id, school_id, group_id, student_id, uses_left FROM join_codes
          WHERE code = $1 AND expires_at > now() AND (uses_left IS NULL OR uses_left > 0) FOR UPDATE",
    )
    .bind(&code)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::new(axum::http::StatusCode::NOT_FOUND, "bad_code", "Tento kód neplatí. Overte si ho v autoškole."))?;

    let student_id = match (row.student_id, row.group_id) {
        (Some(s), _) => s,
        (None, Some(group_id)) => {
            let open: bool = sqlx::query_scalar("SELECT status IN ('planned', 'running') FROM groups WHERE id = $1")
                .bind(group_id)
                .fetch_one(&mut *tx)
                .await?;
            if !open {
                return Err(AppError::new(axum::http::StatusCode::NOT_FOUND, "bad_code", "Tento kurz už skončil. Overte si kód v autoškole."));
            }
            // The same device joining the same group again (reinstall over a live link) gets its
            // old student back. A revoked link (the student left) or a closed enrolment does not
            // qualify: then it is a new student, which the school can merge by hand.
            let existing: Option<Uuid> = sqlx::query_scalar(
                "SELECT l.student_id FROM app_links l JOIN enrolments e ON e.student_id = l.student_id
                  WHERE l.device_id = $1 AND e.group_id = $2 AND l.revoked_at IS NULL AND e.status = 'active'
                  ORDER BY l.linked_at DESC LIMIT 1",
            )
            .bind(&device_id)
            .bind(group_id)
            .fetch_optional(&mut *tx)
            .await?;
            match existing {
                Some(s) => s,
                None => {
                    let first = req.first_name.as_deref().map(str::trim).unwrap_or("");
                    let last = req.last_name.as_deref().map(str::trim).unwrap_or("");
                    if first.is_empty() || last.is_empty() {
                        return Err(AppError::new(
                            axum::http::StatusCode::UNPROCESSABLE_ENTITY,
                            "name_required",
                            "Zadajte meno a priezvisko, aby vás autoškola našla v zozname.",
                        ));
                    }
                    let id = Uuid::now_v7();
                    // Serialise register numbers per school (two joins at once must not collide).
                    sqlx::query("SELECT id FROM schools WHERE id = $1 FOR UPDATE").bind(row.school_id).execute(&mut *tx).await?;
                    let register_no: i32 = sqlx::query_scalar(
                        "SELECT coalesce(max(register_no), 0) + 1 FROM students WHERE school_id = $1",
                    )
                    .bind(row.school_id)
                    .fetch_one(&mut *tx)
                    .await?;
                    sqlx::query(
                        "INSERT INTO students (id, school_id, register_no, first_name, last_name, app_consent_on)
                         VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)",
                    )
                    .bind(id)
                    .bind(row.school_id)
                    .bind(register_no)
                    .bind(first)
                    .bind(last)
                    .execute(&mut *tx)
                    .await?;
                    sqlx::query("INSERT INTO enrolments (id, student_id, group_id) VALUES ($1, $2, $3)")
                        .bind(Uuid::now_v7())
                        .bind(id)
                        .bind(group_id)
                        .execute(&mut *tx)
                        .await?;
                    id
                }
            }
        }
        (None, None) => return Err(AppError::internal()),
    };
    if row.uses_left.is_some() {
        sqlx::query("UPDATE join_codes SET uses_left = uses_left - 1 WHERE id = $1").bind(row.id).execute(&mut *tx).await?;
    }
    // One live link per device and student: a rejoin replaces the old token.
    sqlx::query("UPDATE app_links SET revoked_at = now() WHERE student_id = $1 AND device_id = $2 AND revoked_at IS NULL")
        .bind(student_id)
        .bind(&device_id)
        .execute(&mut *tx)
        .await?;
    // Joining through the app is the student's consent to share their practice data with the school.
    sqlx::query("UPDATE students SET app_consent_on = coalesce(app_consent_on, CURRENT_DATE) WHERE id = $1")
        .bind(student_id)
        .execute(&mut *tx)
        .await?;
    let token = random_token(32);
    let link_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO app_links (id, student_id, device_id, token_hash, lang, app_version) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(link_id)
    .bind(student_id)
    .bind(&device_id)
    .bind(hash_token(&token))
    .bind(lang)
    .bind(req.app_version.unwrap_or_default())
    .execute(&mut *tx)
    .await?;
    let link = link_info(&mut tx, link_id).await?;
    tx.commit().await?;
    Ok(Json(JoinResponse { token, link }))
}

async fn me(State(state): State<AppState>, who: AppPrincipal) -> AppResult<Json<LinkInfo>> {
    let mut conn = state.db.acquire().await?;
    Ok(Json(link_info(&mut conn, who.link_id).await?))
}

#[derive(Deserialize)]
pub struct AttemptIn {
    pub id: Uuid,
    pub question_id: String,
    pub mode: String,
    pub category_text: Option<String>,
    pub is_correct: bool,
    pub response_time_ms: Option<i32>,
    /// Unix seconds, as the app stores them.
    pub answered_at: i64,
}

#[derive(Deserialize)]
pub struct MockIn {
    pub id: Uuid,
    pub score: i32,
    pub max_score: i32,
    pub min_to_pass: i32,
    pub passed: bool,
    pub duration_sec: Option<i32>,
    pub completed_at: i64,
}

#[derive(Deserialize)]
pub struct ExamIn {
    pub id: Uuid,
    pub passed: bool,
    pub points: i32,
    pub max_points: Option<i32>,
    pub min_to_pass: Option<i32>,
    pub readiness_score: Option<i32>,
    pub taken_at: i64,
}

#[derive(Deserialize)]
pub struct SnapshotIn {
    pub readiness_score: i32,
    pub readiness_label: String,
    pub total_questions: i32,
    pub seen_count: i32,
    pub mistakes_count: i32,
    pub due_mistakes_count: Option<i32>,
    pub accuracy_7d: Option<i32>,
    pub attempts_7d: Option<i32>,
    pub mocks_taken: Option<i32>,
    pub mocks_passed: Option<i32>,
    pub days_to_ready: Option<i32>,
    pub streak: Option<i32>,
    pub components: Option<Value>,
}

#[derive(Deserialize, Default)]
pub struct SyncRequest {
    #[serde(default)]
    pub attempts: Vec<AttemptIn>,
    #[serde(default)]
    pub mock_exams: Vec<MockIn>,
    #[serde(default)]
    pub exam_results: Vec<ExamIn>,
    pub snapshot: Option<SnapshotIn>,
    pub lang: Option<i32>,
}

#[derive(Serialize)]
pub struct SyncResponse {
    pub attempts: usize,
    pub mock_exams: usize,
    pub exam_results: usize,
    pub snapshot: bool,
    #[serde(with = "time::serde::rfc3339")]
    pub synced_at: OffsetDateTime,
}

const MAX_ROWS: usize = 5000;

fn ts(seconds: i64) -> AppResult<OffsetDateTime> {
    OffsetDateTime::from_unix_timestamp(seconds).map_err(|_| AppError::bad_request("bad_timestamp", "Neplatný čas."))
}

/// `POST /api/v1/app/sync`: rows are upserted by the app's own ids, so sending them twice is safe.
async fn sync(State(state): State<AppState>, who: AppPrincipal, JsonBody(req): JsonBody<SyncRequest>) -> AppResult<Json<SyncResponse>> {
    if req.attempts.len() > MAX_ROWS || req.mock_exams.len() > MAX_ROWS || req.exam_results.len() > MAX_ROWS {
        return Err(AppError::bad_request("too_many_rows", format!("Najviac {MAX_ROWS} riadkov na jednu synchronizáciu.")));
    }
    let lang = req.lang.unwrap_or(who.lang).clamp(1, 3);
    let mut tx = state.db.begin().await?;
    for a in &req.attempts {
        if !matches!(a.mode.as_str(), "study" | "mock" | "mistakes" | "game") {
            return Err(AppError::bad_request("bad_attempt_mode", "Neznámy režim odpovede."));
        }
        sqlx::query(
            "INSERT INTO app_attempts (id, student_id, lang, question_id, mode, category_text, is_correct, response_time_ms, answered_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (student_id, id) DO NOTHING",
        )
        .bind(a.id)
        .bind(who.student_id)
        .bind(lang)
        .bind(&a.question_id)
        .bind(&a.mode)
        .bind(&a.category_text)
        .bind(a.is_correct)
        .bind(a.response_time_ms.unwrap_or(0))
        .bind(ts(a.answered_at)?)
        .execute(&mut *tx)
        .await?;
    }
    for m in &req.mock_exams {
        sqlx::query(
            "INSERT INTO app_mock_exams (id, student_id, lang, score, max_score, min_to_pass, passed, duration_sec, completed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (student_id, id) DO UPDATE SET score = excluded.score, passed = excluded.passed, completed_at = excluded.completed_at",
        )
        .bind(m.id)
        .bind(who.student_id)
        .bind(lang)
        .bind(m.score)
        .bind(m.max_score)
        .bind(m.min_to_pass)
        .bind(m.passed)
        .bind(m.duration_sec)
        .bind(ts(m.completed_at)?)
        .execute(&mut *tx)
        .await?;
    }
    for e in &req.exam_results {
        sqlx::query(
            "INSERT INTO app_exam_results (id, student_id, lang, passed, points, max_points, min_to_pass, readiness_score, taken_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (student_id, id) DO NOTHING",
        )
        .bind(e.id)
        .bind(who.student_id)
        .bind(lang)
        .bind(e.passed)
        .bind(e.points)
        .bind(e.max_points.unwrap_or(100))
        .bind(e.min_to_pass.unwrap_or(90))
        .bind(e.readiness_score)
        .bind(ts(e.taken_at)?)
        .execute(&mut *tx)
        .await?;
    }
    if let Some(s) = &req.snapshot {
        sqlx::query(
            "INSERT INTO app_snapshots (id, student_id, lang, readiness_score, readiness_label, total_questions, seen_count,
                                        mistakes_count, due_mistakes_count, accuracy_7d, attempts_7d, mocks_taken, mocks_passed,
                                        days_to_ready, streak, components)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
        )
        .bind(Uuid::now_v7())
        .bind(who.student_id)
        .bind(lang)
        .bind(s.readiness_score.clamp(0, 100))
        .bind(&s.readiness_label)
        .bind(s.total_questions)
        .bind(s.seen_count)
        .bind(s.mistakes_count)
        .bind(s.due_mistakes_count.unwrap_or(0))
        .bind(s.accuracy_7d)
        .bind(s.attempts_7d.unwrap_or(0))
        .bind(s.mocks_taken.unwrap_or(0))
        .bind(s.mocks_passed.unwrap_or(0))
        .bind(s.days_to_ready)
        .bind(s.streak.unwrap_or(0))
        .bind(sqlx::types::Json(s.components.clone().unwrap_or(Value::Object(Default::default()))))
        .execute(&mut *tx)
        .await?;
        // Keep the last 30 snapshots per student: enough for a trend, not a second event log.
        sqlx::query(
            "DELETE FROM app_snapshots WHERE student_id = $1 AND id NOT IN
             (SELECT id FROM app_snapshots WHERE student_id = $1 ORDER BY received_at DESC LIMIT 30)",
        )
        .bind(who.student_id)
        .execute(&mut *tx)
        .await?;
    }
    let now = OffsetDateTime::now_utc();
    sqlx::query("UPDATE app_links SET last_sync_at = $2, lang = $3 WHERE id = $1")
        .bind(who.link_id)
        .bind(now)
        .bind(lang)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(SyncResponse {
        attempts: req.attempts.len(),
        mock_exams: req.mock_exams.len(),
        exam_results: req.exam_results.len(),
        snapshot: req.snapshot.is_some(),
        synced_at: now,
    }))
}

/// `POST /api/v1/app/unlink`: the token stops working. Synced data stays with the school (it is
/// the school's training record); deleting it is the school's GDPR process, not the app's.
async fn unlink(State(state): State<AppState>, who: AppPrincipal) -> AppResult<axum::http::StatusCode> {
    sqlx::query("UPDATE app_links SET revoked_at = now() WHERE id = $1").bind(who.link_id).execute(&state.db).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
