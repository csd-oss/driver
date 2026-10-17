//! Courses (groups): list, create, detail with every student's progress, join codes, theory
//! lessons and attendance.

use super::{JsonBody, required};
use crate::auth::Principal;
use crate::crypto::readable_code;
use crate::error::{AppError, AppResult};
use crate::readiness::{self, Progress};
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, State};
use axum::routing::{get, post, put};
use axum::Router;
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use time::{Date, Duration, OffsetDateTime, Time};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/v1/groups", get(list).post(create))
        .route("/api/v1/groups/{id}", get(detail).patch(patch))
        .route("/api/v1/groups/{id}/join-code", post(join_code))
        .route("/api/v1/groups/{id}/lessons", get(lessons).post(add_lesson))
        .route("/api/v1/lessons/{id}/attendance", put(set_attendance))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct GroupRow {
    pub id: Uuid,
    pub name: String,
    pub category: String,
    pub jiscd_course_no: String,
    pub branch_id: Option<Uuid>,
    pub branch_name: Option<String>,
    pub starts_on: Option<Date>,
    pub ends_on: Option<Date>,
    pub exam_on: Option<Date>,
    pub lead_instructor_id: Option<Uuid>,
    pub lead_instructor_name: Option<String>,
    pub theory_lessons_required: i32,
    pub driving_lessons_required: i32,
    pub status: String,
    pub students_count: i64,
    pub theory_lessons_held: i64,
}

const GROUP_SELECT: &str = "SELECT g.id, g.name, g.category, g.jiscd_course_no, g.branch_id, b.name AS branch_name,
       g.starts_on, g.ends_on, g.exam_on, g.lead_instructor_id, u.name AS lead_instructor_name,
       g.theory_lessons_required, g.driving_lessons_required, g.status,
       (SELECT count(*) FROM enrolments e WHERE e.group_id = g.id AND e.status = 'active') AS students_count,
       (SELECT coalesce(sum(lessons), 0) FROM theory_lessons t WHERE t.group_id = g.id AND t.held_on <= CURRENT_DATE) AS theory_lessons_held
  FROM groups g LEFT JOIN branches b ON b.id = g.branch_id LEFT JOIN users u ON u.id = g.lead_instructor_id";

pub async fn load_group(conn: &mut PgConnection, school_id: Uuid, id: Uuid) -> AppResult<GroupRow> {
    sqlx::query_as::<_, GroupRow>(sqlx::AssertSqlSafe(format!("{GROUP_SELECT} WHERE g.school_id = $1 AND g.id = $2")))
        .bind(school_id)
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found("Kurz"))
}

#[derive(Serialize)]
pub struct GroupListItem {
    #[serde(flatten)]
    pub group: GroupRow,
    pub stats: GroupStats,
}

#[derive(Serialize, Default)]
pub struct GroupStats {
    pub linked: i64,
    pub avg_readiness: Option<i32>,
    pub ready_count: i64,
    pub almost_ready_count: i64,
    pub active_7d: i64,
    pub avg_theory_attendance: Option<i32>,
    pub avg_driving_lessons: Option<f64>,
}

#[derive(sqlx::FromRow)]
struct AttendanceAgg {
    student_id: Uuid,
    present: i64,
}

#[derive(sqlx::FromRow)]
struct DrivingAgg {
    student_id: Uuid,
    lessons: i64,
    km: i64,
}

/// Per-student numbers a group screen shows next to the app progress.
#[derive(Serialize, Default, Clone)]
pub struct Training {
    pub theory_present: i64,
    pub theory_held: i64,
    pub driving_lessons: i64,
    pub driving_km: i64,
}

