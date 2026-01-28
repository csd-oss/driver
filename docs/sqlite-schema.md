# SQLite Schema Design for Driving Exam App

This document outlines the proposed SQLite database schema to replace the current AsyncStorage JSON-based data model.

## Key Design Decision: Event-Sourcing with Answer Attempts Table

**The core innovation**: Instead of maintaining separate aggregated tables (study_stats, daily_stats, mistakes, streaks), we store every answer attempt as an event in a single `answer_attempts` table. All statistics are then derived from this single source of truth.

**Why this approach?**
- ✅ Single source of truth - no sync issues between tables
- ✅ Can recalculate any statistic with updated logic
- ✅ Full history for debugging and analytics
- ✅ Easy to add new statistics without schema changes
- ✅ Impossible to have data inconsistencies

## Current Data Model Overview

### 1. **Settings** (`DRIVING_MVP_SETTINGS`)
Stored in AsyncStorage as JSON:
- `lang`: number (1-3)
- `hasOnboarded`: boolean
- `hasChosenLanguage`: boolean
- `selectedCategoryByLang`: object mapping language strings to category names
- `useConservativeReadiness`: boolean

### 2. **Progress** (`DRIVING_MVP_PROGRESS`)
Stored in AsyncStorage as JSON:
- `mistakesByLang`: object mapping language strings to arrays of question IDs
- `streaksByLang`: object mapping language strings to objects mapping question IDs to streak counts

### 3. **Statistics** (`DRIVING_MVP_STATS`)
Stored in AsyncStorage as JSON, nested by language:
- `study`: lifetime counters, daily counters (last 7-14 days), per-category counters
- `mock`: exam counters and history array (capped at 50)
- `engagement`: current streak, last study date, last opened date
- `coverage`: array of question IDs seen

### 4. **Question Bank** (`data/data5.js`)
Large JavaScript file with nested structure:
- Array of 3 languages: `data[0]`, `data[1]`, `data[2]`
- Each language contains an array of test objects
- Each test has: `pocet`, `cas`, `minbody`, `maxbody`, `otazky`, `odpovede`, `okruhy`

---

## SQLite Schema

### Event-Sourcing Approach: Answer Attempts as Single Source of Truth

Instead of maintaining separate aggregated tables, we store every answer attempt as an event. This makes it easier to:
- Derive any statistic from raw data
- Debug issues by seeing exact history
- Add new statistics without schema changes
- Recalculate aggregates if logic changes
- Track detailed patterns (time taken, retries, etc.)

