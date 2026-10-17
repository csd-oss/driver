//! Students: the list, one student's card with app progress, enrolment, driving lessons, join
//! codes and the generated documents.

use super::groups::{self, Training};
use super::{JsonBody, required};
use crate::auth::Principal;
use crate::error::{AppError, AppResult};
use crate::pdf;
use crate::readiness::{self, Progress};
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::PgConnection;
use time::{Date, Duration, OffsetDateTime, Time};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/v1/students", get(list).post(create))
        .route("/api/v1/students/{id}", get(detail).patch(patch))
        .route("/api/v1/students/{id}/enrol", post(enrol))
        .route("/api/v1/students/{id}/join-code", post(join_code))
        .route("/api/v1/students/{id}/driving-lessons", post(add_driving_lesson))
        .route("/api/v1/students/{id}/documents", get(list_documents).post(create_document))
        .route("/api/v1/groups/{id}/documents", post(create_group_document))
        .route("/api/v1/documents/{id}/pdf", get(document_pdf))
}

#[derive(Serialize, sqlx::FromRow, Clone)]
pub struct StudentRow {
    pub id: Uuid,
    pub register_no: i32,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: Option<Date>,
    pub birth_place: String,
    pub personal_id: String,
    pub address: String,
    pub email: String,
    pub phone: String,
    pub guardian_name: String,
    pub guardian_contact: String,
    pub guardian_consent_on: Option<Date>,
    pub medical_ok_on: Option<Date>,
    pub psych_ok_on: Option<Date>,
    pub education_doc_ok: bool,
    pub first_aid_ok_on: Option<Date>,
    pub needs_glasses: bool,
    pub privacy_notice_on: Option<Date>,
    pub app_consent_on: Option<Date>,
    pub notes: String,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    pub group_id: Option<Uuid>,
    pub group_name: Option<String>,
    pub enrolment_status: Option<String>,
}

const STUDENT_SELECT: &str = "SELECT s.id, s.register_no, s.first_name, s.last_name, s.birth_date, s.birth_place, s.personal_id,
       s.address, s.email, s.phone, s.guardian_name, s.guardian_contact, s.guardian_consent_on, s.medical_ok_on,
       s.psych_ok_on, s.education_doc_ok, s.first_aid_ok_on, s.needs_glasses, s.privacy_notice_on, s.app_consent_on,
       s.notes, s.created_at, g.id AS group_id, g.name AS group_name, g.status AS enrolment_status
  FROM students s
  LEFT JOIN LATERAL (SELECT g.id, g.name, e.status FROM enrolments e JOIN groups g ON g.id = e.group_id
                     WHERE e.student_id = s.id ORDER BY (e.status = 'active') DESC, e.enrolled_on DESC LIMIT 1) g ON true";

pub async fn load_student(conn: &mut PgConnection, school_id: Uuid, id: Uuid) -> AppResult<StudentRow> {
    sqlx::query_as::<_, StudentRow>(sqlx::AssertSqlSafe(format!("{STUDENT_SELECT} WHERE s.school_id = $1 AND s.id = $2")))
        .bind(school_id)
        .bind(id)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found("Žiak"))
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub q: Option<String>,
    pub group_id: Option<Uuid>,
}

#[derive(Serialize)]
pub struct StudentListItem {
    #[serde(flatten)]
    pub student: StudentRow,
    pub progress: Progress,
}

async fn list(State(state): State<AppState>, who: Principal, Query(q): Query<ListQuery>) -> AppResult<Json<Vec<StudentListItem>>> {
    let mut conn = state.db.acquire().await?;
    let pattern = q.q.as_deref().map(|s| format!("%{}%", s.trim().to_lowercase())).filter(|p| p.len() > 2);
    let rows = sqlx::query_as::<_, StudentRow>(sqlx::AssertSqlSafe(format!(
        "{STUDENT_SELECT} WHERE s.school_id = $1
            AND ($2::text IS NULL OR lower(s.first_name || ' ' || s.last_name) LIKE $2 OR lower(s.email) LIKE $2 OR s.register_no::text = trim(both '%' from $2))
            AND ($3::uuid IS NULL OR g.id = $3)
          ORDER BY s.last_name, s.first_name"
    )))
    .bind(who.school_id)
    .bind(pattern)
    .bind(q.group_id)
    .fetch_all(&mut *conn)
    .await?;
    let ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
    let mut progress = readiness::for_students(&mut conn, &ids).await?;
    Ok(Json(
        rows.into_iter()
            .map(|student| {
                let progress = progress.remove(&student.id).expect("entry");
                StudentListItem { student, progress }
            })
            .collect(),
    ))
}

