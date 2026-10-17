import { database } from '../index';

/**
 * Rows not yet sent to the driving school (`synced_at IS NULL`). The schema had the column from
 * the start; this is the first thing that uses it. Timestamps are unix seconds, as stored.
 */
export interface UnsyncedAttempt {
  id: string;
  question_id: string;
  mode: string;
  category_text: string | null;
  is_correct: number;
  response_time_ms: number;
  answer_submitted_at: number;
}

export interface UnsyncedMockExam {
  id: string;
  score: number;
  max_score: number;
  min_to_pass: number;
  passed: number;
  duration_sec: number | null;
  completed_at: number;
}

export interface UnsyncedExamResult {
  id: string;
  passed: number;
  points: number;
  max_points: number;
  min_to_pass: number;
  readiness_score: number | null;
  taken_at: number;
}

export const SYNC_BATCH = 2000;

export async function getUnsyncedAttempts(lang: number, limit = SYNC_BATCH): Promise<UnsyncedAttempt[]> {
  return database.getAllAsync<UnsyncedAttempt>(
    `SELECT id, question_id, mode, category_text, is_correct, response_time_ms, answer_submitted_at
       FROM answer_attempts WHERE lang = ? AND synced_at IS NULL ORDER BY answer_submitted_at LIMIT ?`,
    lang,
    limit
  );
}

export async function getUnsyncedMockExams(lang: number): Promise<UnsyncedMockExam[]> {
  return database.getAllAsync<UnsyncedMockExam>(
    `SELECT id, score, max_score, min_to_pass, passed, duration_sec, completed_at
       FROM mock_exams WHERE lang = ? AND synced_at IS NULL AND completed_at IS NOT NULL ORDER BY completed_at LIMIT ?`,
    lang,
    SYNC_BATCH
  );
}

export async function getUnsyncedExamResults(lang: number): Promise<UnsyncedExamResult[]> {
  return database.getAllAsync<UnsyncedExamResult>(
    `SELECT id, passed, points, max_points, min_to_pass, readiness_score, taken_at
       FROM exam_results WHERE lang = ? AND synced_at IS NULL ORDER BY taken_at`,
    lang
  );
}

type SyncTable = 'answer_attempts' | 'mock_exams' | 'exam_results';

/** Stamp `synced_at` on the rows the server accepted. */
export async function markSynced(table: SyncTable, ids: string[], at: Date): Promise<void> {
  const seconds = Math.floor(at.getTime() / 1000);
  // SQLite's default variable limit is 999; stay well under it.
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(', ');
    await database.runAsync(`UPDATE ${table} SET synced_at = ? WHERE id IN (${placeholders})`, seconds, ...chunk);
  }
}

/** Forget every sync mark, so the next sync sends the whole history again (after re-linking). */
export async function resetSyncMarks(): Promise<void> {
  for (const table of ['answer_attempts', 'mock_exams', 'exam_results'] as const) {
    await database.runAsync(`UPDATE ${table} SET synced_at = NULL`);
  }
}