```sql
-- ============================================
-- SETTINGS TABLE
-- ============================================
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON for complex values
);

-- Example rows:
-- ('lang', '2')
-- ('hasOnboarded', 'true')
-- ('selectedCategoryByLang', '{"1":"all","2":"all","3":"all"}')

-- ============================================
-- QUESTIONS & TESTS (from data5.js)
-- ============================================
CREATE TABLE languages (
  id INTEGER PRIMARY KEY CHECK(id IN (1, 2, 3)),
  name TEXT
);

CREATE TABLE tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL,
  test_index INTEGER NOT NULL,  -- Original index in data array
  pocet INTEGER NOT NULL,       -- Question count
  cas INTEGER NOT NULL,          -- Time limit (seconds)
  minbody INTEGER NOT NULL,     -- Pass threshold
  maxbody INTEGER NOT NULL,      -- Max points
  FOREIGN KEY (language_id) REFERENCES languages(id),
  UNIQUE(language_id, test_index)
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qid TEXT NOT NULL,             -- Original question ID from data
  test_id INTEGER NOT NULL,
  question_number INTEGER NOT NULL,  -- 1-based position in test
  text TEXT NOT NULL,
  points INTEGER NOT NULL,       -- body value
  image_filename TEXT,           -- obrazok value
  correct_answer INTEGER NOT NULL CHECK(correct_answer IN (1, 2, 3)),  -- platna
  FOREIGN KEY (test_id) REFERENCES tests(id),
  UNIQUE(qid, test_id)
);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  answer_number INTEGER NOT NULL CHECK(answer_number IN (1, 2, 3)),
  answer_text TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id),
  UNIQUE(question_id, answer_number)
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  category_number INTEGER NOT NULL,
  category_text TEXT NOT NULL,
  starts_at INTEGER,             -- zacina value
  FOREIGN KEY (test_id) REFERENCES tests(id)
);

-- ============================================
-- ANSWER ATTEMPTS (Event-Sourcing Table)
-- ============================================
-- This is the SINGLE SOURCE OF TRUTH for all user interactions
CREATE TABLE answer_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  context TEXT NOT NULL CHECK(context IN ('study', 'mistakes', 'mock')),  -- Where the attempt happened
  user_answer INTEGER NOT NULL CHECK(user_answer IN (1, 2, 3)),  -- Answer chosen by user
  is_correct INTEGER NOT NULL CHECK(is_correct IN (0, 1)),  -- Was the answer correct?
  category_name TEXT,            -- Category if applicable (NULL for 'all')
  mock_exam_id TEXT,             -- UUID if part of a mock exam (NULL otherwise)
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),  -- Unix timestamp when answer was submitted
  date_key TEXT NOT NULL,         -- yyyyMMdd format for easy date grouping
  -- Timing analytics fields
  question_shown_at INTEGER,      -- Unix timestamp when question was first displayed
  answer_time_ms INTEGER,         -- Milliseconds between question_shown_at and timestamp (NULL if question_shown_at is NULL)
  FOREIGN KEY (language_id) REFERENCES languages(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- ============================================
-- MOCK EXAMS (Still needed for exam-level data)
-- ============================================
CREATE TABLE mock_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL,
  exam_id TEXT NOT NULL UNIQUE,  -- UUID
  test_id INTEGER,               -- Reference to tests table
  date_timestamp INTEGER NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  min_to_pass INTEGER NOT NULL,
  passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
  duration_sec INTEGER,
  wrong_count INTEGER,
  added_to_mistakes_count INTEGER,
  FOREIGN KEY (language_id) REFERENCES languages(id),
  FOREIGN KEY (test_id) REFERENCES tests(id)
);

-- ============================================
-- QUESTION COVERAGE (First-seen tracking)
-- ============================================
CREATE TABLE question_coverage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  first_seen_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (language_id) REFERENCES languages(id),
  FOREIGN KEY (question_id) REFERENCES questions(id),
  UNIQUE(language_id, question_id)
);

-- ============================================
-- INDEXES for Performance
-- ============================================
CREATE INDEX idx_questions_qid ON questions(qid);
CREATE INDEX idx_questions_test_id ON questions(test_id);
CREATE INDEX idx_answer_attempts_lang_qid ON answer_attempts(language_id, question_id);
CREATE INDEX idx_answer_attempts_lang_date ON answer_attempts(language_id, date_key);
CREATE INDEX idx_answer_attempts_lang_context ON answer_attempts(language_id, context);
CREATE INDEX idx_answer_attempts_lang_category ON answer_attempts(language_id, category_name);
CREATE INDEX idx_answer_attempts_mock_exam ON answer_attempts(mock_exam_id);
CREATE INDEX idx_answer_attempts_timestamp ON answer_attempts(timestamp DESC);
CREATE INDEX idx_answer_attempts_answer_time ON answer_attempts(answer_time_ms) WHERE answer_time_ms IS NOT NULL;
CREATE INDEX idx_mock_exams_lang_date ON mock_exams(language_id, date_timestamp DESC);
CREATE INDEX idx_coverage_lang_qid ON question_coverage(language_id, question_id);
```

---

## Derived Views and Queries

All statistics can be derived from `answer_attempts`. Here are views and queries that replace the old aggregated tables:

### 1. Current Mistakes (Derived View)
```sql
-- Questions that have wrong answers but haven't been corrected yet
-- Logic: Question is in mistakes if:
--   - Has at least one wrong answer
--   - Last 2 answers were NOT both correct (streak < 2)
CREATE VIEW current_mistakes AS
SELECT DISTINCT
  a1.language_id,
  a1.question_id,
  MAX(a1.timestamp) as last_wrong_at
FROM answer_attempts a1
WHERE a1.is_correct = 0
  AND a1.context IN ('study', 'mistakes', 'mock')
  AND NOT EXISTS (
    -- Check if last 2 answers were correct (would remove from mistakes)
    SELECT 1
    FROM answer_attempts a2
    WHERE a2.language_id = a1.language_id
      AND a2.question_id = a1.question_id
      AND a2.context IN ('study', 'mistakes', 'mock')
      AND a2.timestamp > a1.timestamp
    GROUP BY a2.language_id, a2.question_id
    HAVING COUNT(*) >= 2
       AND SUM(a2.is_correct) = 2  -- Last 2 were correct
  )
GROUP BY a1.language_id, a1.question_id;
```