async fn training_for(
    conn: &mut PgConnection,
    group_id: Uuid,
    ids: &[Uuid],
) -> sqlx::Result<std::collections::HashMap<Uuid, Training>> {
    let held: i64 = sqlx::query_scalar(
        "SELECT coalesce(sum(lessons), 0) FROM theory_lessons WHERE group_id = $1 AND held_on <= CURRENT_DATE",
    )
    .bind(group_id)
    .fetch_one(&mut *conn)
    .await?;
    let mut out: std::collections::HashMap<Uuid, Training> =
        ids.iter().map(|id| (*id, Training { theory_held: held, ..Default::default() })).collect();
    let present = sqlx::query_as::<_, AttendanceAgg>(
        "SELECT a.student_id, coalesce(sum(t.lessons), 0) AS present
           FROM theory_attendance a JOIN theory_lessons t ON t.id = a.lesson_id
          WHERE t.group_id = $1 AND t.held_on <= CURRENT_DATE AND a.present AND a.student_id = ANY($2) GROUP BY a.student_id",
    )
    .bind(group_id)
    .bind(ids)
    .fetch_all(&mut *conn)
    .await?;
    for p in present {
        if let Some(t) = out.get_mut(&p.student_id) {
            t.theory_present = p.present;
        }
    }
    // Lessons of this course only (the curriculum's 39 h for B include the practical-maintenance lesson).
    let driving = sqlx::query_as::<_, DrivingAgg>(
        "SELECT student_id, coalesce(sum(lessons), 0) AS lessons, coalesce(sum(km), 0) AS km
           FROM driving_lessons WHERE student_id = ANY($1) AND group_id = $2 GROUP BY student_id",
    )
    .bind(ids)
    .bind(group_id)
    .fetch_all(&mut *conn)
    .await?;
    for d in driving {
        if let Some(t) = out.get_mut(&d.student_id) {
            t.driving_lessons = d.lessons;
            t.driving_km = d.km;
        }
    }
    Ok(out)
}

fn stats_of(progress: &[&Progress], training: &[&Training]) -> GroupStats {
    let linked: Vec<&&Progress> = progress.iter().filter(|p| p.linked).collect();
    let avg = (!linked.is_empty())
        .then(|| (linked.iter().map(|p| p.score as f64).sum::<f64>() / linked.len() as f64).round() as i32);
    let attendance: Vec<f64> = training
        .iter()
        .filter(|t| t.theory_held > 0)
        .map(|t| t.theory_present as f64 / t.theory_held as f64 * 100.0)
        .collect();
    let avg_att = (!attendance.is_empty()).then(|| (attendance.iter().sum::<f64>() / attendance.len() as f64).round() as i32);
    let avg_drive = (!training.is_empty())
        .then(|| (training.iter().map(|t| t.driving_lessons as f64).sum::<f64>() / training.len() as f64 * 10.0).round() / 10.0);
    GroupStats {
        linked: linked.len() as i64,
        avg_readiness: avg,
        ready_count: linked.iter().filter(|p| p.score >= readiness::READY_THRESHOLD).count() as i64,
        almost_ready_count: linked.iter().filter(|p| p.score >= 85 && p.score < readiness::READY_THRESHOLD).count() as i64,
        active_7d: linked.iter().filter(|p| p.attempts_7d > 0).count() as i64,
        avg_theory_attendance: avg_att,
        avg_driving_lessons: avg_drive,
    }
}

/// A branch id must belong to the school (a foreign key only proves it exists somewhere).
pub async fn check_branch(conn: &mut PgConnection, school_id: Uuid, branch_id: Option<Uuid>) -> AppResult<()> {
    if let Some(id) = branch_id {
        let ok: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM branches WHERE id = $1 AND school_id = $2)")
            .bind(id)
            .bind(school_id)
            .fetch_one(conn)
            .await?;
        if !ok {
            return Err(AppError::not_found("Pobočka"));
        }
    }
    Ok(())
}

/// An instructor id must be a user of the school.
pub async fn check_user(conn: &mut PgConnection, school_id: Uuid, user_id: Option<Uuid>) -> AppResult<()> {
    if let Some(id) = user_id {
        let ok: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND school_id = $2)")
            .bind(id)
            .bind(school_id)
            .fetch_one(conn)
            .await?;
        if !ok {
            return Err(AppError::not_found("Inštruktor"));
        }
    }
    Ok(())
}

