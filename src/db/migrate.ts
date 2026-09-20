import { database, databaseReady } from './index';

/**
 * Run migrations - create tables and views
 * This will be called at app startup
 */
export async function runMigrations(): Promise<void> {
  try {
    await databaseReady;
    // Create all tables and run schema migrations
    await createTables();

    // Run view definitions
    await createViews();
  } catch (error) {
    console.error('Migration error:', error);
    // Don't throw - allow app to continue even if migrations fail
  }
}

/**
 * Create all database tables
 */
async function createTables(): Promise<void> {
  // Settings table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang INTEGER NOT NULL DEFAULT 1,
      has_onboarded INTEGER NOT NULL DEFAULT 0,
      has_chosen_language INTEGER NOT NULL DEFAULT 0,
      use_conservative_readiness INTEGER NOT NULL DEFAULT 0,
      analytics_opt_out INTEGER NOT NULL DEFAULT 0,
      notification_morning_enabled INTEGER NOT NULL DEFAULT 1,
      notification_lunch_enabled INTEGER NOT NULL DEFAULT 1,
      notification_evening_enabled INTEGER NOT NULL DEFAULT 1,
      exam_date INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  try {
    await database.execAsync(`ALTER TABLE settings ADD COLUMN analytics_opt_out INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await database.execAsync(`ALTER TABLE settings ADD COLUMN notification_morning_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await database.execAsync(`ALTER TABLE settings ADD COLUMN notification_lunch_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await database.execAsync(`ALTER TABLE settings ADD COLUMN notification_evening_enabled INTEGER NOT NULL DEFAULT 1`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await database.execAsync(`ALTER TABLE settings ADD COLUMN exam_date INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }

  try {
    await database.execAsync(`ALTER TABLE settings ADD COLUMN has_finished_guide INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {
    // Column already exists
  }

  // Category selections table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS category_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang INTEGER NOT NULL,
      category_text TEXT NOT NULL DEFAULT 'all',
      updated_at INTEGER NOT NULL,
      UNIQUE(lang)
    )
  `);

  // Mistakes table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS mistakes (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      streak_count INTEGER NOT NULL DEFAULT 0,
      next_review_at INTEGER,
      interval_days INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      UNIQUE(lang, question_id)
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS mistakes_lang_idx ON mistakes(lang)`);
  
  // Add new columns to existing mistakes table if they don't exist (migration)
  try {
    await database.execAsync(`ALTER TABLE mistakes ADD COLUMN next_review_at INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    await database.execAsync(`ALTER TABLE mistakes ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 0`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Study sessions table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      mode TEXT NOT NULL,
      category_text TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      questions_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      synced_at INTEGER
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS study_sessions_lang_idx ON study_sessions(lang)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS study_sessions_date_idx ON study_sessions(started_at)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS study_sessions_sync_idx ON study_sessions(synced_at)`);

  // Mock exams table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS mock_exams (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      test_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_sec INTEGER,
      score INTEGER,
      max_score INTEGER NOT NULL,
      min_to_pass INTEGER NOT NULL,
      passed INTEGER,
      wrong_count INTEGER,
      added_to_mistakes_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS mock_exams_lang_idx ON mock_exams(lang)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS mock_exams_date_idx ON mock_exams(created_at)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS mock_exams_sync_idx ON mock_exams(synced_at)`);

  // Exam results table (real driving-exam outcomes reported by the user)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      points INTEGER NOT NULL,
      max_points INTEGER NOT NULL DEFAULT 100,
      min_to_pass INTEGER NOT NULL DEFAULT 90,
      readiness_score INTEGER,
      taken_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS exam_results_lang_idx ON exam_results(lang)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS exam_results_date_idx ON exam_results(taken_at)`);

  // Game rounds ("Who goes first?"), one row per finished round
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'quiz',
      score INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total INTEGER NOT NULL,
      duration_sec INTEGER,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS game_rounds_lang_idx ON game_rounds(lang)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS game_rounds_date_idx ON game_rounds(created_at)`);
  try {
    await database.execAsync(`ALTER TABLE game_rounds ADD COLUMN mode TEXT NOT NULL DEFAULT 'quiz'`);
  } catch (e) {
    // Column already exists
  }

  // Crossing drive log: one row per junction driven, with the scene and the
  // priority reasons as JSON so the history screen can explain each one.
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS crossing_log (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      run_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      points INTEGER NOT NULL,
      record TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      synced_at INTEGER
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS crossing_log_lang_idx ON crossing_log(lang)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS crossing_log_date_idx ON crossing_log(created_at)`);

  // Answer attempts table
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS answer_attempts (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      lang INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      session_id TEXT,
      mock_exam_id TEXT,
      category_text TEXT,
      selected_answer_index INTEGER NOT NULL,
      correct_answer_index INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      points INTEGER NOT NULL,
      question_shown_at INTEGER NOT NULL,
      answer_submitted_at INTEGER NOT NULL,
      response_time_ms INTEGER NOT NULL,
      was_in_mistakes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      FOREIGN KEY(session_id) REFERENCES study_sessions(id),
      FOREIGN KEY(mock_exam_id) REFERENCES mock_exams(id)
    )
  `);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_lang_idx ON answer_attempts(lang)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_question_idx ON answer_attempts(question_id)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_mode_idx ON answer_attempts(mode)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_session_idx ON answer_attempts(session_id)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_date_idx ON answer_attempts(created_at)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_mock_exam_idx ON answer_attempts(mock_exam_id)`);
  await database.execAsync(`CREATE INDEX IF NOT EXISTS answer_attempts_sync_idx ON answer_attempts(synced_at)`);
}

/**
 * Create database views for computed statistics
 */
async function createViews(): Promise<void> {
  // Drop views first to allow recreation with updated definitions
  const viewNames = ['v_questions_seen', 'v_daily_stats', 'v_category_stats', 'v_study_stats', 'v_mock_stats'];
  for (const viewName of viewNames) {
    await database.execAsync(`DROP VIEW IF EXISTS ${viewName}`);
  }
  
  const views = [
    // Questions seen view
    `CREATE VIEW IF NOT EXISTS v_questions_seen AS
     SELECT DISTINCT lang, question_id
     FROM answer_attempts`,

    // Daily stats view
    // Note: Drizzle stores timestamps as seconds (Unix epoch), so no need to divide by 1000
    `CREATE VIEW IF NOT EXISTS v_daily_stats AS
     SELECT 
       lang,
       DATE(created_at, 'unixepoch', 'localtime') as study_date,
       COUNT(*) as attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
     FROM answer_attempts
     WHERE mode IN ('study', 'mistakes', 'game')
     GROUP BY lang, DATE(created_at, 'unixepoch', 'localtime')`,

    // Category stats view
    `CREATE VIEW IF NOT EXISTS v_category_stats AS
     SELECT 
       lang,
       category_text,
       COUNT(*) as attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong,
       ROUND(SUM(CASE WHEN is_correct THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
     FROM answer_attempts
     WHERE category_text IS NOT NULL AND mode IN ('study', 'mistakes', 'game')
     GROUP BY lang, category_text`,

    // Study stats view
    `CREATE VIEW IF NOT EXISTS v_study_stats AS
     SELECT 
       lang,
       COUNT(*) as attempts,
       SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
       SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
     FROM answer_attempts
     WHERE mode IN ('study', 'mistakes', 'game')
     GROUP BY lang`,

    // Mock stats view
    `CREATE VIEW IF NOT EXISTS v_mock_stats AS
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
     GROUP BY lang`,
  ];

  for (const viewSql of views) {
    try {
      await database.execAsync(viewSql);
    } catch (error) {
      console.error('Error creating view:', error);
      // Continue with other views even if one fails
    }
  }
}
