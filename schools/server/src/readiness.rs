//! The app's readiness formula (src/lib/readiness.js `scoreComponents`), ported so the dashboard
//! scores every student the same way the app does, from the events the app synced.
//!
//! Weights: open mistakes 30, 7-day accuracy 25, mock exams 30, coverage 15. "Ready" is ≥ 97.
//! What the server cannot derive from raw events (open mistakes, bank size, the forecast, the
//! streak) comes from the latest snapshot the app sent.

use serde::Serialize;
use sqlx::PgConnection;
use std::collections::HashMap;
use time::OffsetDateTime;
use uuid::Uuid;

pub const READY_THRESHOLD: i32 = 97;
const MIN_QUESTIONS_FOR_MISTAKES: i64 = 50;
const MIN_COVERAGE_FOR_MISTAKES: f64 = 0.10;
const MIN_ATTEMPTS_FOR_PERFORMANCE: i64 = 10;

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
pub struct Components {
    pub mistakes: f64,
    pub performance: f64,
    pub mock: f64,
    pub coverage: f64,
    pub overall: i32,
}

pub fn label(score: i32) -> &'static str {
    if score >= 97 {
        "ready"
    } else if score >= 85 {
        "almostReady"
    } else if score >= 60 {
        "gettingThere"
    } else {
        "needsWork"
    }
}

/// `mock_history` is newest first: 60 % lifetime pass rate, 40 % pass rate of the last three.
pub fn mock_score(mock_history: &[bool]) -> f64 {
    if mock_history.is_empty() {
        return 0.0;
    }
    let passed = mock_history.iter().filter(|p| **p).count() as f64;
    let pass_rate = passed / mock_history.len() as f64 * 100.0;
    let recent = &mock_history[..mock_history.len().min(3)];
    let recent_rate = recent.iter().filter(|p| **p).count() as f64 / recent.len() as f64 * 100.0;
    pass_rate * 0.6 + recent_rate * 0.4
}

pub fn score_components(
    total_questions: i64,
    seen_count: i64,
    mistakes_count: i64,
    accuracy_7d: Option<i32>,
    attempts_7d: i64,
    mock_history: &[bool],
) -> Components {
    let total = total_questions.max(0);
    let seen = seen_count.max(0);
    let coverage_ratio = if total > 0 { seen as f64 / total as f64 } else { 0.0 };
    let enough_mistake_data = seen >= MIN_QUESTIONS_FOR_MISTAKES || coverage_ratio >= MIN_COVERAGE_FOR_MISTAKES;
    let mistakes = if enough_mistake_data {
        let ratio = mistakes_count.max(0) as f64 / seen.max(1) as f64;
        (100.0 - ratio * 100.0).max(0.0)
    } else {
        0.0
    };
    let performance = match accuracy_7d {
        Some(a) if attempts_7d >= MIN_ATTEMPTS_FOR_PERFORMANCE => a as f64,
        _ => 0.0,
    };
    let mock = mock_score(mock_history);
    let coverage = if total > 0 { (coverage_ratio * 100.0).round() } else { 0.0 };
    let overall = if total == 0 {
        0
    } else {
        ((mistakes * 0.30 + performance * 0.25 + mock * 0.30 + coverage * 0.15).round() as i32).clamp(0, 100)
    };
    Components { mistakes, performance, mock, coverage, overall }
}

#[derive(Debug, Clone, Serialize)]
pub struct ExamOutcome {
    pub passed: bool,
    pub points: i32,
    #[serde(with = "time::serde::rfc3339")]
    pub taken_at: OffsetDateTime,
}

/// Everything the dashboard shows about a student's preparation in the app.
#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub student_id: Uuid,
    /// The student linked the app and sent at least one snapshot.
    pub linked: bool,
    pub score: i32,
    pub label: &'static str,
    pub components: Components,
    pub total_questions: i64,
    pub seen_count: i64,
    pub mistakes_count: i64,
    pub due_mistakes_count: i64,
    pub accuracy_7d: Option<i32>,
    pub attempts_7d: i64,
    pub attempts_total: i64,
    pub mocks_taken: i64,
    pub mocks_passed: i64,
    pub last_mock_score: Option<i32>,
    pub best_mock_score: Option<i32>,
    pub days_to_ready: Option<i32>,
    pub streak: i32,
    #[serde(with = "time::serde::rfc3339::option")]
    pub last_activity_at: Option<OffsetDateTime>,
    #[serde(with = "time::serde::rfc3339::option")]
    pub last_sync_at: Option<OffsetDateTime>,
    pub exam: Option<ExamOutcome>,
}