### 2. Streaks (Derived View)
```sql
-- Current streak count for each question
CREATE VIEW question_streaks AS
SELECT
  language_id,
  question_id,
  COUNT(*) as streak_count
FROM (
  SELECT
    language_id,
    question_id,
    is_correct,
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY language_id, question_id 
      ORDER BY timestamp DESC
    ) as rn
  FROM answer_attempts
  WHERE context IN ('study', 'mistakes', 'mock')
) ranked
WHERE rn <= 2  -- Check last 2 answers
  AND is_correct = 1
GROUP BY language_id, question_id
HAVING COUNT(*) = 2;  -- Both last 2 were correct
```

### 3. Study Stats (Derived View)
```sql
CREATE VIEW study_stats AS
SELECT
  language_id,
  COUNT(*) as attempts,
  SUM(is_correct) as correct,
  COUNT(*) - SUM(is_correct) as wrong
FROM answer_attempts
WHERE context IN ('study', 'mistakes')
GROUP BY language_id;
```

### 4. Daily Stats (Derived View)
```sql
CREATE VIEW daily_stats AS
SELECT
  language_id,
  date_key,
  COUNT(*) as attempts,
  SUM(is_correct) as correct,
  COUNT(*) - SUM(is_correct) as wrong
FROM answer_attempts
WHERE context IN ('study', 'mistakes')
GROUP BY language_id, date_key;
```

### 5. Category Stats (Derived View)
```sql
CREATE VIEW category_stats AS
SELECT
  language_id,
  category_name,
  COUNT(*) as attempts,
  SUM(is_correct) as correct,
  COUNT(*) - SUM(is_correct) as wrong
FROM answer_attempts
WHERE context IN ('study', 'mistakes')
  AND category_name IS NOT NULL
GROUP BY language_id, category_name;
```

### 6. Engagement Streak (Derived Query)
```sql
-- Calculate current streak from answer_attempts
WITH study_dates AS (
  SELECT DISTINCT
    language_id,
    date_key,
    ROW_NUMBER() OVER (
      PARTITION BY language_id 
      ORDER BY date_key DESC
    ) as days_ago
  FROM answer_attempts
  WHERE context IN ('study', 'mistakes', 'mock')
    AND is_correct = 1  -- Only count days with correct answers
),
consecutive_days AS (
  SELECT
    language_id,
    date_key,
    days_ago,
    date_key = date('now', '-' || (days_ago - 1) || ' days') as is_consecutive
  FROM study_dates
  WHERE days_ago <= 30  -- Check last 30 days
)
SELECT
  language_id,
  COUNT(*) as current_streak
FROM consecutive_days
WHERE is_consecutive = 1
GROUP BY language_id;
```

### 7. Mock Exam Summary (Derived View)
```sql
CREATE VIEW mock_exam_summary AS
SELECT
  m.language_id,
  COUNT(DISTINCT m.exam_id) as exams_taken,
  SUM(m.passed) as exams_passed,
  MAX(m.score) as best_score,
  (SELECT score FROM mock_exams m2 
   WHERE m2.language_id = m.language_id 
   ORDER BY m2.date_timestamp DESC LIMIT 1) as last_score
FROM mock_exams m
GROUP BY m.language_id;
```

---

## Benefits of Answer Attempts Table Approach

### Advantages Over Aggregated Tables

1. **Single Source of Truth**: All statistics derived from one table - no sync issues
2. **Historical Accuracy**: Can recalculate any statistic at any time with updated logic
3. **Debugging**: See exact sequence of answers for troubleshooting
4. **Flexibility**: Add new statistics without schema changes (just new queries)
5. **Data Integrity**: Impossible to have mismatched aggregates
6. **Rich Analytics**: Can analyze patterns like:
   - Time between attempts
   - Retry patterns
   - Performance by time of day
   - Learning curves per question
   - Category difficulty over time

### Timing Analytics Insights

With `question_shown_at` and `answer_time_ms` fields, you can gain powerful insights:

