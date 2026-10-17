//! The whole app in-process on a throwaway database per test (`#[sqlx::test]` on the project-local
//! cluster, schools/pg.sh). Staff requests carry the cookie, app requests the bearer token.

use reqwest::StatusCode;
use schools::config::Config;
use schools::state::AppState;
use serde_json::{Value, json};
use sqlx::PgPool;

struct TestApp {
    url: String,
    http: reqwest::Client,
    _server: tokio::task::JoinHandle<()>,
}

impl TestApp {
    async fn spawn(pool: PgPool) -> Self {
        schools::seed::seed_demo(&pool).await.expect("seed");
        let state = AppState::new(pool, Config::for_tests(String::new()));
        let app = schools::app(state);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await.unwrap();
        });
        let http = reqwest::Client::builder().cookie_store(true).build().unwrap();
        Self { url: format!("http://{addr}"), http, _server: server }
    }

    async fn login(&self, email: &str, password: &str) -> reqwest::Response {
        self.http
            .post(format!("{}/api/v1/auth/login", self.url))
            .header("origin", "http://localhost:5190")
            .json(&json!({ "email": email, "password": password }))
            .send()
            .await
            .unwrap()
    }

    async fn get(&self, path: &str) -> reqwest::Response {
        self.http.get(format!("{}{path}", self.url)).send().await.unwrap()
    }

    async fn post(&self, path: &str, body: Value) -> reqwest::Response {
        self.http
            .post(format!("{}{path}", self.url))
            .header("origin", "http://localhost:5190")
            .json(&body)
            .send()
            .await
            .unwrap()
    }

    async fn json(&self, path: &str) -> Value {
        let r = self.get(path).await;
        assert_eq!(r.status(), StatusCode::OK, "{path}");
        r.json().await.unwrap()
    }

    async fn app_post(&self, path: &str, token: &str, body: Value) -> reqwest::Response {
        // A fresh client: the app has no cookie jar, only its token.
        reqwest::Client::new()
            .post(format!("{}{path}", self.url))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap()
    }
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn sign_in_is_a_cookie_and_wrong_passwords_are_refused(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    assert_eq!(app.get("/api/v1/auth/me").await.status(), StatusCode::UNAUTHORIZED);
    let bad = app.login(schools::seed::DEMO_ADMIN, "nope").await;
    assert_eq!(bad.status(), StatusCode::UNAUTHORIZED);
    let body: Value = bad.json().await.unwrap();
    assert_eq!(body["code"], "bad_credentials");
    let ok = app.login(schools::seed::DEMO_ADMIN, schools::seed::DEMO_PASSWORD).await;
    assert_eq!(ok.status(), StatusCode::OK);
    assert!(ok.headers().get("set-cookie").unwrap().to_str().unwrap().starts_with("schools_session="));
    let me = app.json("/api/v1/auth/me").await;
    assert_eq!(me["role"], "admin");
    // A write from a foreign page is refused even with the cookie.
    let foreign = app
        .http
        .post(format!("{}/api/v1/groups", app.url))
        .header("origin", "https://evil.example")
        .header("host", "localhost:1")
        .json(&json!({ "name": "x" }))
        .send()
        .await
        .unwrap();
    assert_eq!(foreign.status(), StatusCode::FORBIDDEN);
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn the_dashboard_reads_groups_students_and_overview(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.login(schools::seed::DEMO_ADMIN, schools::seed::DEMO_PASSWORD).await;
    let overview = app.json("/api/v1/school/overview").await;
    assert!(overview["students_active"].as_i64().unwrap() >= 25);
    assert!(overview["students_linked"].as_i64().unwrap() >= 10);
    assert!(overview["avg_readiness"].as_i64().is_some());
    let groups = app.json("/api/v1/groups").await;
    let groups = groups.as_array().unwrap();
    assert_eq!(groups.len(), 5);
    let running = groups.iter().find(|g| g["status"] == "running" && g["category"] == "B").unwrap();
    assert!(running["stats"]["linked"].as_i64().unwrap() >= 1);
    let detail = app.json(&format!("/api/v1/groups/{}", running["id"].as_str().unwrap())).await;
    let students = detail["students"].as_array().unwrap();
    assert!(students.len() >= 8);
    let linked = students.iter().find(|s| s["progress"]["linked"] == true).unwrap();
    assert!(linked["progress"]["score"].as_i64().unwrap() > 0);
    assert!(linked["progress"]["seen_count"].as_i64().unwrap() > 0);
    assert!(linked["training"]["theory_held"].as_i64().unwrap() > 0);
    assert!(detail["join_code"]["code"].as_str().unwrap().len() == 8);
    let student = app.json(&format!("/api/v1/students/{}", linked["id"].as_str().unwrap())).await;
    assert!(student["snapshots"].as_array().unwrap().len() >= 1);
    assert_eq!(student["enrolments"][0]["group_id"], running["id"]);
    let search = app.json(&format!("/api/v1/students?q={}", linked["last_name"].as_str().unwrap())).await;
    assert!(search.as_array().unwrap().iter().any(|s| s["id"] == linked["id"]));
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn a_student_joins_with_a_code_and_syncs_progress(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.login(schools::seed::DEMO_INSTRUCTOR, schools::seed::DEMO_PASSWORD).await;
    // The instructor adds a student and makes them a code.
    let created: Value = app
        .post("/api/v1/students", json!({ "first_name": "Test", "last_name": "Žiačik", "birth_date": "2009-03-04" }))
        .await
        .json()
        .await
        .unwrap();
    let student_id = created["id"].as_str().unwrap().to_owned();
    let groups = app.json("/api/v1/groups").await;
    let group_id = groups[1]["id"].as_str().unwrap().to_owned();
    let enrolled = app.post(&format!("/api/v1/students/{student_id}/enrol"), json!({ "group_id": group_id })).await;
    assert_eq!(enrolled.status(), StatusCode::OK);
    let code: Value = app.post(&format!("/api/v1/students/{student_id}/join-code"), json!({})).await.json().await.unwrap();
    let code = code["code"].as_str().unwrap().to_owned();

    // Nobody signed in: the app joins with the code alone.
    let bad = app.app_post("/api/v1/app/join", "", json!({ "code": "ZZZZZZZZ", "device_id": "dev-1" })).await;
    assert_eq!(bad.status(), StatusCode::NOT_FOUND);
    let joined = app
        .app_post("/api/v1/app/join", "", json!({ "code": code.to_lowercase(), "device_id": "dev-1", "lang": 1, "app_version": "1.0.49" }))
        .await;
    assert_eq!(joined.status(), StatusCode::OK);
    let joined: Value = joined.json().await.unwrap();
    let token = joined["token"].as_str().unwrap().to_owned();
    assert_eq!(joined["student_name"], "Test Žiačik");
    assert_eq!(joined["group_id"].as_str().unwrap(), group_id);
    // One-use: the same code again is gone.
    let again = app.app_post("/api/v1/app/join", "", json!({ "code": code, "device_id": "dev-2" })).await;
    assert_eq!(again.status(), StatusCode::NOT_FOUND);

    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let attempt = |i: u32, ok: bool| {
        json!({ "id": uuid::Uuid::new_v4(), "question_id": format!("{}", 1000 + i), "mode": "study",
                "category_text": "Pravidlá cestnej premávky", "is_correct": ok, "response_time_ms": 4000, "answered_at": now - 600 + i as i64 })
    };
    let attempts: Vec<Value> = (0..60).map(|i| attempt(i, i % 10 != 0)).collect();
    let sync = app
        .app_post(
            "/api/v1/app/sync",
            &token,
            json!({
                "attempts": attempts,
                "mock_exams": [{ "id": uuid::Uuid::new_v4(), "score": 94, "max_score": 100, "min_to_pass": 90, "passed": true, "duration_sec": 900, "completed_at": now - 100 }],
                "exam_results": [],
                "snapshot": { "readiness_score": 71, "readiness_label": "gettingThere", "total_questions": 975, "seen_count": 60,
                               "mistakes_count": 6, "due_mistakes_count": 2, "accuracy_7d": 90, "attempts_7d": 60, "mocks_taken": 1, "mocks_passed": 1,
                               "days_to_ready": 14, "streak": 3, "components": { "coverage": 6 } }
            }),
        )
        .await;
    assert_eq!(sync.status(), StatusCode::OK, "{}", sync.text().await.unwrap());
    // Sending the same rows again changes nothing.
    let attempts_again: Vec<Value> = attempts.clone();
    let sync2 = app.app_post("/api/v1/app/sync", &token, json!({ "attempts": attempts_again })).await;
    assert_eq!(sync2.status(), StatusCode::OK);

    let student = app.json(&format!("/api/v1/students/{student_id}")).await;
    let p = &student["progress"];
    assert_eq!(p["linked"], true);
    assert_eq!(p["seen_count"], 60);
    assert_eq!(p["attempts_total"], 60);
    assert_eq!(p["accuracy_7d"], 90);
    assert_eq!(p["mocks_taken"], 1);
    assert_eq!(p["mistakes_count"], 6);
    // mistakes 100 - 6/60*100 = 90 → 27; performance 90 → 22.5; mock 100 → 30; coverage 6 → 0.9 ≈ 80
    assert_eq!(p["score"], 80);

    let me = reqwest::Client::new().get(format!("{}/api/v1/app/me", app.url)).bearer_auth(&token).send().await.unwrap();
    assert_eq!(me.status(), StatusCode::OK);
    let unlink = app.app_post("/api/v1/app/unlink", &token, json!({})).await;
    assert_eq!(unlink.status(), StatusCode::NO_CONTENT);
    let me = reqwest::Client::new().get(format!("{}/api/v1/app/me", app.url)).bearer_auth(&token).send().await.unwrap();
    assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn a_group_code_creates_the_student_and_a_reinstall_finds_them_again(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.login(schools::seed::DEMO_ADMIN, schools::seed::DEMO_PASSWORD).await;
    let groups = app.json("/api/v1/groups").await;
    let group_id = groups[1]["id"].as_str().unwrap().to_owned();
    let code: Value = app.post(&format!("/api/v1/groups/{group_id}/join-code"), json!({})).await.json().await.unwrap();
    let code = code["code"].as_str().unwrap().to_owned();
    let nameless = app.app_post("/api/v1/app/join", "", json!({ "code": code, "device_id": "dev-9" })).await;
    assert_eq!(nameless.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let first = app
        .app_post("/api/v1/app/join", "", json!({ "code": code, "device_id": "dev-9", "first_name": "Nový", "last_name": "Žiak" }))
        .await;
    assert_eq!(first.status(), StatusCode::OK);
    let first: Value = first.json().await.unwrap();
    let second = app.app_post("/api/v1/app/join", "", json!({ "code": code, "device_id": "dev-9" })).await;
    assert_eq!(second.status(), StatusCode::OK);
    let second: Value = second.json().await.unwrap();
    assert_eq!(first["student_id"], second["student_id"]);
    assert_ne!(first["token"], second["token"]);
    let detail = app.json(&format!("/api/v1/groups/{group_id}")).await;
    assert!(detail["students"].as_array().unwrap().iter().any(|s| s["id"] == first["student_id"]));
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn lessons_attendance_and_driving_lessons_are_recorded(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.login(schools::seed::DEMO_INSTRUCTOR, schools::seed::DEMO_PASSWORD).await;
    let groups = app.json("/api/v1/groups").await;
    let group_id = groups[1]["id"].as_str().unwrap().to_owned();
    let detail = app.json(&format!("/api/v1/groups/{group_id}")).await;
    let students: Vec<String> = detail["students"].as_array().unwrap().iter().map(|s| s["id"].as_str().unwrap().to_owned()).collect();
    let lesson = app
        .post(&format!("/api/v1/groups/{group_id}/lessons"), json!({ "held_on": "2026-10-16", "lessons": 3, "subject": "ZBJ", "present_ids": [students[0], students[1]] }))
        .await;
    assert_eq!(lesson.status(), StatusCode::OK);
    let lesson: Value = lesson.json().await.unwrap();
    assert_eq!(lesson["present_count"], 2);
    let too_long = app.post(&format!("/api/v1/groups/{group_id}/lessons"), json!({ "held_on": "2026-10-16", "lessons": 7 })).await;
    assert_eq!(too_long.status(), StatusCode::BAD_REQUEST);
    let changed: Value = app
        .http
        .put(format!("{}/api/v1/lessons/{}/attendance", app.url, lesson["id"].as_str().unwrap()))
        .header("origin", "http://localhost:5190")
        .json(&json!({ "present_ids": [students[0]] }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(changed["present_count"], 1);
    let drive = app
        .post(&format!("/api/v1/students/{}/driving-lessons", students[0]), json!({ "held_on": "2026-10-16", "kind": "CP", "lessons": 2, "km": 38 }))
        .await;
    assert_eq!(drive.status(), StatusCode::OK);
    let too_many = app
        .post(&format!("/api/v1/students/{}/driving-lessons", students[0]), json!({ "held_on": "2026-10-16", "kind": "AT", "lessons": 3 }))
        .await;
    assert_eq!(too_many.status(), StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn documents_are_generated_stored_and_served_as_pdf(pool: PgPool) {
    let app = TestApp::spawn(pool).await;
    app.login(schools::seed::DEMO_ADMIN, schools::seed::DEMO_PASSWORD).await;
    let groups = app.json("/api/v1/groups").await;
    let group_id = groups[1]["id"].as_str().unwrap().to_owned();
    let detail = app.json(&format!("/api/v1/groups/{group_id}")).await;
    let student_id = detail["students"][0]["id"].as_str().unwrap().to_owned();
    for kind in ["agreement", "certificate", "guardian_consent", "progress_report"] {
        let doc = app.post(&format!("/api/v1/students/{student_id}/documents"), json!({ "kind": kind, "fields": { "place": "Žiline" } })).await;
        assert_eq!(doc.status(), StatusCode::OK, "{kind}");
        let doc: Value = doc.json().await.unwrap();
        let pdf = app.get(&format!("/api/v1/documents/{}/pdf", doc["id"].as_str().unwrap())).await;
        assert_eq!(pdf.status(), StatusCode::OK);
        assert_eq!(pdf.headers()["content-type"], "application/pdf");
        let bytes = pdf.bytes().await.unwrap();
        assert!(bytes.starts_with(b"%PDF"), "{kind}");
    }
    let unknown = app.post(&format!("/api/v1/students/{student_id}/documents"), json!({ "kind": "diploma" })).await;
    assert_eq!(unknown.status(), StatusCode::BAD_REQUEST);
    let application = app
        .post(&format!("/api/v1/groups/{group_id}/documents"), json!({ "kind": "exam_application", "fields": { "place": "Žiline", "authority": "OR PZ Žilina, ODI" } }))
        .await;
    assert_eq!(application.status(), StatusCode::OK);
    let application: Value = application.json().await.unwrap();
    let pdf = app.get(&format!("/api/v1/documents/{}/pdf", application["id"].as_str().unwrap())).await;
    assert!(pdf.bytes().await.unwrap().starts_with(b"%PDF"));
    let sheet = app.post(&format!("/api/v1/groups/{group_id}/documents"), json!({ "kind": "attendance_sheet" })).await;
    assert_eq!(sheet.status(), StatusCode::OK);
    let docs = app.json(&format!("/api/v1/students/{student_id}/documents")).await;
    assert_eq!(docs.as_array().unwrap().len(), 4);
}

#[sqlx::test(migrator = "schools::MIGRATOR")]
async fn schools_never_see_each_other(pool: PgPool) {
    let app = TestApp::spawn(pool.clone()).await;
    // A second school with its own admin.
    let other = uuid::Uuid::now_v7();
    sqlx::query("INSERT INTO schools (id, name) VALUES ($1, 'Iná autoškola')").bind(other).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO users (id, school_id, email, name, role, password_hash) VALUES ($1, $2, 'x@ina.sk', 'X', 'admin', $3)")
        .bind(uuid::Uuid::now_v7())
        .bind(other)
        .bind(schools::crypto::hash_password("pw").unwrap())
        .execute(&pool)
        .await
        .unwrap();
    app.login(schools::seed::DEMO_ADMIN, schools::seed::DEMO_PASSWORD).await;
    let groups = app.json("/api/v1/groups").await;
    let group_id = groups[0]["id"].as_str().unwrap().to_owned();
    let detail = app.json(&format!("/api/v1/groups/{group_id}")).await;
    let student_id = detail["students"][0]["id"].as_str().unwrap().to_owned();
    let other_app = TestApp::spawn_no_seed(pool).await;
    other_app.login("x@ina.sk", "pw").await;
    assert_eq!(other_app.get(&format!("/api/v1/groups/{group_id}")).await.status(), StatusCode::NOT_FOUND);
    assert_eq!(other_app.get(&format!("/api/v1/students/{student_id}")).await.status(), StatusCode::NOT_FOUND);
    assert_eq!(other_app.json("/api/v1/groups").await.as_array().unwrap().len(), 0);
    assert_eq!(other_app.json("/api/v1/students").await.as_array().unwrap().len(), 0);
}

impl TestApp {
    async fn spawn_no_seed(pool: PgPool) -> Self {
        let state = AppState::new(pool, Config::for_tests(String::new()));
        let app = schools::app(state);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await.unwrap();
        });
        let http = reqwest::Client::builder().cookie_store(true).build().unwrap();
        Self { url: format!("http://{addr}"), http, _server: server }
    }
}
