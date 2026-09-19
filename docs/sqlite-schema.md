# SQLite schema

The app stores everything the user does in a single SQLite database, `driver.db`. It is opened
synchronously at module load in `src/db/index.ts` (`SQLite.openDatabaseSync('driver.db')`), which
also builds the Drizzle instance:

```ts
const database = SQLite.openDatabaseSync('driver.db');
export const db = drizzle(database, { schema });
export { database };
```

`db` (Drizzle) and `database` (raw expo-sqlite) are both used across `src/db/queries/*.ts`. Drizzle
is preferred for inserts, updates and simple selects; raw `getAllAsync` is used for the aggregate
SQL.

This document describes the schema that actually exists. The authority is
`src/db/migrate.ts` — the hand-written SQL that runs on every launch. Where the Drizzle schema in
`src/db/schema/*.ts` disagrees with it, the section "Where the two schema sources disagree" says so.

## Event sourcing

Every answered question is written to `answer_attempts` as an immutable event. There are **no
aggregate tables**: lifetime totals, per-day counts, per-category accuracy and coverage are all
`GROUP BY` queries over that one table, and the five `v_*` views in the schema express the same
aggregates in SQL.

What this buys, concretely:

- One source of truth. Nothing can drift out of sync with a counter table.
- Statistics can be redefined without a migration — the readiness formula, the 7-day accuracy
  window and the pace calculation all changed at various points with no schema change.
- Full history. `src/lib/smartPractice.js` reads per-question attempt counts, average response time
  and last-seen time straight out of the event log to find "shaky" questions.

Four tables break the pure event-sourcing model on purpose, because they hold state that cannot be
derived from the answer log: `mistakes` (spaced-repetition scheduling), `settings`,
`category_selections`, and `study_sessions` / `mock_exams`, which describe the container an attempt
happened in.

## Timestamps

Every timestamp column is `INTEGER` holding **Unix seconds**, not milliseconds. Drizzle's
`integer(..., { mode: 'timestamp' })` divides by 1000 on write and multiplies on read. This is why
all the date SQL in the codebase reads `DATE(created_at, 'unixepoch', 'localtime')` with no `/1000`.
Day bucketing is done in **local time** throughout (views, `stats.ts`, `engagement.ts`), so the JS
side must compare against local date keys, not `toISOString()`.

## How the schema is created and changed

`app/_layout.tsx` calls `runMigrations()` from `src/db/migrate.ts` before the first paint, and awaits
it before reading settings. The mechanism is deliberately primitive:

1. `createTables()` runs a `CREATE TABLE IF NOT EXISTS` per table plus `CREATE INDEX IF NOT EXISTS`
   per index.
2. Columns added after a table shipped are appended with `ALTER TABLE ... ADD COLUMN`, each wrapped
   in its own `try/catch` that swallows the "duplicate column name" error on every later launch.
3. `createViews()` drops all five views and recreates them, so a changed view definition takes effect
   on the next launch.

Two consequences an engineer needs to know:

- **Errors are swallowed.** `runMigrations()` catches everything and logs it; it never throws. If a
  statement fails, the app keeps running against a partial schema and fails later at query time.
  `app/_layout.tsx` has its own catch that forces analytics opt-out when initialization throws.
- **There is no version table.** The migration state is whatever `CREATE TABLE IF NOT EXISTS` and the
  `ALTER` attempts leave behind. Nothing records which migrations have run.

`drizzle-kit` is installed and `drizzle.config.ts` points at `./drizzle/migrations`, where three
generated migrations exist (`0000_smooth_dark_beast.sql`, `0001_add_srs_columns.sql`,
`0002_happy_king_cobra.sql`). **None of them is ever applied** — nothing imports
`drizzle-orm/expo-sqlite/migrator` or `useMigrations`, and the newest of the three stops at
`analytics_opt_out`, long before `exam_results`, `game_rounds` and `crossing_log` existed. Treat that
directory as dead.

`src/db/views.sql` is likewise not executed by anything. It is an older copy of the view definitions
that buckets days in UTC rather than local time; `migrate.ts` is what runs.