#[derive(Deserialize, Default)]
pub struct StudentInput {
    pub first_name: String,
    pub last_name: String,
    pub birth_date: Option<Date>,
    pub birth_place: Option<String>,
    pub personal_id: Option<String>,
    pub address: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub guardian_name: Option<String>,
    pub guardian_contact: Option<String>,
    pub guardian_consent_on: Option<Date>,
    pub medical_ok_on: Option<Date>,
    pub psych_ok_on: Option<Date>,
    pub education_doc_ok: Option<bool>,
    pub first_aid_ok_on: Option<Date>,
    pub needs_glasses: Option<bool>,
    pub privacy_notice_on: Option<Date>,
    pub notes: Option<String>,
    pub group_id: Option<Uuid>,
    pub price_cents: Option<i32>,
}

async fn create(State(state): State<AppState>, who: Principal, JsonBody(s): JsonBody<StudentInput>) -> AppResult<Json<StudentRow>> {
    let first = required("first_name", &s.first_name)?;
    let last = required("last_name", &s.last_name)?;
    let mut tx = state.db.begin().await?;
    let id = Uuid::now_v7();
    let register_no: i32 = sqlx::query_scalar("SELECT coalesce(max(register_no), 0) + 1 FROM students WHERE school_id = $1")
        .bind(who.school_id)
        .fetch_one(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO students (id, school_id, register_no, first_name, last_name, birth_date, birth_place, personal_id, address,
                               email, phone, guardian_name, guardian_contact, guardian_consent_on, medical_ok_on, psych_ok_on,
                               education_doc_ok, first_aid_ok_on, needs_glasses, privacy_notice_on, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)",
    )
    .bind(id)
    .bind(who.school_id)
    .bind(register_no)
    .bind(&first)
    .bind(&last)
    .bind(s.birth_date)
    .bind(s.birth_place.unwrap_or_default())
    .bind(s.personal_id.unwrap_or_default())
    .bind(s.address.unwrap_or_default())
    .bind(s.email.unwrap_or_default())
    .bind(s.phone.unwrap_or_default())
    .bind(s.guardian_name.unwrap_or_default())
    .bind(s.guardian_contact.unwrap_or_default())
    .bind(s.guardian_consent_on)
    .bind(s.medical_ok_on)
    .bind(s.psych_ok_on)
    .bind(s.education_doc_ok.unwrap_or(false))
    .bind(s.first_aid_ok_on)
    .bind(s.needs_glasses.unwrap_or(false))
    .bind(s.privacy_notice_on)
    .bind(s.notes.unwrap_or_default())
    .execute(&mut *tx)
    .await?;
    if let Some(group_id) = s.group_id {
        enrol_in(&mut tx, who.school_id, id, group_id, s.price_cents).await?;
    }
    let row = load_student(&mut tx, who.school_id, id).await?;
    tx.commit().await?;
    Ok(Json(row))
}

#[derive(Deserialize, Default)]
pub struct StudentPatch {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub birth_date: Option<Option<Date>>,
    pub birth_place: Option<String>,
    pub personal_id: Option<String>,
    pub address: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub guardian_name: Option<String>,
    pub guardian_contact: Option<String>,
    pub guardian_consent_on: Option<Option<Date>>,
    pub medical_ok_on: Option<Option<Date>>,
    pub psych_ok_on: Option<Option<Date>>,
    pub education_doc_ok: Option<bool>,
    pub first_aid_ok_on: Option<Option<Date>>,
    pub needs_glasses: Option<bool>,
    pub privacy_notice_on: Option<Option<Date>>,
    pub notes: Option<String>,
}

