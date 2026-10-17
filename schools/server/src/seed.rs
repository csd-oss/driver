//! The demo school: deterministic (seeded RNG), so screenshots and tests see the same numbers.
//! "Autoškola Demo" in Žilina with two branches, an admin and three instructors, five courses in
//! different stages, thirty-odd students, theory lessons with attendance, driving lessons, and
//! for most students a month of practice synced from the app.
//!
//! Sign in as `jana@demo.sk` (admin) or `peter@demo.sk` (instructor); every password is `driver`.

use crate::crypto::{hash_password, hash_token};
use crate::readiness::{label, score_components};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use sqlx::{PgConnection, PgPool};
use std::collections::HashSet;
use time::{Date, Duration, Month, OffsetDateTime, Time};
use uuid::Uuid;

pub const DEMO_SCHOOL: &str = "Autoškola Demo";
pub const DEMO_PASSWORD: &str = "driver";
pub const DEMO_ADMIN: &str = "jana@demo.sk";
pub const DEMO_INSTRUCTOR: &str = "peter@demo.sk";
/// Size of the Slovak question bank the demo pretends the app has (the real app sends its own).
const TOTAL_QUESTIONS: i32 = 975;

const FIRST_NAMES: &[&str] = &[
    "Adam", "Michal", "Jakub", "Samuel", "Tomáš", "Matej", "Lukáš", "Martin", "Filip", "Šimon", "Ján", "Peter", "Dávid", "Marek",
    "Ema", "Sofia", "Nina", "Natália", "Viktória", "Laura", "Nela", "Kristína", "Simona", "Lucia", "Žofia", "Zuzana", "Katarína",
    "Barbora", "Dominika", "Terézia", "Alžbeta", "Hana", "Oliver", "Sebastián", "Richard", "Erik", "Patrik", "Andrej",
];
const LAST_NAMES_M: &[&str] = &[
    "Horváth", "Kováč", "Varga", "Tóth", "Nagy", "Baláž", "Szabó", "Molnár", "Balog", "Lukáč", "Polák", "Kučera", "Hudák", "Ďuriš",
    "Mikula", "Pavlík", "Zajac", "Sedlák", "Urban", "Kráľ",
];
const LAST_NAMES_F: &[&str] = &[
    "Horváthová", "Kováčová", "Vargová", "Tóthová", "Nagyová", "Balážová", "Szabóová", "Molnárová", "Balogová", "Lukáčová", "Poláková",
    "Kučerová", "Hudáková", "Ďurišová", "Mikulová", "Pavlíková", "Zajacová", "Sedláková", "Urbanová", "Kráľová",
];
const STREETS: &[&str] = &["Hlinská", "Vysokoškolákov", "Bulharská", "Kysucká", "Komenského", "Jánošíkova", "Hollého", "Oslobodenia", "Mládeže", "Kollárova"];
// The ten okruhy of the Slovak question bank (data/data5.js, first test's `okruhy`).
const CATEGORIES: &[&str] = &[
    "Pravidlá cestnej premávky",
    "Uplatňovanie pravidiel prednosti v jazde a rýchlostné obmedzenia",
    "Dopravné značky a dopravné zariadenia",
    "Dopravné situácie na križovatkách",
    "Všeobecné pravidlá správania sa v prípade dopravnej nehody",
    "Teória vedenia vozidla",
    "Predpisy týkajúce sa dokladov požadovaných v prípade používania vozidla a organizácia času v doprave",
    "Podmienky prevádzky vozidiel v premávke na pozemných komunikáciách",
    "Zásady bezpečnej jazdy",
    "Konštrukcia vozidiel a ich údržba",
];

fn date(y: i32, m: u8, d: u8) -> Date {
    Date::from_calendar_date(y, Month::try_from(m).expect("month"), d).expect("date")
}

fn today() -> Date {
    OffsetDateTime::now_utc().date()
}