**Rule for any schema change:** edit `src/db/migrate.ts` *and* the matching `src/db/schema/*.ts`
file. `migrate.ts` decides what the database looks like; the Drizzle file decides what the query
types look like. Change one and the other drifts silently.

---

## Tables

### settings

One row, always `id = 1` (`SETTINGS_ID` in `src/db/queries/settings.ts`). `getSettings()` inserts the
row with the device-detected language on first call, and every accessor goes through it.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | always 1 in practice |
| `lang` | INTEGER | no | 1 | 1 = Slovak, 2 = English, 3 = Hungarian |
| `has_onboarded` | INTEGER | no | 0 | boolean; gates `app/index.tsx` routing |
| `has_chosen_language` | INTEGER | no | 0 | boolean; set on the language screen |
| `use_conservative_readiness` | INTEGER | no | 0 | boolean; readiness forecast mode |
| `analytics_opt_out` | INTEGER | no | 0 | boolean; read at launch before PostHog starts |
| `notification_morning_enabled` | INTEGER | no | 1 | boolean; 08:30 reminder slot |
| `notification_lunch_enabled` | INTEGER | no | 1 | boolean; 12:30 reminder slot |
| `notification_evening_enabled` | INTEGER | no | 1 | boolean; 19:00 reminder slot |
| `exam_date` | INTEGER | yes | — | planned real-exam date, Unix seconds; null = not set |
| `has_finished_guide` | INTEGER | no | 0 | boolean; the crossing guide has been completed once |
| `created_at` | INTEGER | no | — | Unix seconds |
| `updated_at` | INTEGER | no | — | Unix seconds; rewritten by every `updateSettings` |

No indexes.

`has_finished_guide` is added by an `ALTER TABLE` only — it is not in the `CREATE TABLE` statement, so
even a brand-new database gets it through the migration path.

**Written by** `src/db/queries/settings.ts` (`updateSettings`, `setLanguage`, `setReadinessMode`,
`setAnalyticsOptOut`, `setNotificationSlot`, `setExamDate`, `setGuideFinished`), all reached through
`src/lib/settings.js`. **Read by** `app/_layout.tsx` (analytics opt-out), `app/index.tsx`,
`app/home.tsx`, `app/settings.tsx`, `app/language.tsx`, `src/lib/notifications.ts` (which slots to
schedule) and `src/lib/readiness.js` (`exam_date`, conservative mode). A passed real exam clears
`exam_date` and turns all three notification slots off.

### category_selections

The category filter the user picked, one row per language.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | |
| `lang` | INTEGER | no | — | `UNIQUE(lang)` table constraint |
| `category_text` | TEXT | no | `'all'` | category name, or `'all'` |
| `updated_at` | INTEGER | no | — | Unix seconds |

Uniqueness comes from the inline `UNIQUE(lang)` constraint, so SQLite creates
`sqlite_autoindex_category_selections_1`; there is no named index.

**Written and read by** `src/db/queries/categorySelections.ts` via `src/lib/settings.js`
(`getSelectedCategory` / `setSelectedCategory`). `getCategorySelection` inserts the default `'all'`
row on first read. Consumed by `app/study.tsx` and `app/home.tsx` to scope Smart Practice.

### mistakes

The open mistake set with its spaced-repetition state. One row per (language, question); a question
leaves the table when it is mastered.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | installation id from `src/db/device.ts` |
| `lang` | INTEGER | no | — | |
| `question_id` | TEXT | no | — | `qid` from the question bank |
| `streak_count` | INTEGER | no | 0 | consecutive correct answers |
| `next_review_at` | INTEGER | yes | — | Unix seconds; null = due now |
| `interval_days` | INTEGER | no | 0 | current interval: 0, 1, 3 or 7 |
| `created_at` | INTEGER | no | — | |
| `updated_at` | INTEGER | no | — | |
| `synced_at` | INTEGER | yes | — | null = never synced; no sync backend exists |

```sql
CREATE INDEX mistakes_lang_idx ON mistakes(lang);
-- plus the inline UNIQUE(lang, question_id) table constraint
```

