//! The school itself: profile, the overview numbers, instructors and branches.

use super::JsonBody;
use crate::auth::Principal;
use crate::error::{AppError, AppResult};
use crate::readiness;
use crate::state::AppState;
use axum::Json;
use axum::extract::State;
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use time::Date;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/v1/school", get(get_school).patch(patch_school))
        .route("/api/v1/school/overview", get(overview))
        .route("/api/v1/instructors", get(instructors))
        .route("/api/v1/branches", get(branches))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct School {
    pub id: Uuid,
    pub name: String,
    pub legal_name: String,
    pub ico: String,
    pub address: String,
    pub registration_no: String,
    pub trade_licence_no: String,
    pub responsible_person: String,
    pub phone: String,
    pub email: String,
}

pub async fn load_school(conn: &mut sqlx::PgConnection, id: Uuid) -> AppResult<School> {
    sqlx::query_as::<_, School>(
        "SELECT id, name, legal_name, ico, address, registration_no, trade_licence_no, responsible_person, phone, email
           FROM schools WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| AppError::not_found("Autoškola"))
}

async fn get_school(State(state): State<AppState>, who: Principal) -> AppResult<Json<School>> {
    let mut conn = state.db.acquire().await?;
    Ok(Json(load_school(&mut conn, who.school_id).await?))
}