/// Everything out, for `seed --reset`.
pub async fn reset(pool: &PgPool) -> anyhow::Result<()> {
    sqlx::query(
        "TRUNCATE documents, app_snapshots, app_exam_results, app_mock_exams, app_attempts, driving_lessons, theory_attendance,
                  theory_lessons, app_links, join_codes, enrolments, students, groups, sessions, users, branches, schools",
    )
    .execute(pool)
    .await?;
    Ok(())
}

struct Student {
    id: Uuid,
    minor: bool,
}

pub struct Report {
    pub created: bool,
    pub students: usize,
    pub linked: usize,
    pub attempts: usize,
}

impl std::fmt::Display for Report {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.created {
            write!(
                f,
                "seeded {DEMO_SCHOOL}: {} students, {} with the app linked, {} synced answers; sign in as {DEMO_ADMIN} / {DEMO_PASSWORD}",
                self.students, self.linked, self.attempts
            )
        } else {
            write!(f, "{DEMO_SCHOOL} already exists; nothing seeded (schools seed --reset starts over)")
        }
    }
}

/// Creates the demo school unless it exists. Returns what it made.
pub async fn seed_demo(pool: &PgPool) -> anyhow::Result<Report> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM schools WHERE name = $1)")
        .bind(DEMO_SCHOOL)
        .fetch_one(pool)
        .await?;
    if exists {
        return Ok(Report { created: false, students: 0, linked: 0, attempts: 0 });
    }
    let mut tx = pool.begin().await?;
    let mut rng = StdRng::seed_from_u64(20261017);
    let today = today();

    let school_id = Uuid::now_v7();
    sqlx::query(
        "INSERT INTO schools (id, name, legal_name, ico, address, registration_no, trade_licence_no, responsible_person, phone, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(school_id)
    .bind(DEMO_SCHOOL)
    .bind("Autoškola Demo s. r. o.")
    .bind("12 345 678")
    .bind("Hlavná 1, 010 01 Žilina")
    .bind("OU-ZA-OCDPK-2020/001234")
    .bind("580-12345")
    .bind("Ing. Jana Nováková")
    .bind("+421 41 123 456")
    .bind("info@autoskola-demo.sk")
    .execute(&mut *tx)
    .await?;

    let branch_za = Uuid::now_v7();
    let branch_mt = Uuid::now_v7();
    for (id, name, addr) in [(branch_za, "Žilina – centrum", "Hlavná 1, Žilina"), (branch_mt, "Martin", "Kollárova 8, Martin")] {
        sqlx::query("INSERT INTO branches (id, school_id, name, address) VALUES ($1, $2, $3, $4)")
            .bind(id)
            .bind(school_id)
            .bind(name)
            .bind(addr)
            .execute(&mut *tx)
            .await?;
    }

    let hash = hash_password(DEMO_PASSWORD)?;
    let mut users = Vec::new();
    for (email, name, role, card, groups) in [
        (DEMO_ADMIN, "Ing. Jana Nováková", "admin", "IP-2015-0412", "B, BE"),
        (DEMO_INSTRUCTOR, "Peter Kováč", "instructor", "IP-2018-1180", "A, B"),
        ("marek@demo.sk", "Marek Horváth", "instructor", "IP-2012-0777", "B, C, T"),
        ("lucia@demo.sk", "Lucia Balážová", "instructor", "IP-2021-0093", "B"),
    ] {
        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO users (id, school_id, email, name, role, password_hash, instructor_card_no, instructor_groups)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(id)
        .bind(school_id)
        .bind(email)
        .bind(name)
        .bind(role)
        .bind(&hash)
        .bind(card)
        .bind(groups)
        .execute(&mut *tx)
        .await?;
        users.push(id);
    }
    let instructors = &users[1..];

    // name, category, branch, start, end, exam, status, students, lead, share with the app linked
    let courses: [(&str, &str, Uuid, Date, Option<Date>, Option<Date>, &str, usize, Uuid, f64); 5] = [
        ("B-2026-06 Žilina", "B", branch_za, date(2026, 6, 8), Some(date(2026, 9, 11)), Some(date(2026, 9, 24)), "finished", 8, instructors[0], 0.9),
        ("B-2026-09 Žilina", "B", branch_za, date(2026, 9, 7), None, Some(today + Duration::days(34)), "running", 12, instructors[0], 0.8),
        ("B-2026-10 Martin", "B", branch_mt, date(2026, 10, 5), None, Some(today + Duration::days(75)), "running", 10, instructors[2], 0.7),
        ("A-2026-09 Žilina", "A", branch_za, date(2026, 9, 14), None, None, "running", 5, instructors[1], 0.6),
        ("B-2026-11 Žilina", "B", branch_za, today + Duration::days(18), None, None, "planned", 3, instructors[0], 0.0),
    ];

    let mut register_no = 0;
    let mut all_students = 0usize;
    let mut linked = 0usize;
    let mut attempts_total = 0usize;
    let mut used_names: HashSet<(usize, usize)> = HashSet::new();

    for (name, category, branch, starts_on, ends_on, exam_on, status, count, lead, link_share) in courses {
        let group_id = Uuid::now_v7();
        let (theory_req, driving_req) = if category == "A" { (26, 18) } else { (32, 39) };
        sqlx::query(
            "INSERT INTO groups (id, school_id, branch_id, name, category, jiscd_course_no, starts_on, ends_on, exam_on, lead_instructor_id,
                                 theory_lessons_required, driving_lessons_required, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
        )
        .bind(group_id)
        .bind(school_id)
        .bind(branch)
        .bind(name)
        .bind(category)
        .bind(format!("{}{:03}", starts_on.year() % 100, rng.gen_range(100..999)))
        .bind(starts_on)
        .bind(ends_on)
        .bind(exam_on)
        .bind(lead)
        .bind(theory_req)
        .bind(driving_req)
        .bind(status)
        .execute(&mut *tx)
        .await?;

        // A public join code for running groups, so the app can be tried against the seed.
        if status == "running" {
            let code = format!("{}{}", &name[0..1], &format!("{:07}", rng.gen_range(0..9_999_999u32))).replace('0', "7");
            sqlx::query(
                "INSERT INTO join_codes (id, school_id, group_id, code, created_by, expires_at, uses_left)
                 VALUES ($1, $2, $3, $4, $5, now() + interval '60 days', NULL)",
            )
            .bind(Uuid::now_v7())
            .bind(school_id)
            .bind(group_id)
            .bind(code)
            .bind(users[0])
            .execute(&mut *tx)
            .await?;
        }

        let mut students = Vec::new();
        for _ in 0..count {
            register_no += 1;
            all_students += 1;
            let female = rng.gen_bool(0.5);
            let (fi, li) = loop {
                let fi = if female { rng.gen_range(14..32) } else { rng.gen_range(0..14).max(0) + if rng.gen_bool(0.3) { 32 } else { 0 } };
                let fi = fi.min(FIRST_NAMES.len() - 1);
                let li = rng.gen_range(0..LAST_NAMES_M.len());
                if used_names.insert((fi, li)) {
                    break (fi, li);
                }
            };
            let first = FIRST_NAMES[fi];
            let last = if female { LAST_NAMES_F[li] } else { LAST_NAMES_M[li] };
            // Most are 17 to 19; a few adults.
            let birth = if rng.gen_bool(0.8) {
                starts_on - Duration::days(rng.gen_range(17 * 365 - 200..19 * 365 + 200))
            } else {
                starts_on - Duration::days(rng.gen_range(21 * 365..45 * 365))
            };
            let minor = starts_on < birth.replace_year(birth.year() + 18).unwrap_or(birth);
            let id = Uuid::now_v7();
            let email = format!("{}.{}@example.sk", strip(first), strip(last));
            let personal_id = format!(
                "{:02}{:02}{:02}/{:04}",
                birth.year() % 100,
                u8::from(birth.month()) as i32 + if female { 50 } else { 0 },
                birth.day(),
                rng.gen_range(1000..9999)
            );
            sqlx::query(
                "INSERT INTO students (id, school_id, register_no, first_name, last_name, birth_date, birth_place, personal_id, address, email, phone,
                                       guardian_name, guardian_contact, guardian_consent_on, medical_ok_on, psych_ok_on, education_doc_ok, first_aid_ok_on,
                                       needs_glasses, privacy_notice_on, app_consent_on)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)",
            )
            .bind(id)
            .bind(school_id)
            .bind(register_no)
            .bind(first)
            .bind(last)
            .bind(birth)
            .bind(if branch == branch_mt { "Martin" } else { "Žilina" })
            .bind(personal_id)
            .bind(format!("{} {}, {}", STREETS[rng.gen_range(0..STREETS.len())], rng.gen_range(1..60), if branch == branch_mt { "036 01 Martin" } else { "010 01 Žilina" }))
            .bind(email)
            .bind(format!("+421 9{:02} {:03} {:03}", rng.gen_range(0..99), rng.gen_range(100..999), rng.gen_range(100..999)))
            .bind(if minor { format!("{} {}", if female { "Mária" } else { "Jozef" }, LAST_NAMES_M[li]) } else { String::new() })
            .bind(if minor { format!("+421 9{:02} {:03} {:03}", rng.gen_range(0..99), rng.gen_range(100..999), rng.gen_range(100..999)) } else { String::new() })
            .bind(if minor { Some(starts_on - Duration::days(rng.gen_range(1..10))) } else { None })
            .bind(Some(starts_on - Duration::days(rng.gen_range(3..30))))
            .bind(None::<Date>)
            .bind(true)
            .bind(if status == "finished" || rng.gen_bool(0.4) { Some(starts_on + Duration::days(rng.gen_range(10..40))) } else { None })
            .bind(rng.gen_bool(0.15))
            .bind(Some(starts_on - Duration::days(rng.gen_range(1..10))))
            .bind(None::<Date>)
            .execute(&mut *tx)
            .await?;
            let price = if category == "A" { 69000 } else { 89000 + rng.gen_range(0..4) * 2000 };
            let paid = rng.gen_bool(0.75) || status == "finished";
            sqlx::query(
                "INSERT INTO enrolments (id, student_id, group_id, enrolled_on, status, price_cents, paid_on, finished_on, certificate_issued_on)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            )
            .bind(Uuid::now_v7())
            .bind(id)
            .bind(group_id)
            .bind(starts_on - Duration::days(rng.gen_range(0..14)))
            .bind(if status == "finished" { "finished" } else { "active" })
            .bind(price)
            .bind(if paid { Some(starts_on + Duration::days(rng.gen_range(0..20))) } else { None })
            .bind(if status == "finished" { ends_on } else { None })
            .bind(if status == "finished" { ends_on } else { None })
            .execute(&mut *tx)
            .await?;
            students.push(Student { id, minor });
        }

        // Theory: two blocks of 3 lessons a week from the start until the end or today.
        if status != "planned" {
            let until = ends_on.unwrap_or(today).min(today);
            let mut day = starts_on;
            let mut held = 0;
            let subjects = ["PCP", "PCP", "ZBJ", "TVV", "NVU", "PCP", "OP"];
            let mut n = 0;
            while day <= until && held < theory_req {
                let wd = day.weekday().number_days_from_monday();
                if wd == 0 || wd == 2 {
                    let lesson_id = Uuid::now_v7();
                    let lessons = 3.min(theory_req - held);
                    sqlx::query(
                        "INSERT INTO theory_lessons (id, group_id, instructor_id, held_on, starts_at, lessons, subject, topic)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    )
                    .bind(lesson_id)
                    .bind(group_id)
                    .bind(lead)
                    .bind(day)
                    .bind(Time::from_hms(16, 30, 0).unwrap())
                    .bind(lessons)
                    .bind(subjects[n % subjects.len()])
                    .bind(format!("Blok {}", n + 1))
                    .execute(&mut *tx)
                    .await?;
                    for s in &students {
                        sqlx::query("INSERT INTO theory_attendance (lesson_id, student_id, present) VALUES ($1, $2, $3)")
                            .bind(lesson_id)
                            .bind(s.id)
                            .bind(rng.gen_bool(0.86))
                            .execute(&mut *tx)
                            .await?;
                    }
                    held += lessons;
                    n += 1;
                }
                day += Duration::days(1);
            }
        }

        // Driving: AT first, then AC, then CP; how far along depends on the course's age.
        let weeks = ((ends_on.unwrap_or(today).min(today) - starts_on).whole_days().max(0) / 7) as i32;
        for s in &students {
            let target = if status == "finished" { driving_req } else { (weeks * 3 + rng.gen_range(-3..4)).clamp(0, driving_req) };
            let mut done = 0;
            let mut day = starts_on + Duration::days(7);
            let instructor = instructors[rng.gen_range(0..instructors.len())];
            while done < target && day <= today {
                if rng.gen_bool(0.45) {
                    let (kind, lessons, km) = if done < 4 && category == "B" {
                        ("AT", 2.min(target - done), None)
                    } else if done < 6 {
                        ("AC", 2.min(target - done), Some(rng.gen_range(8..20)))
                    } else {
                        ("CP", 2.min(target - done).max(1), Some(rng.gen_range(25..55)))
                    };
                    sqlx::query(
                        "INSERT INTO driving_lessons (id, student_id, group_id, instructor_id, held_on, starts_at, lessons, kind, km, vehicle, notes)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
                    )
                    .bind(Uuid::now_v7())
                    .bind(s.id)
                    .bind(group_id)
                    .bind(instructor)
                    .bind(day)
                    .bind(Time::from_hms(rng.gen_range(8..18), 0, 0).unwrap())
                    .bind(lessons)
                    .bind(kind)
                    .bind(km)
                    .bind(if category == "A" { "Yamaha MT-07 ZA-123BC" } else { "Škoda Fabia ZA-456DE" })
                    .bind(if kind == "CP" && rng.gen_bool(0.3) { "mesto, kruhové objazdy" } else { "" })
                    .execute(&mut *tx)
                    .await?;
                    done += lessons;
                }
                day += Duration::days(1);
            }
        }

        // The app: a month (or the whole course) of practice for most students.
        for s in &students {
            if !rng.gen_bool(link_share) {
                continue;
            }
            linked += 1;
            let linked_at = (starts_on + Duration::days(rng.gen_range(0..10))).min(today - Duration::days(1));
            let link_id = Uuid::now_v7();
            sqlx::query(
                "INSERT INTO app_links (id, student_id, device_id, token_hash, lang, app_version, linked_at, last_sync_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(link_id)
            .bind(s.id)
            .bind(format!("demo-device-{}", s.id.simple()))
            .bind(hash_token(&format!("demo-{}", s.id)))
            .bind(if s.minor && rng.gen_bool(0.1) { 3 } else { 1 })
            .bind("1.0.49")
            .bind(linked_at.midnight().assume_utc())
            .bind(today.midnight().assume_utc() - Duration::hours(rng.gen_range(1..30)))
            .execute(&mut *tx)
            .await?;
            sqlx::query("UPDATE students SET app_consent_on = $2 WHERE id = $1").bind(s.id).bind(linked_at).execute(&mut *tx).await?;
            let n = synth_practice(&mut tx, &mut rng, s.id, linked_at, ends_on.unwrap_or(today).min(today), status == "finished", exam_on).await?;
            attempts_total += n;
        }
    }

    tx.commit().await?;
    Ok(Report { created: true, students: all_students, linked, attempts: attempts_total })
}

fn strip(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' => 'a', 'ä' => 'a', 'č' => 'c', 'ď' => 'd', 'é' => 'e', 'í' => 'i', 'ĺ' => 'l', 'ľ' => 'l', 'ň' => 'n', 'ó' => 'o',
            'ô' => 'o', 'ŕ' => 'r', 'š' => 's', 'ť' => 't', 'ú' => 'u', 'ý' => 'y', 'ž' => 'z',
            'Á' => 'a', 'Č' => 'c', 'Ď' => 'd', 'É' => 'e', 'Í' => 'i', 'Ľ' => 'l', 'Ň' => 'n', 'Ó' => 'o', 'Š' => 's', 'Ť' => 't',
            'Ú' => 'u', 'Ž' => 'z',
            other => other.to_ascii_lowercase(),
        })
        .collect()
}