`next_review_at` and `interval_days` are also re-added by `ALTER TABLE` for databases created before
spaced repetition shipped.

**Written by** `src/db/queries/mistakes.ts`, reached from `applyAnswer` in `src/lib/engine.js` after
every answer in study, mistakes, mock and game modes. A wrong answer calls `addMistake` (insert, or
reset `streak_count`/`interval_days` to 0 and make it due now). A correct answer calls
`recordCorrectAnswer`, which walks the interval ladder 0 → 1 → 3 → 7 and deletes the row at the top.
**Read by** `app/mistakes.tsx`, `src/lib/smartPractice.js` (tier 1: due mistakes first, ordered by
`next_review_at` with nulls first), `app/home.tsx` and `src/lib/readiness.js` / `src/db/queries/stats.ts`
(`getOpenMistakes` feeds the forecast simulation).

### study_sessions

One row per study or mistakes-practice session — the container an attempt belongs to.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | |
| `lang` | INTEGER | no | — | |
| `mode` | TEXT | no | — | `'study'` or `'mistakes'` |
| `category_text` | TEXT | yes | — | category at session start |
| `started_at` | INTEGER | no | — | |
| `ended_at` | INTEGER | yes | — | null while the session is open |
| `questions_count` | INTEGER | yes | 0 | filled in by `endStudySession` |
| `correct_count` | INTEGER | yes | 0 | filled in by `endStudySession` |
| `synced_at` | INTEGER | yes | — | |

```sql
CREATE INDEX study_sessions_lang_idx ON study_sessions(lang);
CREATE INDEX study_sessions_date_idx ON study_sessions(started_at);
CREATE INDEX study_sessions_sync_idx ON study_sessions(synced_at);
```

**Written by** `src/db/queries/studySessions.ts` from `app/study.tsx` and `app/mistakes.tsx`
(`createStudySession` on entry, `endStudySession` on exit). Its `id` is carried into
`answer_attempts.session_id`. Nothing currently reads these rows back for statistics — every
aggregate is computed from `answer_attempts` instead — so the table is effectively write-only except
for the per-language delete in `resetStats`.

### mock_exams

One row per mock exam, created when the exam starts and updated when it finishes.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | |
| `lang` | INTEGER | no | — | |
| `test_id` | TEXT | no | — | `"L{lang}-T{testIndex}"` |
| `started_at` | INTEGER | no | — | |
| `completed_at` | INTEGER | yes | — | null = abandoned; every aggregate filters on this |
| `duration_sec` | INTEGER | yes | — | |
| `score` | INTEGER | yes | — | points scored |
| `max_score` | INTEGER | no | — | from the test definition |
| `min_to_pass` | INTEGER | no | — | from the test definition |
| `passed` | INTEGER | yes | — | boolean |
| `wrong_count` | INTEGER | yes | — | |
| `added_to_mistakes_count` | INTEGER | yes | 0 | set after the wrong answers are filed |
| `created_at` | INTEGER | no | — | |
| `synced_at` | INTEGER | yes | — | |

```sql
CREATE INDEX mock_exams_lang_idx ON mock_exams(lang);
CREATE INDEX mock_exams_date_idx ON mock_exams(created_at);
CREATE INDEX mock_exams_sync_idx ON mock_exams(synced_at);
```

**Written by** `src/db/queries/mockExams.ts` from `app/mock.tsx` (`createMockExam`,
`completeMockExam`, `updateAddedToMistakesCount`). **Read by** `getMockStats` in
`src/db/queries/stats.ts` (exams taken, passed, best and last score, plus a history list capped at
50) for the stats screen and the mock component of the readiness score, and by
`getCurrentStreak` / `getLastOpenedDate` in `src/db/queries/engagement.ts`, which count a passed mock
as an active day.

### exam_results

Outcomes of the **real** driving exam, as reported by the user. Event-sourced: one row per attempt,
never updated; a retake is a new row.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | |
| `lang` | INTEGER | no | — | |
| `passed` | INTEGER | no | — | boolean |
| `points` | INTEGER | no | — | 0..`max_points`, validated in the query helper |
| `max_points` | INTEGER | no | 100 | |
| `min_to_pass` | INTEGER | no | 90 | |
| `readiness_score` | INTEGER | yes | — | app readiness score frozen at save time; null = unknown |
| `taken_at` | INTEGER | no | — | date of the real exam |
| `created_at` | INTEGER | no | — | |
| `synced_at` | INTEGER | yes | — | |