/// Serde: distinguish an omitted field (`None`) from JSON `null` (`Some(None)`), so a PATCH can clear a value.
pub fn double_option<'de, T, D>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    serde::Deserialize::deserialize(d).map(Some)
}

async fn active_student_ids(conn: &mut PgConnection, group_id: Uuid) -> sqlx::Result<Vec<Uuid>> {
    sqlx::query_scalar("SELECT student_id FROM enrolments WHERE group_id = $1 AND status = 'active'")
        .bind(group_id)
        .fetch_all(conn)
        .await
}

async fn list(State(state): State<AppState>, who: Principal) -> AppResult<Json<Vec<GroupListItem>>> {
    let mut conn = state.db.acquire().await?;
    let groups = sqlx::query_as::<_, GroupRow>(sqlx::AssertSqlSafe(format!(
        "{GROUP_SELECT} WHERE g.school_id = $1 ORDER BY (g.status = 'running') DESC, g.starts_on DESC NULLS LAST, g.name"
    )))
    .bind(who.school_id)
    .fetch_all(&mut *conn)
    .await?;
    let mut out = Vec::with_capacity(groups.len());
    for group in groups {
        let ids = active_student_ids(&mut conn, group.id).await?;
        let progress = readiness::for_students(&mut conn, &ids).await?;
        let training = training_for(&mut conn, group.id, &ids).await?;
        let stats = stats_of(&progress.values().collect::<Vec<_>>(), &training.values().collect::<Vec<_>>());
        out.push(GroupListItem { group, stats });
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct GroupInput {
    pub name: String,
    pub category: Option<String>,
    pub branch_id: Option<Uuid>,
    pub jiscd_course_no: Option<String>,
    pub starts_on: Option<Date>,
    pub ends_on: Option<Date>,
    pub exam_on: Option<Date>,
    pub lead_instructor_id: Option<Uuid>,
    pub theory_lessons_required: Option<i32>,
    pub driving_lessons_required: Option<i32>,
    pub status: Option<String>,
}

fn check_status(s: &str) -> AppResult<()> {
    if matches!(s, "planned" | "running" | "finished" | "archived") {
        Ok(())
    } else {
        Err(AppError::invalid("Stav kurzu musí byť planned, running, finished alebo archived."))
    }
}

async fn create(State(state): State<AppState>, who: Principal, JsonBody(g): JsonBody<GroupInput>) -> AppResult<Json<GroupRow>> {
    let name = required("name", &g.name)?;
    let status = g.status.unwrap_or_else(|| "planned".into());
    check_status(&status)?;
    let mut conn = state.db.acquire().await?;
    check_branch(&mut conn, who.school_id, g.branch_id).await?;
    check_user(&mut conn, who.school_id, g.lead_instructor_id).await?;
    let id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO groups (id, school_id, branch_id, name, category, jiscd_course_no, starts_on, ends_on, exam_on,
                             lead_instructor_id, theory_lessons_required, driving_lessons_required, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
    )
    .bind(id)
    .bind(who.school_id)
    .bind(g.branch_id)
    .bind(&name)
    .bind(g.category.unwrap_or_else(|| "B".into()))
    .bind(g.jiscd_course_no.unwrap_or_default())
    .bind(g.starts_on)
    .bind(g.ends_on)
    .bind(g.exam_on)
    .bind(g.lead_instructor_id)
    .bind(g.theory_lessons_required.unwrap_or(32))
    .bind(g.driving_lessons_required.unwrap_or(39))
    .bind(&status)
    .execute(&mut *conn)
    .await?;
    Ok(Json(load_group(&mut conn, who.school_id, id).await?))
}

#[derive(Deserialize)]
pub struct GroupPatch {
    pub name: Option<String>,
    pub category: Option<String>,
    pub jiscd_course_no: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub starts_on: Option<Option<Date>>,
    #[serde(default, deserialize_with = "double_option")]
    pub ends_on: Option<Option<Date>>,
    #[serde(default, deserialize_with = "double_option")]
    pub exam_on: Option<Option<Date>>,
    #[serde(default, deserialize_with = "double_option")]
    pub lead_instructor_id: Option<Option<Uuid>>,
    pub status: Option<String>,
}

async fn patch(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(p): JsonBody<GroupPatch>,
) -> AppResult<Json<GroupRow>> {
    let mut conn = state.db.acquire().await?;
    let current = load_group(&mut conn, who.school_id, id).await?;
    if let Some(s) = &p.status {
        check_status(s)?;
    }
    if let Some(Some(instructor)) = p.lead_instructor_id {
        check_user(&mut conn, who.school_id, Some(instructor)).await?;
    }
    let name = match p.name {
        Some(n) => required("name", &n)?,
        None => current.name,
    };
    sqlx::query(
        "UPDATE groups SET name = $2, category = $3, jiscd_course_no = $4, starts_on = $5, ends_on = $6, exam_on = $7,
                lead_instructor_id = $8, status = $9 WHERE id = $1",
    )
    .bind(id)
    .bind(name)
    .bind(p.category.unwrap_or(current.category))
    .bind(p.jiscd_course_no.unwrap_or(current.jiscd_course_no))
    .bind(p.starts_on.unwrap_or(current.starts_on))
    .bind(p.ends_on.unwrap_or(current.ends_on))
    .bind(p.exam_on.unwrap_or(current.exam_on))
    .bind(p.lead_instructor_id.unwrap_or(current.lead_instructor_id))
    .bind(p.status.unwrap_or(current.status))
    .execute(&mut *conn)
    .await?;
    Ok(Json(load_group(&mut conn, who.school_id, id).await?))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct GroupStudent {
    pub id: Uuid,
    pub register_no: i32,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: Option<Date>,
    pub email: String,
    pub phone: String,
    pub enrolment_status: String,
    pub enrolled_on: Date,
}

#[derive(Serialize)]
pub struct GroupStudentOut {
    #[serde(flatten)]
    pub student: GroupStudent,
    pub progress: Progress,
    pub training: Training,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct JoinCode {
    pub code: String,
    #[serde(with = "time::serde::rfc3339")]
    pub expires_at: OffsetDateTime,
    pub uses_left: Option<i32>,
}

#[derive(Serialize)]
pub struct GroupDetail {
    #[serde(flatten)]
    pub group: GroupRow,
    pub stats: GroupStats,
    pub students: Vec<GroupStudentOut>,
    pub join_code: Option<JoinCode>,
}

async fn detail(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Json<GroupDetail>> {
    let mut conn = state.db.acquire().await?;
    let group = load_group(&mut conn, who.school_id, id).await?;
    let students = sqlx::query_as::<_, GroupStudent>(
        "SELECT s.id, s.register_no, s.first_name, s.last_name, s.birth_date, s.email, s.phone,
                e.status AS enrolment_status, e.enrolled_on
           FROM enrolments e JOIN students s ON s.id = e.student_id
          WHERE e.group_id = $1 ORDER BY (e.status = 'active') DESC, s.last_name, s.first_name",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let ids: Vec<Uuid> = students.iter().map(|s| s.id).collect();
    let mut progress = readiness::for_students(&mut conn, &ids).await?;
    let mut training = training_for(&mut conn, id, &ids).await?;
    let active: Vec<Uuid> =
        students.iter().filter(|s| s.enrolment_status == "active").map(|s| s.id).collect();
    let stats = stats_of(
        &active.iter().filter_map(|i| progress.get(i)).collect::<Vec<_>>(),
        &active.iter().filter_map(|i| training.get(i)).collect::<Vec<_>>(),
    );
    let join_code = sqlx::query_as::<_, JoinCode>(
        "SELECT code, expires_at, uses_left FROM join_codes
          WHERE group_id = $1 AND student_id IS NULL AND expires_at > now() AND (uses_left IS NULL OR uses_left > 0)
          ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;
    let students = students
        .into_iter()
        .map(|s| {
            let progress = progress.remove(&s.id).expect("every student has an entry");
            let training = training.remove(&s.id).unwrap_or_default();
            GroupStudentOut { student: s, progress, training }
        })
        .collect();
    Ok(Json(GroupDetail { group, stats, students, join_code }))
}

/// `POST /api/v1/groups/{id}/join-code`: a fresh code the whole group can use for 30 days.
async fn join_code(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Json<JoinCode>> {
    let mut conn = state.db.acquire().await?;
    load_group(&mut conn, who.school_id, id).await?;
    let code = new_code(&mut conn, who.school_id, Some(id), None, Some(who.user_id), Duration::days(30), None).await?;
    Ok(Json(code))
}

/// Insert a join code, retrying on the (unlikely) collision.
pub async fn new_code(
    conn: &mut PgConnection,
    school_id: Uuid,
    group_id: Option<Uuid>,
    student_id: Option<Uuid>,
    created_by: Option<Uuid>,
    valid_for: Duration,
    uses_left: Option<i32>,
) -> AppResult<JoinCode> {
    let expires_at = OffsetDateTime::now_utc() + valid_for;
    // A new code replaces the old ones: "Nový kód" is how a school retires a code that leaked.
    sqlx::query(
        "UPDATE join_codes SET expires_at = now()
          WHERE expires_at > now() AND school_id = $1 AND group_id IS NOT DISTINCT FROM $2 AND student_id IS NOT DISTINCT FROM $3",
    )
    .bind(school_id)
    .bind(group_id)
    .bind(student_id)
    .execute(&mut *conn)
    .await?;
    for _ in 0..5 {
        let code = readable_code(8);
        let res = sqlx::query(
            "INSERT INTO join_codes (id, school_id, group_id, student_id, code, created_by, expires_at, uses_left)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(Uuid::now_v7())
        .bind(school_id)
        .bind(group_id)
        .bind(student_id)
        .bind(&code)
        .bind(created_by)
        .bind(expires_at)
        .bind(uses_left)
        .execute(&mut *conn)
        .await;
        match res {
            Ok(_) => return Ok(JoinCode { code, expires_at, uses_left }),
            Err(e) if crate::error::is_unique_violation(&e, "join_codes_code_key") => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(AppError::internal())
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Lesson {
    pub id: Uuid,
    pub held_on: Date,
    pub starts_at: Option<Time>,
    pub lessons: i32,
    pub subject: String,
    pub topic: String,
    pub instructor_id: Option<Uuid>,
    pub instructor_name: Option<String>,
    pub present_count: i64,
    pub present_ids: Vec<Uuid>,
}

async fn lessons(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Json<Vec<Lesson>>> {
    let mut conn = state.db.acquire().await?;
    load_group(&mut conn, who.school_id, id).await?;
    Ok(Json(list_lessons(&mut conn, id).await?))
}

pub async fn list_lessons(conn: &mut PgConnection, group_id: Uuid) -> sqlx::Result<Vec<Lesson>> {
    sqlx::query_as::<_, Lesson>(
        "SELECT t.id, t.held_on, t.starts_at, t.lessons, t.subject, t.topic, t.instructor_id, u.name AS instructor_name,
                (SELECT count(*) FROM theory_attendance a WHERE a.lesson_id = t.id AND a.present) AS present_count,
                coalesce((SELECT array_agg(a.student_id) FROM theory_attendance a WHERE a.lesson_id = t.id AND a.present), '{}') AS present_ids
           FROM theory_lessons t LEFT JOIN users u ON u.id = t.instructor_id
          WHERE t.group_id = $1 ORDER BY t.held_on, t.starts_at",
    )
    .bind(group_id)
    .fetch_all(conn)
    .await
}

#[derive(Deserialize)]
pub struct LessonInput {
    pub held_on: Date,
    pub starts_at: Option<Time>,
    pub lessons: Option<i32>,
    pub subject: Option<String>,
    pub topic: Option<String>,
    pub instructor_id: Option<Uuid>,
    /// Students present; omitted = everybody active in the group.
    pub present_ids: Option<Vec<Uuid>>,
}

async fn add_lesson(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(l): JsonBody<LessonInput>,
) -> AppResult<Json<Lesson>> {
    let subject = l.subject.unwrap_or_else(|| "PCP".into());
    if !matches!(subject.as_str(), "PCP" | "NVU" | "TVV" | "ZBJ" | "OP") {
        return Err(AppError::invalid("Predmet musí byť PCP, NVU, TVV, ZBJ alebo OP."));
    }
    let count = l.lessons.unwrap_or(1);
    if !(1..=6).contains(&count) {
        return Err(AppError::invalid("Jeden blok má 1 až 6 vyučovacích hodín (§ 8 ods. 2 vyhl. 45/2016)."));
    }
    let mut tx = state.db.begin().await?;
    load_group(&mut tx, who.school_id, id).await?;
    check_user(&mut tx, who.school_id, l.instructor_id).await?;
    let lesson_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO theory_lessons (id, group_id, instructor_id, held_on, starts_at, lessons, subject, topic)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(lesson_id)
    .bind(id)
    .bind(l.instructor_id.or(Some(who.user_id)))
    .bind(l.held_on)
    .bind(l.starts_at)
    .bind(count)
    .bind(&subject)
    .bind(l.topic.unwrap_or_default())
    .execute(&mut *tx)
    .await?;
    let present = match l.present_ids {
        Some(ids) => ids,
        None => active_student_ids(&mut tx, id).await?,
    };
    write_attendance(&mut tx, lesson_id, id, &present).await?;
    let lessons = list_lessons(&mut tx, id).await?;
    tx.commit().await?;
    lessons.into_iter().find(|x| x.id == lesson_id).map(Json).ok_or_else(AppError::internal)
}

/// Mark who was there. Active members not in `present` are marked absent; rows of students who
/// have since left the course are kept as they were (history), unless `present` names them.
async fn write_attendance(conn: &mut PgConnection, lesson_id: Uuid, group_id: Uuid, present: &[Uuid]) -> AppResult<()> {
    let members = active_student_ids(conn, group_id).await?;
    // Only students who were ever enrolled in this course can be marked present.
    let eligible: Vec<Uuid> = sqlx::query_scalar("SELECT student_id FROM enrolments WHERE group_id = $1 AND student_id = ANY($2)")
        .bind(group_id)
        .bind(present)
        .fetch_all(&mut *conn)
        .await?;
    let mut rows: Vec<(Uuid, bool)> = members.iter().map(|s| (*s, present.contains(s))).collect();
    for s in eligible {
        if !members.contains(&s) {
            rows.push((s, true));
        }
    }
    for (s, there) in rows {
        sqlx::query(
            "INSERT INTO theory_attendance (lesson_id, student_id, present) VALUES ($1, $2, $3)
             ON CONFLICT (lesson_id, student_id) DO UPDATE SET present = excluded.present",
        )
        .bind(lesson_id)
        .bind(s)
        .bind(there)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct AttendanceInput {
    pub present_ids: Vec<Uuid>,
}

/// `PUT /api/v1/lessons/{id}/attendance`: who was there (everybody else in the group is absent).
async fn set_attendance(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(a): JsonBody<AttendanceInput>,
) -> AppResult<Json<Lesson>> {
    let mut tx = state.db.begin().await?;
    let group_id: Uuid = sqlx::query_scalar(
        "SELECT t.group_id FROM theory_lessons t JOIN groups g ON g.id = t.group_id WHERE t.id = $1 AND g.school_id = $2",
    )
    .bind(id)
    .bind(who.school_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::not_found("Hodina"))?;
    write_attendance(&mut tx, id, group_id, &a.present_ids).await?;
    let lessons = list_lessons(&mut tx, group_id).await?;
    tx.commit().await?;
    lessons.into_iter().find(|x| x.id == id).map(Json).ok_or_else(AppError::internal)
}