async fn patch(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(p): JsonBody<StudentPatch>,
) -> AppResult<Json<StudentRow>> {
    let mut conn = state.db.acquire().await?;
    let c = load_student(&mut conn, who.school_id, id).await?;
    let first = match p.first_name { Some(v) => required("first_name", &v)?, None => c.first_name };
    let last = match p.last_name { Some(v) => required("last_name", &v)?, None => c.last_name };
    sqlx::query(
        "UPDATE students SET first_name = $2, last_name = $3, birth_date = $4, birth_place = $5, personal_id = $6, address = $7,
                email = $8, phone = $9, guardian_name = $10, guardian_contact = $11, guardian_consent_on = $12, medical_ok_on = $13,
                psych_ok_on = $14, education_doc_ok = $15, first_aid_ok_on = $16, needs_glasses = $17, privacy_notice_on = $18, notes = $19
          WHERE id = $1",
    )
    .bind(id)
    .bind(first)
    .bind(last)
    .bind(p.birth_date.unwrap_or(c.birth_date))
    .bind(p.birth_place.unwrap_or(c.birth_place))
    .bind(p.personal_id.unwrap_or(c.personal_id))
    .bind(p.address.unwrap_or(c.address))
    .bind(p.email.unwrap_or(c.email))
    .bind(p.phone.unwrap_or(c.phone))
    .bind(p.guardian_name.unwrap_or(c.guardian_name))
    .bind(p.guardian_contact.unwrap_or(c.guardian_contact))
    .bind(p.guardian_consent_on.unwrap_or(c.guardian_consent_on))
    .bind(p.medical_ok_on.unwrap_or(c.medical_ok_on))
    .bind(p.psych_ok_on.unwrap_or(c.psych_ok_on))
    .bind(p.education_doc_ok.unwrap_or(c.education_doc_ok))
    .bind(p.first_aid_ok_on.unwrap_or(c.first_aid_ok_on))
    .bind(p.needs_glasses.unwrap_or(c.needs_glasses))
    .bind(p.privacy_notice_on.unwrap_or(c.privacy_notice_on))
    .bind(p.notes.unwrap_or(c.notes))
    .execute(&mut *conn)
    .await?;
    Ok(Json(load_student(&mut conn, who.school_id, id).await?))
}

async fn enrol_in(conn: &mut PgConnection, school_id: Uuid, student_id: Uuid, group_id: Uuid, price_cents: Option<i32>) -> AppResult<()> {
    groups::load_group(conn, school_id, group_id).await?;
    sqlx::query("UPDATE enrolments SET status = 'transferred' WHERE student_id = $1 AND status = 'active' AND group_id <> $2")
        .bind(student_id)
        .bind(group_id)
        .execute(&mut *conn)
        .await?;
    sqlx::query(
        "INSERT INTO enrolments (id, student_id, group_id, price_cents) VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, group_id) DO UPDATE SET status = 'active', price_cents = coalesce(excluded.price_cents, enrolments.price_cents)",
    )
    .bind(Uuid::now_v7())
    .bind(student_id)
    .bind(group_id)
    .bind(price_cents)
    .execute(conn)
    .await?;
    Ok(())
}

#[derive(Deserialize)]
pub struct EnrolInput {
    pub group_id: Uuid,
    pub price_cents: Option<i32>,
    pub status: Option<String>,
}

/// `POST /api/v1/students/{id}/enrol`: move the student into a group (the previous active
/// enrolment becomes `transferred`), or set the status of the enrolment in that group.
async fn enrol(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(e): JsonBody<EnrolInput>,
) -> AppResult<Json<StudentRow>> {
    let mut tx = state.db.begin().await?;
    load_student(&mut tx, who.school_id, id).await?;
    match e.status.as_deref() {
        None | Some("active") => enrol_in(&mut tx, who.school_id, id, e.group_id, e.price_cents).await?,
        Some(s @ ("finished" | "withdrawn" | "transferred")) => {
            sqlx::query(
                "UPDATE enrolments SET status = $3, finished_on = CASE WHEN $3 = 'finished' THEN CURRENT_DATE ELSE finished_on END
                  WHERE student_id = $1 AND group_id = $2",
            )
            .bind(id)
            .bind(e.group_id)
            .bind(s)
            .execute(&mut *tx)
            .await?;
        }
        Some(_) => return Err(AppError::invalid("Stav musí byť active, finished, withdrawn alebo transferred.")),
    }
    let row = load_student(&mut tx, who.school_id, id).await?;
    tx.commit().await?;
    Ok(Json(row))
}