impl Progress {
    fn empty(student_id: Uuid) -> Self {
        Self {
            student_id,
            linked: false,
            score: 0,
            label: label(0),
            components: score_components(0, 0, 0, None, 0, &[]),
            total_questions: 0,
            seen_count: 0,
            mistakes_count: 0,
            due_mistakes_count: 0,
            accuracy_7d: None,
            attempts_7d: 0,
            attempts_total: 0,
            mocks_taken: 0,
            mocks_passed: 0,
            last_mock_score: None,
            best_mock_score: None,
            days_to_ready: None,
            streak: 0,
            last_activity_at: None,
            last_sync_at: None,
            exam: None,
        }
    }
}

#[derive(sqlx::FromRow)]
struct AttemptAgg {
    student_id: Uuid,
    lang: i32,
    seen: i64,
    total: i64,
    attempts_7d: i64,
    correct_7d: i64,
    last_at: Option<OffsetDateTime>,
}

#[derive(sqlx::FromRow)]
struct MockRow {
    student_id: Uuid,
    lang: i32,
    score: i32,
    passed: bool,
}

#[derive(sqlx::FromRow)]
struct SnapshotRow {
    student_id: Uuid,
    lang: i32,
    received_at: OffsetDateTime,
    total_questions: i32,
    mistakes_count: i32,
    due_mistakes_count: i32,
    days_to_ready: Option<i32>,
    streak: i32,
}

#[derive(sqlx::FromRow)]
struct ExamRow {
    student_id: Uuid,
    passed: bool,
    points: i32,
    taken_at: OffsetDateTime,
}

/// Progress for many students at once (group lists, school stats). Students without any synced
/// data get an empty, `linked: false` entry.
pub async fn for_students(conn: &mut PgConnection, ids: &[Uuid]) -> sqlx::Result<HashMap<Uuid, Progress>> {
    let mut out: HashMap<Uuid, Progress> = ids.iter().map(|id| (*id, Progress::empty(*id))).collect();
    if ids.is_empty() {
        return Ok(out);
    }
    let linked: Vec<(Uuid, Option<OffsetDateTime>)> = sqlx::query_as(
        "SELECT student_id, max(last_sync_at) FROM app_links
          WHERE student_id = ANY($1) AND revoked_at IS NULL GROUP BY student_id",
    )
    .bind(ids)
    .fetch_all(&mut *conn)
    .await?;
    for (id, last_sync) in linked {
        if let Some(p) = out.get_mut(&id) {
            p.linked = true;
            p.last_sync_at = last_sync;
        }
    }
    // The app's 7-day window is the last seven local calendar days (today included).
    let aggs = sqlx::query_as::<_, AttemptAgg>(
        "SELECT student_id, lang,
                count(DISTINCT question_id) AS seen,
                count(*) AS total,
                count(*) FILTER (WHERE (answered_at AT TIME ZONE 'Europe/Bratislava')::date >= (now() AT TIME ZONE 'Europe/Bratislava')::date - 6 AND mode <> 'mock') AS attempts_7d,
                count(*) FILTER (WHERE (answered_at AT TIME ZONE 'Europe/Bratislava')::date >= (now() AT TIME ZONE 'Europe/Bratislava')::date - 6 AND mode <> 'mock' AND is_correct) AS correct_7d,
                max(answered_at) AS last_at
           FROM app_attempts WHERE student_id = ANY($1) GROUP BY student_id, lang",
    )
    .bind(ids)
    .fetch_all(&mut *conn)
    .await?;
    let mocks = sqlx::query_as::<_, MockRow>(
        "SELECT student_id, lang, score, passed FROM app_mock_exams WHERE student_id = ANY($1) ORDER BY completed_at DESC",
    )
    .bind(ids)
    .fetch_all(&mut *conn)
    .await?;
    let snapshots = sqlx::query_as::<_, SnapshotRow>(
        "SELECT DISTINCT ON (student_id) student_id, lang, received_at, total_questions, mistakes_count,
                due_mistakes_count, days_to_ready, streak
           FROM app_snapshots WHERE student_id = ANY($1) ORDER BY student_id, received_at DESC",
    )
    .bind(ids)
    .fetch_all(&mut *conn)
    .await?;
    let exams = sqlx::query_as::<_, ExamRow>(
        "SELECT DISTINCT ON (student_id) student_id, passed, points, taken_at
           FROM app_exam_results WHERE student_id = ANY($1) ORDER BY student_id, taken_at DESC",
    )
    .bind(ids)
    .fetch_all(&mut *conn)
    .await?;

    let mut mock_history: HashMap<Uuid, Vec<MockRow>> = HashMap::new();
    for m in mocks {
        mock_history.entry(m.student_id).or_default().push(m);
    }
    let mut snapshot_by: HashMap<Uuid, SnapshotRow> = snapshots.into_iter().map(|s| (s.student_id, s)).collect();
    let mut exam_by: HashMap<Uuid, ExamRow> = exams.into_iter().map(|e| (e.student_id, e)).collect();
    let mut agg_by: HashMap<Uuid, Vec<AttemptAgg>> = HashMap::new();
    for a in aggs {
        agg_by.entry(a.student_id).or_default().push(a);
    }

    for id in ids {
        let Some(p) = out.get_mut(id) else { continue };
        let snap = snapshot_by.remove(id);
        let mut aggs = agg_by.remove(id).unwrap_or_default();
        // The app scores each language on its own: use the language of the latest snapshot, else
        // the language with the most answers.
        let lang = snap.as_ref().map(|s| s.lang).or_else(|| aggs.iter().max_by_key(|a| a.total).map(|a| a.lang));
        aggs.retain(|a| Some(a.lang) == lang);
        let agg = aggs.pop();
        // Like the app's getMockStats: the latest 50 of this language.
        let history: Vec<MockRow> = mock_history
            .remove(id)
            .unwrap_or_default()
            .into_iter()
            .filter(|m| Some(m.lang) == lang)
            .take(50)
            .collect();
        if let Some(e) = exam_by.remove(id) {
            p.exam = Some(ExamOutcome { passed: e.passed, points: e.points, taken_at: e.taken_at });
        }
        if agg.is_none() && snap.is_none() && history.is_empty() {
            continue;
        }
        if let Some(a) = &agg {
            p.seen_count = a.seen;
            p.attempts_total = a.total;
            p.attempts_7d = a.attempts_7d;
            p.accuracy_7d = (a.attempts_7d > 0).then(|| (a.correct_7d as f64 / a.attempts_7d as f64 * 100.0).round() as i32);
            p.last_activity_at = a.last_at;
        }
        if let Some(s) = &snap {
            p.total_questions = s.total_questions as i64;
            p.mistakes_count = s.mistakes_count as i64;
            p.due_mistakes_count = s.due_mistakes_count as i64;
            p.days_to_ready = s.days_to_ready;
            p.streak = s.streak;
            if p.last_sync_at.is_none() {
                p.last_sync_at = Some(s.received_at);
            }
        }
        p.mocks_taken = history.len() as i64;
        p.mocks_passed = history.iter().filter(|m| m.passed).count() as i64;
        p.last_mock_score = history.first().map(|m| m.score);
        p.best_mock_score = history.iter().map(|m| m.score).max();
        let passes: Vec<bool> = history.iter().map(|m| m.passed).collect();
        p.components =
            score_components(p.total_questions, p.seen_count, p.mistakes_count, p.accuracy_7d, p.attempts_7d, &passes);
        p.score = p.components.overall;
        p.label = label(p.score);
    }
    Ok(out)
}