#### Learning & Mastery Tracking
- **Speed improvement**: Track if users get faster at questions over time (indicator of mastery)
- **Learning curves**: See how answer time correlates with accuracy improvements
- **Problem identification**: Questions that consistently take long time = areas needing more practice

#### Performance Optimization
- **Optimal answer time**: Find the "sweet spot" where accuracy is highest (not too fast, not too slow)
- **Speed vs accuracy tradeoff**: Understand if rushing hurts performance or if overthinking causes mistakes
- **Category difficulty**: Identify which categories take longest (may need more study time)

#### User Experience Insights
- **Engagement patterns**: Average time per session, time distribution throughout the day
- **Mock exam pacing**: Compare time spent per question in practice vs mock exams
- **Question difficulty validation**: If a question consistently takes >30s, it might be poorly worded

#### Adaptive Learning Opportunities
- **Smart practice enhancement**: Prioritize questions where user takes too long (even if correct)
- **Readiness scoring**: Factor in answer speed (fast + accurate = ready, slow + correct = needs more practice)
- **Personalized feedback**: "You're getting faster at this question!" or "Take your time, accuracy matters more"

### Performance Considerations

- **Storage**: Each attempt is ~50 bytes. For 10,000 attempts = ~500KB (negligible)
- **Query Speed**: Indexes make aggregations fast. Views can be materialized if needed
- **Caching**: Can cache derived stats in memory/app state, refresh on demand

### When to Use Materialized Views

For frequently accessed stats (like home screen), consider materialized views or cached aggregates:
```sql
-- Option 1: Materialized view (refresh periodically)
CREATE TABLE study_stats_cache AS SELECT * FROM study_stats;
CREATE INDEX idx_study_stats_cache_lang ON study_stats_cache(language_id);

-- Option 2: Update cache on insert trigger
CREATE TRIGGER refresh_study_stats AFTER INSERT ON answer_attempts
BEGIN
  DELETE FROM study_stats_cache WHERE language_id = NEW.language_id;
  INSERT INTO study_stats_cache SELECT * FROM study_stats WHERE language_id = NEW.language_id;
END;
```

---

## Benefits of SQLite Migration

1. **Query Performance**: Indexed lookups instead of scanning JSON arrays
2. **Data Integrity**: Foreign keys and constraints ensure consistency
3. **Scalability**: Better handling of large datasets (especially question bank)
4. **Analytics**: SQL queries enable complex statistics calculations
5. **Relationships**: Normalized structure makes data relationships explicit
6. **Concurrency**: SQLite handles concurrent reads efficiently
7. **Event Sourcing**: Answer attempts table enables powerful analytics and debugging

## Migration Considerations

1. **One-time Import**: Migrate `data5.js` into normalized tables
2. **Data Migration**: Convert existing AsyncStorage JSON to SQLite rows
3. **API Layer**: Replace AsyncStorage calls with SQLite queries
4. **Backward Compatibility**: Consider keeping AsyncStorage as backup during transition

## Example Queries

### Insert an Answer Attempt
```sql
-- Study/Mistakes screen answer (with timing)
INSERT INTO answer_attempts (
  language_id, question_id, context, user_answer, is_correct, 
  category_name, date_key, question_shown_at, answer_time_ms
) VALUES (
  2, 
  (SELECT id FROM questions WHERE qid = '1469'),
  'study',
  1,  -- User chose answer 1
  (SELECT CASE WHEN 1 = correct_answer THEN 1 ELSE 0 END FROM questions WHERE qid = '1469'),
  'Traffic Signs',  -- or NULL for 'all'
  strftime('%Y%m%d', 'now'),
  1706284800000,  -- Unix timestamp in milliseconds when question was shown
  12500  -- 12.5 seconds to answer (in milliseconds)
);

-- Mock exam answer (linked to exam, with timing)
INSERT INTO answer_attempts (
  language_id, question_id, context, user_answer, is_correct,
  mock_exam_id, date_key, question_shown_at, answer_time_ms
) VALUES (
  2,
  (SELECT id FROM questions WHERE qid = '1035'),
  'mock',
  3,
  (SELECT CASE WHEN 3 = correct_answer THEN 1 ELSE 0 END FROM questions WHERE qid = '1035'),
  '550e8400-e29b-41d4-a716-446655440000',  -- Mock exam UUID
  strftime('%Y%m%d', 'now'),
  1706284900000,  -- Question shown timestamp
  8500  -- 8.5 seconds to answer
);

-- Note: In application code, you'd typically do:
-- const questionShownAt = Date.now();  // When question loads
-- // ... user thinks ...
-- const answerTimeMs = Date.now() - questionShownAt;  // When answer submitted
```