/// `POST /api/v1/students/{id}/join-code`: a one-use code for this student, valid 14 days.
async fn join_code(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Json<groups::JoinCode>> {
    let mut conn = state.db.acquire().await?;
    load_student(&mut conn, who.school_id, id).await?;
    Ok(Json(groups::new_code(&mut conn, who.school_id, None, Some(id), Some(who.user_id), Duration::days(14), Some(1)).await?))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct DrivingLesson {
    pub id: Uuid,
    pub held_on: Date,
    pub starts_at: Option<Time>,
    pub lessons: i32,
    pub kind: String,
    pub km: Option<i32>,
    pub vehicle: String,
    pub notes: String,
    pub instructor_id: Option<Uuid>,
    pub instructor_name: Option<String>,
}

#[derive(Deserialize)]
pub struct DrivingLessonInput {
    pub held_on: Date,
    pub starts_at: Option<Time>,
    pub lessons: Option<i32>,
    pub kind: Option<String>,
    pub km: Option<i32>,
    pub vehicle: Option<String>,
    pub notes: Option<String>,
    pub instructor_id: Option<Uuid>,
}

async fn add_driving_lesson(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(l): JsonBody<DrivingLessonInput>,
) -> AppResult<Json<Vec<DrivingLesson>>> {
    let kind = l.kind.unwrap_or_else(|| "CP".into());
    if !matches!(kind.as_str(), "AT" | "AC" | "CP" | "PU") {
        return Err(AppError::invalid("Druh jazdy musí byť AT, AC, CP alebo PU."));
    }
    let count = l.lessons.unwrap_or(1);
    let max = match kind.as_str() { "AT" | "AC" => 2, "CP" => 3, _ => 6 };
    if !(1..=max).contains(&count) {
        return Err(AppError::invalid(format!("Druh {kind} má najviac {max} vyučovacie hodiny denne (§ 8 ods. 11 vyhl. 45/2016).")));
    }
    let mut tx = state.db.begin().await?;
    let student = load_student(&mut tx, who.school_id, id).await?;
    sqlx::query(
        "INSERT INTO driving_lessons (id, student_id, group_id, instructor_id, held_on, starts_at, lessons, kind, km, vehicle, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
    )
    .bind(Uuid::now_v7())
    .bind(id)
    .bind(student.group_id)
    .bind(l.instructor_id.or(Some(who.user_id)))
    .bind(l.held_on)
    .bind(l.starts_at)
    .bind(count)
    .bind(&kind)
    .bind(l.km)
    .bind(l.vehicle.unwrap_or_default())
    .bind(l.notes.unwrap_or_default())
    .execute(&mut *tx)
    .await?;
    let rows = driving_lessons(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(rows))
}

pub async fn driving_lessons(conn: &mut PgConnection, student_id: Uuid) -> sqlx::Result<Vec<DrivingLesson>> {
    sqlx::query_as::<_, DrivingLesson>(
        "SELECT d.id, d.held_on, d.starts_at, d.lessons, d.kind, d.km, d.vehicle, d.notes, d.instructor_id, u.name AS instructor_name
           FROM driving_lessons d LEFT JOIN users u ON u.id = d.instructor_id
          WHERE d.student_id = $1 ORDER BY d.held_on DESC, d.starts_at DESC",
    )
    .bind(student_id)
    .fetch_all(conn)
    .await
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Enrolment {
    pub group_id: Uuid,
    pub group_name: String,
    pub category: String,
    pub status: String,
    pub enrolled_on: Date,
    pub price_cents: Option<i32>,
    pub paid_on: Option<Date>,
    pub finished_on: Option<Date>,
    pub exam_on: Option<Date>,
    pub theory_lessons_required: i32,
    pub driving_lessons_required: i32,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct SnapshotPoint {
    #[serde(with = "time::serde::rfc3339")]
    pub received_at: OffsetDateTime,
    pub readiness_score: i32,
    pub seen_count: i32,
    pub mistakes_count: i32,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MockPoint {
    #[serde(with = "time::serde::rfc3339")]
    pub completed_at: OffsetDateTime,
    pub score: i32,
    pub max_score: i32,
    pub passed: bool,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct CategoryStat {
    pub category_text: String,
    pub attempts: i64,
    pub correct: i64,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct DocumentRow {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
    pub created_by_name: Option<String>,
}

#[derive(Serialize)]
pub struct StudentDetail {
    #[serde(flatten)]
    pub student: StudentRow,
    pub progress: Progress,
    pub training: Training,
    pub enrolments: Vec<Enrolment>,
    pub driving_lessons: Vec<DrivingLesson>,
    pub snapshots: Vec<SnapshotPoint>,
    pub mocks: Vec<MockPoint>,
    pub weak_categories: Vec<CategoryStat>,
    pub documents: Vec<DocumentRow>,
    pub join_code: Option<groups::JoinCode>,
}

async fn list_docs(conn: &mut PgConnection, student_id: Uuid) -> sqlx::Result<Vec<DocumentRow>> {
    sqlx::query_as::<_, DocumentRow>(
        "SELECT d.id, d.kind, d.title, d.created_at, u.name AS created_by_name
           FROM documents d LEFT JOIN users u ON u.id = d.created_by
          WHERE d.student_id = $1 ORDER BY d.created_at DESC",
    )
    .bind(student_id)
    .fetch_all(conn)
    .await
}

async fn detail(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Json<StudentDetail>> {
    let mut conn = state.db.acquire().await?;
    let student = load_student(&mut conn, who.school_id, id).await?;
    let progress = readiness::for_student(&mut conn, id).await?;
    let enrolments = sqlx::query_as::<_, Enrolment>(
        "SELECT e.group_id, g.name AS group_name, g.category, e.status, e.enrolled_on, e.price_cents, e.paid_on, e.finished_on,
                g.exam_on, g.theory_lessons_required, g.driving_lessons_required
           FROM enrolments e JOIN groups g ON g.id = e.group_id WHERE e.student_id = $1 ORDER BY e.enrolled_on DESC",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let training = match student.group_id {
        Some(g) => {
            let (present, held): (i64, i64) = sqlx::query_as(
                "SELECT coalesce(sum(t.lessons) FILTER (WHERE a.present), 0),
                        (SELECT coalesce(sum(lessons), 0) FROM theory_lessons WHERE group_id = $2 AND held_on <= CURRENT_DATE)
                   FROM theory_attendance a JOIN theory_lessons t ON t.id = a.lesson_id
                  WHERE a.student_id = $1 AND t.group_id = $2",
            )
            .bind(id)
            .bind(g)
            .fetch_one(&mut *conn)
            .await?;
            let (lessons, km): (i64, i64) = sqlx::query_as(
                "SELECT coalesce(sum(lessons), 0), coalesce(sum(km), 0) FROM driving_lessons WHERE student_id = $1 AND kind <> 'PU'",
            )
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
            Training { theory_present: present, theory_held: held, driving_lessons: lessons, driving_km: km }
        }
        None => Training::default(),
    };
    let driving = driving_lessons(&mut conn, id).await?;
    let snapshots = sqlx::query_as::<_, SnapshotPoint>(
        "SELECT received_at, readiness_score, seen_count, mistakes_count FROM app_snapshots WHERE student_id = $1 ORDER BY received_at",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let mocks = sqlx::query_as::<_, MockPoint>(
        "SELECT completed_at, score, max_score, passed FROM app_mock_exams WHERE student_id = $1 ORDER BY completed_at DESC LIMIT 20",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let weak = sqlx::query_as::<_, CategoryStat>(
        "SELECT category_text, count(*) AS attempts, count(*) FILTER (WHERE is_correct) AS correct
           FROM app_attempts WHERE student_id = $1 AND category_text IS NOT NULL AND mode <> 'mock'
          GROUP BY category_text HAVING count(*) >= 5
          ORDER BY (count(*) FILTER (WHERE is_correct))::float / count(*) ASC, count(*) DESC LIMIT 6",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    let documents = list_docs(&mut conn, id).await?;
    let join_code = sqlx::query_as::<_, groups::JoinCode>(
        "SELECT code, expires_at, uses_left FROM join_codes
          WHERE student_id = $1 AND expires_at > now() AND (uses_left IS NULL OR uses_left > 0) ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(Json(StudentDetail {
        student,
        progress,
        training,
        enrolments,
        driving_lessons: driving,
        snapshots,
        mocks,
        weak_categories: weak,
        documents,
        join_code,
    }))
}

async fn list_documents(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Json<Vec<DocumentRow>>> {
    let mut conn = state.db.acquire().await?;
    load_student(&mut conn, who.school_id, id).await?;
    Ok(Json(list_docs(&mut conn, id).await?))
}

#[derive(Deserialize)]
pub struct DocumentInput {
    /// `agreement` | `certificate` | `guardian_consent` | `progress_report`
    pub kind: String,
    /// Free fields the document needs beyond what the database holds (price, dates, place…).
    #[serde(default)]
    pub fields: Value,
}

/// `POST /api/v1/students/{id}/documents`: render the PDF, keep it, answer with its row.
async fn create_document(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(d): JsonBody<DocumentInput>,
) -> AppResult<Json<DocumentRow>> {
    let mut tx = state.db.begin().await?;
    let school = super::school::load_school(&mut tx, who.school_id).await?;
    let student = load_student(&mut tx, who.school_id, id).await?;
    let enrolment = sqlx::query_as::<_, Enrolment>(
        "SELECT e.group_id, g.name AS group_name, g.category, e.status, e.enrolled_on, e.price_cents, e.paid_on, e.finished_on,
                g.exam_on, g.theory_lessons_required, g.driving_lessons_required
           FROM enrolments e JOIN groups g ON g.id = e.group_id WHERE e.student_id = $1
          ORDER BY (e.status = 'active') DESC, e.enrolled_on DESC LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let group = match &enrolment {
        Some(e) => Some(groups::load_group(&mut tx, who.school_id, e.group_id).await?),
        None => None,
    };
    let progress = readiness::for_student(&mut tx, id).await?;
    let driving = driving_lessons(&mut tx, id).await?;
    let ctx = pdf::StudentContext { school: &school, student: &student, enrolment: enrolment.as_ref(), group: group.as_ref(), progress: &progress, driving: &driving, fields: &d.fields, issued_by: &who.name };
    let (title, bytes) = match d.kind.as_str() {
        "agreement" => ("Zmluva o výcviku", pdf::training_agreement(&ctx)?),
        "certificate" => ("Potvrdenie o absolvovaní kurzu", pdf::course_certificate(&ctx)?),
        "guardian_consent" => ("Súhlas zákonného zástupcu a informácia o spracúvaní osobných údajov", pdf::guardian_consent(&ctx)?),
        "progress_report" => ("Výpis z prípravy na skúšku", pdf::progress_report(&ctx)?),
        other => return Err(AppError::invalid(format!("Neznámy druh dokumentu `{other}`."))),
    };
    let doc_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO documents (id, school_id, student_id, group_id, kind, title, created_by, payload, pdf)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    )
    .bind(doc_id)
    .bind(who.school_id)
    .bind(id)
    .bind(enrolment.as_ref().map(|e| e.group_id))
    .bind(&d.kind)
    .bind(title)
    .bind(who.user_id)
    .bind(sqlx::types::Json(json!({ "fields": d.fields, "student": student.register_no, "readiness": progress.score })))
    .bind(&bytes)
    .execute(&mut *tx)
    .await?;
    if d.kind == "certificate"
        && let Some(e) = &enrolment {
            sqlx::query("UPDATE enrolments SET certificate_issued_on = coalesce(certificate_issued_on, CURRENT_DATE) WHERE student_id = $1 AND group_id = $2")
                .bind(id)
                .bind(e.group_id)
                .execute(&mut *tx)
                .await?;
        }
    let docs = list_docs(&mut tx, id).await?;
    tx.commit().await?;
    docs.into_iter().find(|x| x.id == doc_id).map(Json).ok_or_else(AppError::internal)
}

#[derive(Deserialize)]
pub struct GroupDocumentInput {
    /// `exam_application` (Prihláška na skúšku z odbornej spôsobilosti) | `attendance_sheet`
    pub kind: String,
    /// Students to include; omitted = every active student of the group.
    pub student_ids: Option<Vec<Uuid>>,
    #[serde(default)]
    pub fields: Value,
}

#[derive(Serialize)]
pub struct GroupDocumentOut {
    pub id: Uuid,
    pub kind: String,
    pub title: String,
}

/// `POST /api/v1/groups/{id}/documents`: a document about several students at once.
async fn create_group_document(
    State(state): State<AppState>,
    who: Principal,
    Path(id): Path<Uuid>,
    JsonBody(d): JsonBody<GroupDocumentInput>,
) -> AppResult<Json<GroupDocumentOut>> {
    let mut tx = state.db.begin().await?;
    let school = super::school::load_school(&mut tx, who.school_id).await?;
    let group = groups::load_group(&mut tx, who.school_id, id).await?;
    let mut students = sqlx::query_as::<_, StudentRow>(sqlx::AssertSqlSafe(format!(
        "{STUDENT_SELECT} JOIN enrolments e ON e.student_id = s.id AND e.group_id = $2
          WHERE s.school_id = $1 AND e.status IN ('active', 'finished') ORDER BY s.last_name, s.first_name"
    )))
    .bind(who.school_id)
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    if let Some(ids) = &d.student_ids {
        students.retain(|s| ids.contains(&s.id));
    }
    if students.is_empty() {
        return Err(AppError::invalid("V kurze nie je nikto, koho by sme do dokumentu dali."));
    }
    let lessons = groups::list_lessons(&mut tx, id).await?;
    let ctx = pdf::GroupContext { school: &school, group: &group, students: &students, lessons: &lessons, fields: &d.fields, issued_by: &who.name };
    let (title, bytes) = match d.kind.as_str() {
        "exam_application" => ("Prihláška na skúšku z odbornej spôsobilosti", pdf::exam_application(&ctx)?),
        "attendance_sheet" => ("Prezenčná listina výučby teórie", pdf::attendance_sheet(&ctx)?),
        other => return Err(AppError::invalid(format!("Neznámy druh dokumentu `{other}`."))),
    };
    let doc_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO documents (id, school_id, student_id, group_id, kind, title, created_by, payload, pdf)
         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)",
    )
    .bind(doc_id)
    .bind(who.school_id)
    .bind(id)
    .bind(&d.kind)
    .bind(title)
    .bind(who.user_id)
    .bind(sqlx::types::Json(json!({ "fields": d.fields, "students": students.iter().map(|s| s.id).collect::<Vec<_>>() })))
    .bind(&bytes)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(GroupDocumentOut { id: doc_id, kind: d.kind, title: title.to_owned() }))
}

/// `GET /api/v1/documents/{id}/pdf`: the stored PDF, inline.
async fn document_pdf(State(state): State<AppState>, who: Principal, Path(id): Path<Uuid>) -> AppResult<Response> {
    let row: Option<(String, Vec<u8>)> =
        sqlx::query_as("SELECT title, pdf FROM documents WHERE id = $1 AND school_id = $2")
            .bind(id)
            .bind(who.school_id)
            .fetch_optional(&state.db)
            .await?;
    let (title, pdf) = row.ok_or_else(|| AppError::not_found("Dokument"))?;
    let filename: String = title.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    let mut res = pdf.into_response();
    let h = res.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/pdf"));
    if let Ok(v) = HeaderValue::from_str(&format!("inline; filename=\"{filename}.pdf\"")) {
        h.insert(header::CONTENT_DISPOSITION, v);
    }
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
    Ok(res)
}