/// A student's practice from `from` to `until`: a daily pace, accuracy that rises with a personal
/// talent factor, mocks once accuracy is high, weekly snapshots and, for a finished course, the
/// real exam result.
async fn synth_practice(
    conn: &mut PgConnection,
    rng: &mut StdRng,
    student_id: Uuid,
    from: Date,
    until: Date,
    finished: bool,
    exam_on: Option<Date>,
) -> anyhow::Result<usize> {
    let talent: f64 = rng.gen_range(0.35..1.0);
    let pace: i32 = rng.gen_range(8..55);
    let days = (until - from).whole_days().max(1) as i32;
    let mut seen: HashSet<i32> = HashSet::new();
    let mut open_mistakes: HashSet<i32> = HashSet::new();
    let mut ids = Vec::new();
    let mut qids = Vec::new();
    let mut modes = Vec::new();
    let mut cats = Vec::new();
    let mut oks = Vec::new();
    let mut rts = Vec::new();
    let mut ats = Vec::new();
    let mut mocks: Vec<(OffsetDateTime, bool, i32)> = Vec::new();
    let mut last_week_attempts = Vec::new(); // (day_index, correct)
    let mut snapshot_days = Vec::new();

    for d in 0..=days {
        let day = from + Duration::days(d as i64);
        if rng.gen_bool(0.25) {
            continue; // a day off
        }
        let progress = d as f64 / days.max(1) as f64;
        let accuracy = (0.55 + 0.3 * talent + 0.2 * progress * talent).min(0.97);
        let n = (pace as f64 * rng.gen_range(0.5..1.5)) as i32;
        for i in 0..n {
            let qid = if !open_mistakes.is_empty() && rng.gen_bool(0.3) {
                *open_mistakes.iter().next().unwrap()
            } else if rng.gen_bool(0.8) {
                rng.gen_range(1..=TOTAL_QUESTIONS)
            } else {
                *seen.iter().nth(rng.gen_range(0..seen.len().max(1))).unwrap_or(&1)
            };
            let correct = rng.gen_bool(accuracy);
            if correct {
                if rng.gen_bool(0.5) {
                    open_mistakes.remove(&qid);
                }
            } else {
                open_mistakes.insert(qid);
            }
            seen.insert(qid);
            let at = day.midnight().assume_utc() + Duration::minutes(18 * 60 + i as i64 * 2 + rng.gen_range(0..90));
            ids.push(Uuid::now_v7());
            qids.push(qid.to_string());
            modes.push(if open_mistakes.contains(&qid) && rng.gen_bool(0.4) { "mistakes" } else if rng.gen_bool(0.1) { "game" } else { "study" });
            cats.push(CATEGORIES[(qid as usize * 7) % CATEGORIES.len()]);
            oks.push(correct);
            rts.push(rng.gen_range(2500..18000));
            ats.push(at);
            last_week_attempts.push((d, correct));
        }
        if accuracy > 0.82 && rng.gen_bool(0.3) {
            let score = (60.0 + accuracy * 42.0 + rng.gen_range(-6.0..6.0)).clamp(40.0, 100.0) as i32;
            mocks.push((day.midnight().assume_utc() + Duration::hours(20), score >= 90, score));
        }
        if d % 7 == 6 || d == days {
            snapshot_days.push(d);
        }
    }

    // Attempts in one statement.
    sqlx::query(
        "INSERT INTO app_attempts (id, student_id, lang, question_id, mode, category_text, is_correct, response_time_ms, answered_at)
         SELECT id, $2, 1, question_id, mode, category_text, is_correct, response_time_ms, answered_at
           FROM UNNEST($1::uuid[], $3::text[], $4::text[], $5::text[], $6::bool[], $7::int[], $8::timestamptz[])
             AS t(id, question_id, mode, category_text, is_correct, response_time_ms, answered_at)",
    )
    .bind(&ids)
    .bind(student_id)
    .bind(&qids)
    .bind(&modes)
    .bind(&cats)
    .bind(&oks)
    .bind(&rts)
    .bind(&ats)
    .execute(&mut *conn)
    .await?;

    for (at, passed, score) in &mocks {
        sqlx::query(
            "INSERT INTO app_mock_exams (id, student_id, lang, score, max_score, min_to_pass, passed, duration_sec, completed_at)
             VALUES ($1, $2, 1, $3, 100, 90, $4, $5, $6)",
        )
        .bind(Uuid::now_v7())
        .bind(student_id)
        .bind(score)
        .bind(passed)
        .bind(rng.gen_range(600..1500))
        .bind(at)
        .execute(&mut *conn)
        .await?;
    }

    // Snapshots: the score as the app would have computed it on those days.
    for d in snapshot_days {
        let day = from + Duration::days(d as i64);
        let week: Vec<&(i32, bool)> = last_week_attempts.iter().filter(|(dd, _)| *dd > d - 7 && *dd <= d).collect();
        let attempts_7d = week.len() as i64;
        let accuracy_7d = (attempts_7d > 0).then(|| (week.iter().filter(|(_, c)| *c).count() as f64 / attempts_7d as f64 * 100.0).round() as i32);
        let seen_by_then = ids.iter().zip(&ats).filter(|(_, at)| at.date() <= day).count().min(seen.len()) as i64;
        let history: Vec<bool> = mocks.iter().filter(|(at, _, _)| at.date() <= day).rev().map(|(_, p, _)| *p).collect();
        let mistakes = (open_mistakes.len() as f64 * (1.0 - d as f64 / days.max(1) as f64 * 0.3)) as i64;
        let c = score_components(TOTAL_QUESTIONS as i64, seen_by_then, mistakes, accuracy_7d, attempts_7d, &history);
        sqlx::query(
            "INSERT INTO app_snapshots (id, student_id, lang, received_at, readiness_score, readiness_label, total_questions, seen_count,
                                        mistakes_count, due_mistakes_count, accuracy_7d, attempts_7d, mocks_taken, mocks_passed, days_to_ready, streak, components)
             VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
        )
        .bind(Uuid::now_v7())
        .bind(student_id)
        .bind(day.midnight().assume_utc() + Duration::hours(21))
        .bind(c.overall)
        .bind(label(c.overall))
        .bind(TOTAL_QUESTIONS)
        .bind(seen_by_then as i32)
        .bind(mistakes as i32)
        .bind((mistakes / 4) as i32)
        .bind(accuracy_7d)
        .bind(attempts_7d as i32)
        .bind(history.len() as i32)
        .bind(history.iter().filter(|p| **p).count() as i32)
        .bind(if c.overall >= 97 { Some(0) } else { Some(((100 - c.overall) as f64 / (talent * 4.0)).ceil() as i32) })
        .bind(rng.gen_range(0..12))
        .bind(sqlx::types::Json(serde_json::json!({
            "mistakes": c.mistakes, "performance": c.performance, "mockExam": c.mock, "coverage": c.coverage
        })))
        .execute(&mut *conn)
        .await?;
    }

    if finished
        && let Some(exam_on) = exam_on {
            let passed = rng.gen_bool(0.3 + talent * 0.65);
            let points = if passed { rng.gen_range(90..=100) } else { rng.gen_range(70..90) };
            sqlx::query(
                "INSERT INTO app_exam_results (id, student_id, lang, passed, points, max_points, min_to_pass, readiness_score, taken_at)
                 VALUES ($1, $2, 1, $3, $4, 100, 90, $5, $6)",
            )
            .bind(Uuid::now_v7())
            .bind(student_id)
            .bind(passed)
            .bind(points)
            .bind((60.0 + talent * 38.0) as i32)
            .bind(exam_on.midnight().assume_utc() + Duration::hours(9))
            .execute(&mut *conn)
            .await?;
        }
    Ok(ids.len())
}