### Get all mistakes for a language (from answer_attempts)
```sql
SELECT q.qid, q.text, cm.last_wrong_at
FROM current_mistakes cm
JOIN questions q ON cm.question_id = q.id
WHERE cm.language_id = 2
ORDER BY cm.last_wrong_at DESC;
```

### Get study stats for last 7 days
```sql
SELECT 
  date_key, 
  attempts, 
  correct, 
  wrong,
  ROUND(correct * 100.0 / NULLIF(attempts, 0), 1) as accuracy_pct
FROM daily_stats
WHERE language_id = 2
  AND date_key >= strftime('%Y%m%d', date('now', '-7 days'))
ORDER BY date_key DESC;
```

### Get readiness score components (all from answer_attempts)
```sql
-- Mistakes component
SELECT COUNT(DISTINCT question_id) as mistake_count
FROM current_mistakes
WHERE language_id = 2;

-- Performance component (last 7 days)
SELECT 
  COUNT(*) as total_attempts,
  SUM(is_correct) as total_correct,
  ROUND(SUM(is_correct) * 100.0 / NULLIF(COUNT(*), 0), 1) as accuracy_pct
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
  AND date_key >= strftime('%Y%m%d', date('now', '-7 days'));

-- Mock exam component
SELECT 
  COUNT(DISTINCT exam_id) as exams_taken,
  SUM(passed) as exams_passed,
  ROUND(SUM(passed) * 100.0 / NULLIF(COUNT(DISTINCT exam_id), 0), 1) as pass_rate
FROM mock_exams
WHERE language_id = 2;

-- Coverage component
SELECT 
  COUNT(*) as questions_seen,
  (SELECT COUNT(*) FROM questions q JOIN tests t ON q.test_id = t.id WHERE t.language_id = 2) as total_questions,
  ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM questions q JOIN tests t ON q.test_id = t.id WHERE t.language_id = 2), 0), 1) as coverage_pct
FROM question_coverage
WHERE language_id = 2;
```

### Advanced Analytics Queries

#### Questions user struggles with most
```sql
SELECT 
  q.qid,
  q.text,
  COUNT(*) as total_attempts,
  SUM(aa.is_correct) as correct_count,
  ROUND(SUM(aa.is_correct) * 100.0 / COUNT(*), 1) as accuracy_pct
FROM answer_attempts aa
JOIN questions q ON aa.question_id = q.id
WHERE aa.language_id = 2
  AND aa.context IN ('study', 'mistakes')
GROUP BY q.id, q.qid, q.text
HAVING COUNT(*) >= 3  -- At least 3 attempts
ORDER BY accuracy_pct ASC, total_attempts DESC
LIMIT 10;
```

#### Learning progress over time
```sql
SELECT 
  date_key,
  COUNT(*) as attempts,
  ROUND(AVG(is_correct) * 100, 1) as daily_accuracy,
  -- Moving average (last 7 days)
  ROUND(AVG(AVG(is_correct)) OVER (
    ORDER BY date_key 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) * 100, 1) as moving_avg_accuracy
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
GROUP BY date_key
ORDER BY date_key DESC
LIMIT 30;
```

#### Category performance breakdown
```sql
SELECT 
  category_name,
  COUNT(*) as attempts,
  SUM(is_correct) as correct,
  ROUND(SUM(is_correct) * 100.0 / COUNT(*), 1) as accuracy_pct
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
  AND category_name IS NOT NULL
GROUP BY category_name
ORDER BY accuracy_pct ASC;
```

### Timing Analytics Queries

