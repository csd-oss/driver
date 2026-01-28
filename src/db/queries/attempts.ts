import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { database, db } from '../index';
import { answerAttempts } from '../schema/answerAttempts';
import { generateId } from '../utils';

export interface AnswerAttemptData {
  lang: number;
  questionId: string;
  mode: 'study' | 'mock' | 'mistakes';
  sessionId?: string;
  mockExamId?: string;
  categoryText?: string;
  selectedAnswerIndex: number;
  correctAnswerIndex: number;
  isCorrect: boolean;
  points: number;
  questionShownAt: Date;
  answerSubmittedAt: Date;
  wasInMistakes: boolean;
  responseTimeMs?: number; // Optional: for mock mode to use accumulated time instead of calculated
}

/**
 * Log an answer attempt
 */
export async function logAnswerAttempt(data: AnswerAttemptData): Promise<string> {
  const deviceId = await getDeviceId();
  // Use provided responseTimeMs (for mock mode with accumulated time) or calculate it
  const responseTimeMs = data.responseTimeMs !== undefined 
    ? data.responseTimeMs 
    : data.answerSubmittedAt.getTime() - data.questionShownAt.getTime();
  
  const id = generateId();
  
  await db.insert(answerAttempts).values({
    id,
    deviceId,
    lang: data.lang,
    questionId: data.questionId,
    mode: data.mode,
    sessionId: data.sessionId || null,
    mockExamId: data.mockExamId || null,
    categoryText: data.categoryText || null,
    selectedAnswerIndex: data.selectedAnswerIndex,
    correctAnswerIndex: data.correctAnswerIndex,
    isCorrect: data.isCorrect,
    points: data.points,
    questionShownAt: data.questionShownAt,
    answerSubmittedAt: data.answerSubmittedAt,
    responseTimeMs,
    wasInMistakes: data.wasInMistakes,
    createdAt: new Date(),
    syncedAt: null,
  });
  
  return id;
}

/**
 * Get attempts for a question
 */
export async function getQuestionAttempts(lang: number, questionId: string) {
  return db.select()
    .from(answerAttempts)
    .where(
      and(
        eq(answerAttempts.lang, lang),
        eq(answerAttempts.questionId, questionId)
      )
    )
    .orderBy(desc(answerAttempts.createdAt));
}

/**
 * Get recent question IDs from answer attempts
 * Returns distinct question IDs from the most recent attempts, ordered by creation time
 */
export async function getRecentQuestionIds(
  lang: number,
  limit: number = 20
): Promise<string[]> {
  const results = await db
    .select({ questionId: answerAttempts.questionId })
    .from(answerAttempts)
    .where(
      and(
        eq(answerAttempts.lang, lang),
        inArray(answerAttempts.mode, ['study', 'mistakes'])
      )
    )
    .orderBy(desc(answerAttempts.createdAt))
    .limit(limit * 2); // Get more records to account for duplicates
  
  // Extract unique questionIds, preserving order (most recent first)
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  
  for (const result of results) {
    if (!seen.has(result.questionId)) {
      seen.add(result.questionId);
      uniqueIds.push(result.questionId);
      if (uniqueIds.length >= limit) {
        break;
      }
    }
  }
  
  return uniqueIds;
}

/**
 * Get answer history with pagination
 * Returns all answer attempts for a language, ordered by most recent first
 */
export async function getAnswerHistory(
  lang: number,
  limit: number = 50,
  offset: number = 0
) {
  return db.select()
    .from(answerAttempts)
    .where(eq(answerAttempts.lang, lang))
    .orderBy(desc(answerAttempts.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get question-level performance statistics
 * Returns aggregated stats for each question with at least 2 attempts
 */
export async function getQuestionPerformanceStats(lang: number) {
  return database.getAllAsync(`
    SELECT 
      question_id,
      COUNT(*) as attempts,
      SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct,
      AVG(response_time_ms) as avg_response_time_ms,
      MAX(created_at) as last_seen_at
    FROM answer_attempts
    WHERE lang = ? AND mode IN ('study', 'mistakes')
    GROUP BY question_id
    HAVING attempts >= 2
  `, [lang]);
}

/**
 * Delete all answer attempts for a language (or all languages if lang is null)
 */
export async function deleteAnswerAttempts(lang: number | null = null): Promise<void> {
  if (lang !== null) {
    await db.delete(answerAttempts).where(eq(answerAttempts.lang, lang));
  } else {
    await db.delete(answerAttempts);
  }
}