#[derive(Deserialize)]
pub struct SchoolPatch {
    pub name: Option<String>,
    pub legal_name: Option<String>,
    pub ico: Option<String>,
    pub address: Option<String>,
    pub registration_no: Option<String>,
    pub trade_licence_no: Option<String>,
    pub responsible_person: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

async fn patch_school(
    State(state): State<AppState>,
    who: Principal,
    JsonBody(p): JsonBody<SchoolPatch>,
) -> AppResult<Json<School>> {
    who.require_admin()?;
    if let Some(n) = &p.name {
        super::required("name", n)?;
    }
    sqlx::query(
        "UPDATE schools SET name = coalesce($2, name), legal_name = coalesce($3, legal_name), ico = coalesce($4, ico),
                address = coalesce($5, address), registration_no = coalesce($6, registration_no),
                trade_licence_no = coalesce($7, trade_licence_no), responsible_person = coalesce($8, responsible_person),
                phone = coalesce($9, phone), email = coalesce($10, email)
          WHERE id = $1",
    )
    .bind(who.school_id)
    .bind(p.name.map(|s| s.trim().to_owned()))
    .bind(p.legal_name)
    .bind(p.ico)
    .bind(p.address)
    .bind(p.registration_no)
    .bind(p.trade_licence_no)
    .bind(p.responsible_person)
    .bind(p.phone)
    .bind(p.email)
    .execute(&state.db)
    .await?;
    let mut conn = state.db.acquire().await?;
    Ok(Json(load_school(&mut conn, who.school_id).await?))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Instructor {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
    pub instructor_card_no: String,
    pub instructor_groups: String,
    pub active: bool,
}

async fn instructors(State(state): State<AppState>, who: Principal) -> AppResult<Json<Vec<Instructor>>> {
    Ok(Json(
        sqlx::query_as::<_, Instructor>(
            "SELECT id, name, email, role, instructor_card_no, instructor_groups, active
               FROM users WHERE school_id = $1 ORDER BY role, name",
        )
        .bind(who.school_id)
        .fetch_all(&state.db)
        .await?,
    ))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Branch {
    pub id: Uuid,
    pub name: String,
    pub address: String,
}

async fn branches(State(state): State<AppState>, who: Principal) -> AppResult<Json<Vec<Branch>>> {
    Ok(Json(
        sqlx::query_as::<_, Branch>("SELECT id, name, address FROM branches WHERE school_id = $1 ORDER BY name")
            .bind(who.school_id)
            .fetch_all(&state.db)
            .await?,
    ))
}

#[derive(Serialize)]
pub struct Overview {
    pub students_active: i64,
    pub students_linked: i64,
    pub groups_running: i64,
    pub groups_planned: i64,
    pub avg_readiness: Option<i32>,
    pub ready_count: i64,
    pub almost_ready_count: i64,
    pub attempts_7d: i64,
    pub active_students_7d: i64,
    pub exams_taken: i64,
    pub exams_passed: i64,
    pub upcoming_exams: Vec<UpcomingExam>,
    pub readiness_buckets: Vec<Bucket>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UpcomingExam {
    pub group_id: Uuid,
    pub group_name: String,
    pub exam_on: Date,
    pub students: i64,
}

#[derive(Serialize)]
pub struct Bucket {
    pub label: &'static str,
    pub count: i64,
}

async fn overview(State(state): State<AppState>, who: Principal) -> AppResult<Json<Overview>> {
    let mut conn = state.db.acquire().await?;
    let active_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT DISTINCT s.id FROM students s JOIN enrolments e ON e.student_id = s.id
          WHERE s.school_id = $1 AND e.status = 'active'",
    )
    .bind(who.school_id)
    .fetch_all(&mut *conn)
    .await?;
    let progress = readiness::for_students(&mut conn, &active_ids).await?;
    let linked: Vec<&readiness::Progress> = progress.values().filter(|p| p.linked).collect();
    let avg = if linked.is_empty() {
        None
    } else {
        Some((linked.iter().map(|p| p.score as f64).sum::<f64>() / linked.len() as f64).round() as i32)
    };
    let mut buckets = [("needsWork", 0i64), ("gettingThere", 0), ("almostReady", 0), ("ready", 0)];
    for p in &linked {
        if let Some(b) = buckets.iter_mut().find(|(l, _)| *l == p.label) {
            b.1 += 1;
        }
    }
    let (groups_running, groups_planned): (i64, i64) = sqlx::query_as(
        "SELECT count(*) FILTER (WHERE status = 'running'), count(*) FILTER (WHERE status = 'planned')
           FROM groups WHERE school_id = $1",
    )
    .bind(who.school_id)
    .fetch_one(&mut *conn)
    .await?;
    let (attempts_7d, active_students_7d): (i64, i64) = sqlx::query_as(
        "SELECT count(*), count(DISTINCT a.student_id) FROM app_attempts a JOIN students s ON s.id = a.student_id
          WHERE s.school_id = $1 AND a.answered_at > now() - interval '7 days'",
    )
    .bind(who.school_id)
    .fetch_one(&mut *conn)
    .await?;
    // First attempt per student, as the dashboard labels it.
    let (exams_taken, exams_passed): (i64, i64) = sqlx::query_as(
        "SELECT count(*), count(*) FILTER (WHERE passed) FROM (
           SELECT DISTINCT ON (r.student_id) r.passed FROM app_exam_results r JOIN students s ON s.id = r.student_id
            WHERE s.school_id = $1 ORDER BY r.student_id, r.taken_at ASC) first",
    )
    .bind(who.school_id)
    .fetch_one(&mut *conn)
    .await?;
    let upcoming = sqlx::query_as::<_, UpcomingExam>(
        "SELECT g.id AS group_id, g.name AS group_name, g.exam_on,
                (SELECT count(*) FROM enrolments e WHERE e.group_id = g.id AND e.status = 'active') AS students
           FROM groups g WHERE g.school_id = $1 AND g.exam_on IS NOT NULL AND g.exam_on >= CURRENT_DATE
          ORDER BY g.exam_on LIMIT 5",
    )
    .bind(who.school_id)
    .fetch_all(&mut *conn)
    .await?;
    Ok(Json(Overview {
        students_active: active_ids.len() as i64,
        students_linked: linked.len() as i64,
        groups_running,
        groups_planned,
        avg_readiness: avg,
        ready_count: linked.iter().filter(|p| p.score >= readiness::READY_THRESHOLD).count() as i64,
        almost_ready_count: linked.iter().filter(|p| p.score >= 85 && p.score < readiness::READY_THRESHOLD).count()
            as i64,
        attempts_7d,
        active_students_7d,
        exams_taken,
        exams_passed,
        upcoming_exams: upcoming,
        readiness_buckets: buckets.into_iter().map(|(label, count)| Bucket { label, count }).collect(),
    }))
}