pub async fn for_student(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Progress> {
    let mut map = for_students(conn, &[id]).await?;
    Ok(map.remove(&id).unwrap_or_else(|| Progress::empty(id)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirrors_the_app_formula() {
        // Nothing seen: everything zero.
        assert_eq!(score_components(1000, 0, 0, None, 0, &[]).overall, 0);
        // Full marks: no mistakes, perfect week, every mock passed, everything seen.
        let c = score_components(1000, 1000, 0, Some(100), 50, &[true, true, true]);
        assert_eq!(c.overall, 100);
        // Thin data keeps the mistakes component at zero until 50 questions are seen.
        assert_eq!(score_components(1000, 20, 0, Some(90), 30, &[]).mistakes, 0.0);
        assert_eq!(score_components(1000, 60, 6, Some(90), 30, &[]).mistakes, 90.0);
        // Accuracy only counts from ten attempts in the week.
        assert_eq!(score_components(1000, 60, 0, Some(90), 9, &[]).performance, 0.0);
        // Mock score: 60 % lifetime, 40 % last three.
        assert!((mock_score(&[true, false, true, true]) - (75.0 * 0.6 + (2.0 / 3.0 * 100.0) * 0.4)).abs() < 1e-9);
        assert_eq!(label(97), "ready");
        assert_eq!(label(85), "almostReady");
        assert_eq!(label(60), "gettingThere");
        assert_eq!(label(59), "needsWork");
    }
}

impl Progress {
    /// A filled-in progress for tests and previews.
    pub fn sample_for_tests(student_id: Uuid) -> Self {
        let components = score_components(1000, 640, 23, Some(88), 142, &[true, false, true]);
        Self {
            student_id,
            linked: true,
            score: components.overall,
            label: label(components.overall),
            components,
            total_questions: 1000,
            seen_count: 640,
            mistakes_count: 23,
            due_mistakes_count: 4,
            accuracy_7d: Some(88),
            attempts_7d: 142,
            attempts_total: 1900,
            mocks_taken: 3,
            mocks_passed: 2,
            last_mock_score: Some(94),
            best_mock_score: Some(96),
            days_to_ready: Some(12),
            streak: 5,
            last_activity_at: Some(OffsetDateTime::now_utc()),
            last_sync_at: Some(OffsetDateTime::now_utc()),
            exam: None,
        }
    }
}
