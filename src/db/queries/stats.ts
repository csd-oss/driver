import { sql } from 'drizzle-orm';
import { database, db } from '../index';
import { mockExams } from '../schema/mockExams';

/**
 * Get study stats for a language (lifetime)
 */
export async function getStudyStats(lang: number) {
  const result = await database.getAllAsync(
    `SELECT 
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
    FROM answer_attempts
    WHERE lang = ? AND mode IN ('study', 'mistakes')`,
    [lang]
  );
  
  const row = result[0] as any;
  return {
    attempts: Number(row?.attempts || 0),
    correct: Number(row?.correct || 0),
    wrong: Number(row?.wrong || 0),
  };
}

/**
 * Get daily stats for a language (last N days)
 */
export async function getDailyStats(lang: number, days: number = 14) {
  // Note: Drizzle stores timestamps as seconds (Unix epoch), so no need to divide by 1000
  const result = await database.getAllAsync(
    `SELECT 
      DATE(created_at, 'unixepoch', 'localtime') as study_date,
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong
    FROM answer_attempts
    WHERE lang = ? 
      AND mode IN ('study', 'mistakes')
      AND DATE(created_at, 'unixepoch', 'localtime') >= DATE('now', 'localtime', '-' || ? || ' days')
    GROUP BY DATE(created_at, 'unixepoch', 'localtime')
    ORDER BY study_date DESC`,
    [lang, days]
  );
  
  return result.map((row: any) => ({
    date: row.study_date,
    attempts: Number(row.attempts || 0),
    correct: Number(row.correct || 0),
    wrong: Number(row.wrong || 0),
  }));
}

/**
 * Get category stats for a language
 */
export async function getCategoryStats(lang: number) {
  const result = await database.getAllAsync(
    `SELECT 
      category_text,
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN is_correct THEN 0 ELSE 1 END) as wrong,
      ROUND(SUM(CASE WHEN is_correct THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) as accuracy
    FROM answer_attempts
    WHERE lang = ? 
      AND category_text IS NOT NULL 
      AND mode IN ('study', 'mistakes')
    GROUP BY category_text`,
    [lang]
  );
  
  const stats: Record<string, { attempts: number; correct: number; wrong: number; accuracy: number }> = {};
  
  for (const row of result as any[]) {
    const categoryText = row.category_text;
    stats[categoryText] = {
      attempts: Number(row.attempts || 0),
      correct: Number(row.correct || 0),
      wrong: Number(row.wrong || 0),
      accuracy: Number(row.accuracy || 0),
    };
  }
  
  return stats;
}

/**
 * Get questions seen count for a language
 */
export async function getQuestionsSeenCount(lang: number): Promise<number> {
  const result = await database.getAllAsync(
    `SELECT COUNT(DISTINCT question_id) as count
    FROM answer_attempts
    WHERE lang = ?`,
    [lang]
  );
  
  const firstRow = result[0] as { count?: number } | undefined;
  return Number(firstRow?.count || 0);
}

/**
 * Get mock exam stats for a language
 */
export async function getMockStats(lang: number) {
  const exams = await db.select()
    .from(mockExams)
    .where(sql`lang = ${lang} AND completed_at IS NOT NULL`)
    .orderBy(sql`completed_at DESC`);
  
  const examsTaken = exams.length;
  const examsPassed = exams.filter(e => e.passed).length;
  const bestScore = exams.length > 0 ? Math.max(...exams.map(e => e.score || 0)) : 0;
  const lastScore = exams.length > 0 ? exams[0].score || 0 : 0;
  
  return {
    examsTaken,
    examsPassed,
    bestScore,
    lastScore,
    history: exams.slice(0, 50), // Cap at 50
  };
}

/**
 * Get last 7 days accuracy
 * Returns null if no attempts, otherwise returns percentage (0-100)
 */
export async function getLast7DaysAccuracy(lang: number): Promise<number | null> {
  // Note: Drizzle stores timestamps as seconds (Unix epoch), so no need to divide by 1000
  const result = await database.getAllAsync(
    `SELECT 
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
      COUNT(*) as attempts
    FROM answer_attempts
    WHERE lang = ? 
      AND mode IN ('study', 'mistakes')
      AND DATE(created_at, 'unixepoch', 'localtime') >= DATE('now', 'localtime', '-7 days')`,
    [lang]
  );
  
  const row = result[0] as any;
  const attempts = Number(row?.attempts || 0);
  const correct = Number(row?.correct || 0);
  
  if (attempts === 0) return null;
  return Math.round((correct / attempts) * 100);
}

/**
 * Attempts and correct answers in a window of calendar days, counted in
 * local time. `fromDaysAgo` is inclusive, `toDaysAgo` is exclusive, so
 * (14, 7) means "the 7 days before the last 7 days".
 */
export async function getWindowStats(lang: number, fromDaysAgo: number, toDaysAgo: number) {
  const result = await database.getAllAsync(
    `SELECT 
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
    FROM answer_attempts
    WHERE lang = ?
      AND mode IN ('study', 'mistakes')
      AND DATE(created_at, 'unixepoch', 'localtime') >= DATE('now', 'localtime', '-' || ? || ' days')
      AND DATE(created_at, 'unixepoch', 'localtime') < DATE('now', 'localtime', '-' || ? || ' days')`,
    [lang, fromDaysAgo, toDaysAgo]
  );

  const row = result[0] as any;
  return {
    attempts: Number(row?.attempts || 0),
    correct: Number(row?.correct || 0),
  };
}

/**
 * Every open mistake with its spaced-repetition state. `nextReviewAt` is
 * Unix seconds or null (null means due now).
 */
export async function getOpenMistakes(lang: number) {
  const result = await database.getAllAsync(
    `SELECT interval_days, next_review_at
    FROM mistakes
    WHERE lang = ?`,
    [lang]
  );

  return (result as any[]).map((row) => ({
    intervalDays: Number(row.interval_days || 0),
    nextReviewAt: row.next_review_at === null || row.next_review_at === undefined
      ? null
      : Number(row.next_review_at),
  }));
}

/**
 * Accuracy over mock-exam attempts only. Mock questions are a random sample
 * of the bank, so this is the closest thing to real-exam accuracy.
 * Returns 0-100 or null when no mock attempts exist.
 */
export async function getMockAccuracy(lang: number): Promise<number | null> {
  const result = await database.getAllAsync(
    `SELECT 
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
    FROM answer_attempts
    WHERE lang = ? AND mode = 'mock'`,
    [lang]
  );

  const row = result[0] as any;
  const attempts = Number(row?.attempts || 0);
  if (attempts === 0) return null;
  return Math.round((Number(row?.correct || 0) / attempts) * 100);
}

/**
 * Inputs for the study pace: attempts in the last 14 calendar days (all
 * modes) and the Unix-seconds timestamp of the very first attempt.
 */
export async function getPaceStats(lang: number) {
  const recent = await database.getAllAsync(
    `SELECT COUNT(*) as attempts
    FROM answer_attempts
    WHERE lang = ?
      AND DATE(created_at, 'unixepoch', 'localtime') >= DATE('now', 'localtime', '-13 days')`,
    [lang]
  );
  const first = await database.getAllAsync(
    `SELECT MIN(created_at) as first_at
    FROM answer_attempts
    WHERE lang = ?`,
    [lang]
  );

  const recentRow = recent[0] as any;
  const firstRow = first[0] as any;
  const firstAt = firstRow?.first_at;
  return {
    attempts14d: Number(recentRow?.attempts || 0),
    firstAttemptAt: firstAt === null || firstAt === undefined ? null : Number(firstAt),
  };
}