#### Average answer time by question difficulty
```sql
SELECT 
  q.qid,
  q.text,
  COUNT(*) as attempts,
  ROUND(AVG(aa.answer_time_ms) / 1000.0, 1) as avg_time_seconds,
  ROUND(AVG(aa.is_correct) * 100, 1) as accuracy_pct,
  -- Time for correct vs wrong answers
  ROUND(AVG(CASE WHEN aa.is_correct = 1 THEN aa.answer_time_ms END) / 1000.0, 1) as avg_time_correct_sec,
  ROUND(AVG(CASE WHEN aa.is_correct = 0 THEN aa.answer_time_ms END) / 1000.0, 1) as avg_time_wrong_sec
FROM answer_attempts aa
JOIN questions q ON aa.question_id = q.id
WHERE aa.language_id = 2
  AND aa.answer_time_ms IS NOT NULL
GROUP BY q.id, q.qid, q.text
HAVING attempts >= 3
ORDER BY avg_time_seconds DESC
LIMIT 20;
```

#### Learning curve: Does speed improve over time?
```sql
SELECT 
  date_key,
  COUNT(*) as attempts,
  ROUND(AVG(answer_time_ms) / 1000.0, 1) as avg_time_seconds,
  ROUND(AVG(is_correct) * 100, 1) as accuracy_pct,
  -- Compare to previous 7-day average
  ROUND(AVG(AVG(answer_time_ms)) OVER (
    ORDER BY date_key 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) / 1000.0, 1) as moving_avg_time_seconds
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
  AND answer_time_ms IS NOT NULL
GROUP BY date_key
ORDER BY date_key DESC
LIMIT 30;
```

#### Questions that take longest (potential problem areas)
```sql
SELECT 
  q.qid,
  q.text,
  COUNT(*) as attempts,
  ROUND(AVG(aa.answer_time_ms) / 1000.0, 1) as avg_time_seconds,
  ROUND(MAX(aa.answer_time_ms) / 1000.0, 1) as max_time_seconds,
  ROUND(AVG(aa.is_correct) * 100, 1) as accuracy_pct
FROM answer_attempts aa
JOIN questions q ON aa.question_id = q.id
WHERE aa.language_id = 2
  AND aa.answer_time_ms IS NOT NULL
GROUP BY q.id, q.qid, q.text
HAVING attempts >= 2
ORDER BY avg_time_seconds DESC
LIMIT 15;
```

#### Speed vs accuracy correlation
```sql
-- Are faster answers more accurate? Or do users need more time?
SELECT 
  CASE 
    WHEN answer_time_ms < 5000 THEN 'Very Fast (<5s)'
    WHEN answer_time_ms < 10000 THEN 'Fast (5-10s)'
    WHEN answer_time_ms < 20000 THEN 'Medium (10-20s)'
    WHEN answer_time_ms < 30000 THEN 'Slow (20-30s)'
    ELSE 'Very Slow (>30s)'
  END as speed_category,
  COUNT(*) as attempts,
  ROUND(AVG(answer_time_ms) / 1000.0, 1) as avg_time_seconds,
  ROUND(AVG(is_correct) * 100, 1) as accuracy_pct
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
  AND answer_time_ms IS NOT NULL
GROUP BY speed_category
ORDER BY avg_time_seconds;
```

#### Category timing analysis
```sql
SELECT 
  category_name,
  COUNT(*) as attempts,
  ROUND(AVG(answer_time_ms) / 1000.0, 1) as avg_time_seconds,
  ROUND(AVG(is_correct) * 100, 1) as accuracy_pct,
  -- Time difference between correct and wrong
  ROUND(AVG(CASE WHEN is_correct = 1 THEN answer_time_ms END) / 1000.0, 1) as avg_time_correct,
  ROUND(AVG(CASE WHEN is_correct = 0 THEN answer_time_ms END) / 1000.0, 1) as avg_time_wrong
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
  AND category_name IS NOT NULL
  AND answer_time_ms IS NOT NULL
GROUP BY category_name
ORDER BY avg_time_seconds DESC;
```

