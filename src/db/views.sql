-- Database Views for Computed Statistics

-- Questions seen view (replaces coverage.questionsSeen)
CREATE VIEW IF NOT EXISTS v_questions_seen AS
SELECT DISTINCT lang, question_id
FROM answer_attempts;

-- Daily stats view (replaces study.daily)
-- Note: Drizzle stores timestamps as seconds (Unix epoch), so no need to divide by 1000
CREATE VIEW IF NOT EXISTS v_daily_stats AS
SELECT 
  lang,
  DATE(created_at, 'unixepoch') as study_date,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
FROM answer_attempts
WHERE mode IN ('study', 'mistakes')
GROUP BY lang, DATE(created_at, 'unixepoch');

-- Category stats view (replaces study.byCategory)
CREATE VIEW IF NOT EXISTS v_category_stats AS
SELECT 
  lang,
  category_text,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong,
  ROUND(SUM(CASE WHEN is_correct THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
FROM answer_attempts
WHERE category_text IS NOT NULL AND mode IN ('study', 'mistakes')
GROUP BY lang, category_text;

-- Study stats view (replaces study.attempts/correct/wrong)
CREATE VIEW IF NOT EXISTS v_study_stats AS
SELECT 
  lang,
  COUNT(*) as attempts,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
  SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
FROM answer_attempts
WHERE mode IN ('study', 'mistakes')
GROUP BY lang;

-- Mock stats view (replaces mock.* aggregates)
CREATE VIEW IF NOT EXISTS v_mock_stats AS
SELECT 
  lang,
  COUNT(*) as exams_taken,
  SUM(CASE WHEN passed THEN 1 ELSE 0 END) as exams_passed,
  MAX(score) as best_score,
  (SELECT score FROM mock_exams m2 
   WHERE m2.lang = mock_exams.lang 
   ORDER BY completed_at DESC LIMIT 1) as last_score
FROM mock_exams
WHERE completed_at IS NOT NULL
GROUP BY lang;