```sql
CREATE INDEX exam_results_lang_idx ON exam_results(lang);
CREATE INDEX exam_results_date_idx ON exam_results(taken_at);
```

`readiness_score` exists so real outcomes can later calibrate the readiness model; the same value is
sent to PostHog as `exam_result_recorded`.

**Written by** `src/db/queries/examResults.ts` (`addExamResult`) from `app/exam.tsx`, which throws
rather than writing when `points` is not an integer in `[0, max_points]` or `taken_at` is not a valid
date. **Read by** `app/home.tsx` (`getLatestExamResult` / `hasPassedExam` drive the "Did you take the
exam?" card and the "passed" card that replaces the readiness section) and `app/settings.tsx`.

### game_rounds

One row per finished round of either minigame.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | |
| `lang` | INTEGER | no | — | |
| `mode` | TEXT | no | `'quiz'` | `'quiz'` (exam-picture quiz) or `'crossing'` (runner) |
| `score` | INTEGER | no | — | clamped to `max(0, round(score))` on write |
| `correct_count` | INTEGER | no | — | quiz: correct answers. crossing: junctions passed |
| `total` | INTEGER | no | — | quiz: situations played (10). crossing: junctions passed plus lives lost |
| `duration_sec` | INTEGER | yes | — | quiz writes it, crossing leaves it null |
| `created_at` | INTEGER | no | — | |
| `synced_at` | INTEGER | yes | — | |

```sql
CREATE INDEX game_rounds_lang_idx ON game_rounds(lang);
CREATE INDEX game_rounds_date_idx ON game_rounds(created_at);
```

`mode` is both in the `CREATE TABLE` and in an `ALTER TABLE ADD COLUMN`, for databases created before
the crossing runner shipped.

**Written by** `src/db/queries/gameRounds.ts` (`addGameRound`) from `app/game-quiz.tsx` and
`app/crossing.tsx`. **Read by** `app/game.tsx` (the hub shows rounds played and best score per mode),
and by the game-over cards in both games, through `getGameStats(lang, mode)` — `COUNT(*)` and
`MAX(score)` over the rows for that mode. Individual quiz answers are *also* logged to
`answer_attempts` with `mode = 'game'`, so they count toward the study aggregates; crossing junctions
are not answers and go to `crossing_log` instead.

### crossing_log

One row per junction driven in the crossing minigame, written as each `crash` or `passed` event
arrives so the drive log can replay it with a picture.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | |
| `lang` | INTEGER | no | — | |
| `run_id` | TEXT | no | — | groups the junctions of one run |
| `outcome` | TEXT | no | — | `'clean'`, `'crash'` or `'spoiled'` |
| `points` | INTEGER | no | — | clamped to `max(0, round(points))` on write |
| `record` | TEXT | no | — | JSON, see below |
| `created_at` | INTEGER | no | — | |
| `synced_at` | INTEGER | yes | — | |

```sql
CREATE INDEX crossing_log_lang_idx ON crossing_log(lang);
CREATE INDEX crossing_log_date_idx ON crossing_log(created_at);
```

`record` is the JSON returned by `junctionRecord()` in `src/lib/priority/world.js`: the junction index
and level, outcome flags (`crashed`, `hesitated`, `late`, `ranRed`, `ranStop`, `wrongWay`, `stopped`,
`stopSign`, `lights`, `laps`), the crash `culprit` and its `rule`, the instruction and the direction
actually taken (`executedTo`), the `blockers`, the resolved `order`, the `reasons` that involved the
player in either direction, and a drawable copy of the scene (`layout`, `arms`, `signs`, `mainRoad`,
`tramTracks`, `control`, `vehicles` with `ringAt`, `pedestrians`). The record repeats `outcome` and
`points` inside the JSON as well as in their own columns.

One gotcha in the JSON: the recorded `control` goes through `recordControl()`, which flips the light
colours when `crossFirst` was set, so the picture shows the lights as they were at the moment of
decision rather than the phase the scene encodes.

**Written by** `app/crossing.tsx` through `addCrossingLog`. **Read by** `app/crossing-log.tsx`
(`getRecentCrossingLog`, `getCrossingLogStats`), which renders each row as an `IntersectionScene`
thumbnail explained by `explainRecord()` in `src/lib/crossingLog.js`. `purgeCrossingLog(lang)` runs at
the end of every run and keeps the newest `LOG_KEEP` (300) rows per language. Rows that fail
`JSON.parse` are skipped rather than breaking the list. The full runner and the meaning of every
`record` field are in `docs/game/runner.md`.

### answer_attempts

The event log. Every answered question in every mode lands here, and every study statistic is derived
from it.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | TEXT | no | — | UUID primary key |
| `device_id` | TEXT | no | — | |
| `lang` | INTEGER | no | — | |
| `question_id` | TEXT | no | — | `qid` from the question bank |
| `mode` | TEXT | no | — | `'study'`, `'mistakes'`, `'mock'` or `'game'` |
| `session_id` | TEXT | yes | — | FK → `study_sessions(id)`; set in study mode |
| `mock_exam_id` | TEXT | yes | — | FK → `mock_exams(id)`; set in mock mode |
| `category_text` | TEXT | yes | — | category at the time of the attempt |
| `selected_answer_index` | INTEGER | no | — | 1, 2 or 3 |
| `correct_answer_index` | INTEGER | no | — | 1, 2 or 3 |
| `is_correct` | INTEGER | no | — | boolean |
| `points` | INTEGER | no | — | the question's point value |
| `question_shown_at` | INTEGER | no | — | Unix seconds |
| `answer_submitted_at` | INTEGER | no | — | Unix seconds |
| `response_time_ms` | INTEGER | no | — | milliseconds, computed in JS before the write |
| `was_in_mistakes` | INTEGER | no | 0 | boolean; was the question in `mistakes` when shown |
| `created_at` | INTEGER | no | — | the timestamp every aggregate groups by |
| `synced_at` | INTEGER | yes | — | |

```sql
CREATE INDEX answer_attempts_lang_idx ON answer_attempts(lang);
CREATE INDEX answer_attempts_question_idx ON answer_attempts(question_id);
CREATE INDEX answer_attempts_mode_idx ON answer_attempts(mode);
CREATE INDEX answer_attempts_session_idx ON answer_attempts(session_id);
CREATE INDEX answer_attempts_date_idx ON answer_attempts(created_at);
CREATE INDEX answer_attempts_mock_exam_idx ON answer_attempts(mock_exam_id);
CREATE INDEX answer_attempts_sync_idx ON answer_attempts(synced_at);
```

The two foreign keys are declared in the `CREATE TABLE` (and mirrored by `.references()` in the
Drizzle schema), but nothing in the app issues `PRAGMA foreign_keys = ON`, so SQLite does not enforce
them. Read them as documentation of intent.

`response_time_ms` is passed in by the caller in mock and game modes (accumulated time per question),
and otherwise computed as `answerSubmittedAt - questionShownAt` in `logAnswerAttempt`.

**Written by** `src/db/queries/attempts.ts` (`logAnswerAttempt`) from `app/study.tsx`,
`app/mistakes.tsx`, `app/mock.tsx` and `app/game-quiz.tsx`. **Read by**:

- `src/db/queries/stats.ts` — lifetime totals, daily buckets, per-category accuracy, questions seen,
  7-day accuracy, arbitrary day windows, mock-only accuracy, study pace. These feed `src/lib/stats.js`,
  `src/lib/readiness.js`, `app/home.tsx` and `app/stats.tsx`.
- `src/db/queries/engagement.ts` — the day streak and last-active dates, for the home screen and the
  notification scheduler.
- `src/db/queries/attempts.ts` — `getRecentQuestionIds` (the recency window Smart Practice uses to
  avoid repeats) and `getQuestionPerformanceStats` (per-question attempts, accuracy, average response
  time and last-seen, for the "shaky" tier of Smart Practice).

Which modes count where matters:

| aggregate | modes counted |
|---|---|
| study totals, daily, per-category, 7-day accuracy, day streak | `study`, `mistakes`, `game` |
| questions seen / coverage | all modes |
| study pace (attempts in the last 14 days) | all modes |
| mock accuracy | `mock` only |

---

## Views

All five views are created in `createViews()` in `src/db/migrate.ts`, dropped and recreated on every
launch. **No application code selects from them.** `src/db/queries/stats.ts` runs the equivalent
aggregate SQL against the base tables directly, with a `lang = ?` parameter and, where needed, a date
window the views do not have. The views are kept as the canonical statement of what each aggregate
means; when you change an aggregate, change both.

### v_questions_seen

```sql
SELECT DISTINCT lang, question_id FROM answer_attempts
```

Every question the user has answered at least once, in any mode. The coverage component of the
readiness score uses the same idea via `getQuestionsSeenCount` (`COUNT(DISTINCT question_id)` for one
language, no mode filter).

### v_daily_stats

```sql
SELECT lang,
       DATE(created_at, 'unixepoch', 'localtime') AS study_date,
       COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong
FROM answer_attempts
WHERE mode IN ('study', 'mistakes', 'game')
GROUP BY lang, DATE(created_at, 'unixepoch', 'localtime')
```

Attempts per local calendar day, counting `study`, `mistakes` and `game`. The equivalent with a day
window is `getDailyStats(lang, days)`, which `src/lib/stats.js` turns into `stats.study.daily` for the
stats screen's activity chart and for the readiness accuracy trend.

### v_category_stats

```sql
SELECT lang, category_text,
       COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong,
       ROUND(SUM(CASE WHEN is_correct THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) AS accuracy
FROM answer_attempts
WHERE category_text IS NOT NULL AND mode IN ('study', 'mistakes', 'game')
GROUP BY lang, category_text
```

Per-category accuracy, same three modes; mock attempts carry a `category_text` but are excluded. The
equivalent `getCategoryStats` feeds `stats.study.byCategory`, which the stats screen renders as the
category breakdown and Smart Practice uses as its weak-category tier.

### v_study_stats

```sql
SELECT lang,
       COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong
FROM answer_attempts
WHERE mode IN ('study', 'mistakes', 'game')
GROUP BY lang
```

Lifetime study totals, same three modes. The equivalent `getStudyStats` feeds the totals on the stats
screen.

### v_mock_stats

```sql
SELECT lang,
       COUNT(*) AS exams_taken,
       SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS exams_passed,
       MAX(score) AS best_score,
       (SELECT score FROM mock_exams m2
        WHERE m2.lang = mock_exams.lang
        ORDER BY completed_at DESC LIMIT 1) AS last_score
FROM mock_exams
WHERE completed_at IS NOT NULL
GROUP BY lang
```

The only view over `mock_exams` rather than `answer_attempts`. Abandoned exams (`completed_at IS
NULL`) are excluded. The equivalent `getMockStats` computes the same four numbers in JS plus a
50-row history list, for the stats screen and the mock component of the readiness score.

---

## Where the two schema sources disagree

`src/db/migrate.ts` is what runs; `src/db/schema/*.ts` is what the query types are built from. Today
they differ in three places:

1. **`mistakes` uniqueness.** `migrate.ts` uses an inline `UNIQUE(lang, question_id)` table
   constraint, which SQLite backs with `sqlite_autoindex_mistakes_1`. The Drizzle schema declares a
   named `uniqueIndex('mistakes_lang_question_unique')` that does not exist in the database. Same
   constraint, different name — anything that looks the index up by name will not find it.
2. **`category_selections` uniqueness.** Identical situation: inline `UNIQUE(lang)` in `migrate.ts`
   versus `uniqueIndex('category_selections_lang_unique')` in Drizzle.
3. **`settings.has_finished_guide`.** Present in the Drizzle schema and added by an `ALTER TABLE`,
   but missing from the `CREATE TABLE` in `migrate.ts`. A fresh database therefore only gets the
   column if that `ALTER` succeeds — and its failure would be swallowed.

Column names, types, nullability and defaults otherwise match one-for-one.

---

## What is deliberately not in SQLite

**The question bank.** All 3 × ~1000 questions, their answers, categories, point values and test
definitions stay in `data/data5.js` (about 5 MB of JavaScript), indexed by language: `data[0]` Slovak,
`data[1]` English, `data[2]` Hungarian. Question images are required through `data/imageManifest.js`
(~250 static `require()` entries) and looked up by the string key in each question's `obrazok` field.
The database refers to questions only by `question_id` (the `qid` string); joining a row back to its
text is a JavaScript lookup, not a SQL join.

Why it stays there: the bank is read-only content that ships with the binary, Metro already bundles
it, and React Native cannot `require()` an image by a path computed at runtime, so the image manifest
has to be static JavaScript regardless. Putting the bank in SQLite would mean an import step on first
launch, a second copy of 5 MB on disk, and no benefit — nothing queries questions by anything other
than id and category.

**AsyncStorage is legacy.** `src/lib/storage.js` is marked `@deprecated` and kept only for backward
compatibility and tests. The one live use of AsyncStorage is `src/db/device.ts`, which caches the
installation id under `DEVICE_ID` — it must survive outside the database because it is written into
`device_id` on every row.

**There is no sync backend.** Every table carries a `synced_at` column and a UUID primary key so rows
could be pushed to a server one day. Nothing writes `synced_at`; it is always null.

---

## Example queries

These run against the real schema. `?` parameters are Unix-seconds or language indexes as noted.

Lifetime study totals for one language (`getStudyStats`):

```sql
SELECT COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong
FROM answer_attempts
WHERE lang = ? AND mode IN ('study', 'mistakes', 'game');
```

Last 14 local days of activity (`getDailyStats`):

```sql
SELECT DATE(created_at, 'unixepoch', 'localtime') AS study_date,
       COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) AS wrong
FROM answer_attempts
WHERE lang = ?
  AND mode IN ('study', 'mistakes', 'game')
  AND DATE(created_at, 'unixepoch', 'localtime') >= DATE('now', 'localtime', '-' || ? || ' days')
GROUP BY DATE(created_at, 'unixepoch', 'localtime')
ORDER BY study_date DESC;
```

Coverage: how many distinct questions have been seen (`getQuestionsSeenCount`):

```sql
SELECT COUNT(DISTINCT question_id) AS count
FROM answer_attempts
WHERE lang = ?;
```

Per-question performance, the input to the "shaky" tier of Smart Practice
(`getQuestionPerformanceStats`):

```sql
SELECT question_id,
       COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
       AVG(response_time_ms) AS avg_response_time_ms,
       MAX(created_at) AS last_seen_at
FROM answer_attempts
WHERE lang = ? AND mode IN ('study', 'mistakes')
GROUP BY question_id
HAVING attempts >= 2;
```

Accuracy over mock attempts only — the closest thing to real-exam accuracy, since a mock is a random
sample of the bank (`getMockAccuracy`):

```sql
SELECT COUNT(*) AS attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct
FROM answer_attempts
WHERE lang = ? AND mode = 'mock';
```

Active days, for the streak (`getCurrentStreak` unions this with passed mock days and walks backwards
in JS):

```sql
SELECT DISTINCT DATE(created_at, 'unixepoch', 'localtime') AS study_date
FROM answer_attempts
WHERE lang = ? AND mode IN ('study', 'mistakes', 'game')
ORDER BY study_date DESC;
```

Open mistakes with their review schedule (`getOpenMistakes`, used by the readiness forecast):

```sql
SELECT interval_days, next_review_at
FROM mistakes
WHERE lang = ?;
```

Trimming the crossing drive log to the newest 300 rows per language (`purgeCrossingLog`):

```sql
DELETE FROM crossing_log
WHERE lang = ? AND id NOT IN (
  SELECT id FROM crossing_log
  WHERE lang = ?
  ORDER BY created_at DESC, rowid DESC
  LIMIT ?
);
```