#### Time improvement per question (mastery tracking)
```sql
-- Track if user is getting faster at specific questions (mastery indicator)
WITH question_attempts AS (
  SELECT 
    question_id,
    answer_time_ms,
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY question_id 
      ORDER BY timestamp
    ) as attempt_number
  FROM answer_attempts
  WHERE language_id = 2
    AND context IN ('study', 'mistakes')
    AND answer_time_ms IS NOT NULL
),
first_vs_latest AS (
  SELECT 
    question_id,
    MAX(CASE WHEN attempt_number = 1 THEN answer_time_ms END) as first_time,
    MAX(CASE WHEN attempt_number >= 3 THEN answer_time_ms END) as latest_time,
    COUNT(*) as total_attempts
  FROM question_attempts
  GROUP BY question_id
  HAVING COUNT(*) >= 3  -- At least 3 attempts
)
SELECT 
  q.qid,
  q.text,
  fvl.total_attempts,
  ROUND(fvl.first_time / 1000.0, 1) as first_time_seconds,
  ROUND(fvl.latest_time / 1000.0, 1) as latest_time_seconds,
  ROUND((fvl.first_time - fvl.latest_time) / 1000.0, 1) as improvement_seconds,
  ROUND((1.0 - (fvl.latest_time * 1.0 / fvl.first_time)) * 100, 1) as improvement_pct
FROM first_vs_latest fvl
JOIN questions q ON fvl.question_id = q.id
WHERE fvl.latest_time < fvl.first_time  -- Only show improvements
ORDER BY improvement_pct DESC
LIMIT 20;
```

#### Mock exam timing analysis
```sql
-- Average time per question in mock exams
SELECT 
  me.exam_id,
  me.date_timestamp,
  me.score,
  me.passed,
  COUNT(aa.id) as questions_answered,
  ROUND(AVG(aa.answer_time_ms) / 1000.0, 1) as avg_time_per_question_sec,
  ROUND(SUM(aa.answer_time_ms) / 1000.0 / 60.0, 1) as total_time_minutes,
  ROUND(AVG(aa.is_correct) * 100, 1) as accuracy_pct
FROM mock_exams me
LEFT JOIN answer_attempts aa ON me.exam_id = aa.mock_exam_id
WHERE me.language_id = 2
  AND aa.answer_time_ms IS NOT NULL
GROUP BY me.exam_id, me.date_timestamp, me.score, me.passed
ORDER BY me.date_timestamp DESC
LIMIT 10;
```

#### Optimal answer time range (where accuracy is highest)
```sql
-- Find the "sweet spot" for answer time where accuracy is highest
SELECT 
  CASE 
    WHEN answer_time_ms < 3000 THEN '0-3s'
    WHEN answer_time_ms < 5000 THEN '3-5s'
    WHEN answer_time_ms < 8000 THEN '5-8s'
    WHEN answer_time_ms < 12000 THEN '8-12s'
    WHEN answer_time_ms < 18000 THEN '12-18s'
    WHEN answer_time_ms < 25000 THEN '18-25s'
    WHEN answer_time_ms < 35000 THEN '25-35s'
    ELSE '35s+'
  END as time_range,
  COUNT(*) as attempts,
  ROUND(AVG(is_correct) * 100, 1) as accuracy_pct,
  ROUND(AVG(answer_time_ms) / 1000.0, 1) as avg_time_seconds
FROM answer_attempts
WHERE language_id = 2
  AND context IN ('study', 'mistakes')
  AND answer_time_ms IS NOT NULL
GROUP BY time_range
HAVING attempts >= 10  -- Only show ranges with enough data
ORDER BY accuracy_pct DESC;
```

---

## Implementing Mistakes & Streaks Logic

The current app logic:
- Wrong answer → add to mistakes, reset streak to 0
- Correct answer + question in mistakes → increment streak
- Streak >= 2 → remove from mistakes

This can be implemented using `answer_attempts`:

### Get Current Mistakes (Questions that need practice)
```sql
-- Questions with wrong answers that haven't been mastered (streak < 2)
WITH question_history AS (
  SELECT 
    language_id,
    question_id,
    is_correct,
    timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY language_id, question_id 
      ORDER BY timestamp DESC
    ) as attempt_num
  FROM answer_attempts
  WHERE context IN ('study', 'mistakes', 'mock')
),
last_two_attempts AS (
  SELECT 
    language_id,
    question_id,
    SUM(is_correct) as correct_count,
    MAX(CASE WHEN attempt_num = 1 THEN is_correct END) as last_was_correct
  FROM question_history
  WHERE attempt_num <= 2
  GROUP BY language_id, question_id
)
SELECT DISTINCT
  aa.language_id,
  aa.question_id,
  MAX(aa.timestamp) as last_wrong_at
FROM answer_attempts aa
JOIN last_two_attempts lta ON 
  aa.language_id = lta.language_id 
  AND aa.question_id = lta.question_id
WHERE aa.is_correct = 0
  AND (lta.correct_count < 2 OR lta.last_was_correct = 0)  -- Not mastered
GROUP BY aa.language_id, aa.question_id;
```

### Get Streak Count for a Question
```sql
-- Get current streak (consecutive correct answers) for a question
WITH recent_attempts AS (
  SELECT 
    language_id,
    question_id,
    is_correct,
    ROW_NUMBER() OVER (
      PARTITION BY language_id, question_id 
      ORDER BY timestamp DESC
    ) as rn
  FROM answer_attempts
  WHERE context IN ('study', 'mistakes', 'mock')
)
SELECT 
  language_id,
  question_id,
  COUNT(*) as streak_count
FROM recent_attempts
WHERE is_correct = 1
  AND rn <= (
    SELECT rn FROM recent_attempts r2 
    WHERE r2.language_id = recent_attempts.language_id 
      AND r2.question_id = recent_attempts.question_id 
      AND r2.is_correct = 0 
    ORDER BY r2.rn ASC 
    LIMIT 1
  ) OR NOT EXISTS (
    SELECT 1 FROM recent_attempts r3
    WHERE r3.language_id = recent_attempts.language_id
      AND r3.question_id = recent_attempts.question_id
      AND r3.is_correct = 0
  )
GROUP BY language_id, question_id;
```

### Simplified Approach: Store Mistakes/Streaks as Derived Tables

For better performance, you can maintain `mistakes` and `streaks` tables updated via triggers:

```sql
-- Keep mistakes table updated automatically
CREATE TRIGGER update_mistakes_after_answer AFTER INSERT ON answer_attempts
BEGIN
  -- If wrong answer, add to mistakes (if not already there)
  IF NEW.is_correct = 0 AND NEW.context IN ('study', 'mistakes', 'mock') THEN
    INSERT OR IGNORE INTO mistakes (language_id, question_id, added_at)
    VALUES (NEW.language_id, NEW.question_id, NEW.timestamp);
    
    -- Reset streak
    DELETE FROM streaks WHERE language_id = NEW.language_id AND question_id = NEW.question_id;
  END IF;
  
  -- If correct answer and question is in mistakes
  IF NEW.is_correct = 1 AND NEW.context IN ('study', 'mistakes', 'mock') THEN
    -- Check if question is in mistakes
    IF EXISTS (SELECT 1 FROM mistakes WHERE language_id = NEW.language_id AND question_id = NEW.question_id) THEN
      -- Increment streak
      INSERT INTO streaks (language_id, question_id, streak_count, last_updated)
      VALUES (NEW.language_id, NEW.question_id, 1, NEW.timestamp)
      ON CONFLICT(language_id, question_id) DO UPDATE SET
        streak_count = streak_count + 1,
        last_updated = NEW.timestamp;
      
      -- If streak >= 2, remove from mistakes
      IF (SELECT streak_count FROM streaks WHERE language_id = NEW.language_id AND question_id = NEW.question_id) >= 2 THEN
        DELETE FROM mistakes WHERE language_id = NEW.language_id AND question_id = NEW.question_id;
        DELETE FROM streaks WHERE language_id = NEW.language_id AND question_id = NEW.question_id;
      END IF;
    END IF;
  END IF;
END;
```

Note: SQLite doesn't support IF statements in triggers directly. You'd need to use a stored procedure or handle this logic in application code. The trigger approach works better with PostgreSQL/MySQL. For SQLite, handle this in application code when inserting answer attempts.

---

## Notes

- Timestamps use Unix epoch seconds (`strftime('%s', 'now')`)
- Date keys use `yyyyMMdd` format for consistency with current implementation
- Foreign keys ensure referential integrity
- Unique constraints prevent duplicate data
- Indexes optimize common query patterns
- **Answer attempts table** is the single source of truth - all other stats are derived
- For performance-critical queries, consider materialized views or cached aggregates
- Mistakes/streaks logic can be implemented via queries or maintained in separate tables updated on insert
- **Timing fields**: 
  - `question_shown_at`: Unix timestamp in milliseconds when question was displayed
  - `answer_time_ms`: Milliseconds between question display and answer submission
  - Both fields are nullable (for backward compatibility and cases where timing isn't tracked)
  - In application code: `question_shown_at = Date.now()` when question loads, `answer_time_ms = Date.now() - question_shown_at` when answer submitted
