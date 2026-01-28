import { and, eq, isNull, lte, or, asc, sql, inArray } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { db } from '../index';
import { mistakes } from '../schema/mistakes';
import { generateId } from '../utils';

/**
 * Get all mistake question IDs for a language that are due for review
 * Ordered by most overdue first (next_review_at ASC, NULLS FIRST)
 */
export async function getMistakes(lang: number): Promise<string[]> {
  const now = new Date();
  
  const result = await db.select({ questionId: mistakes.questionId })
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        or(
          isNull(mistakes.nextReviewAt),
          lte(mistakes.nextReviewAt, now)
        )
      )
    )
    .orderBy(
      sql`CASE WHEN ${mistakes.nextReviewAt} IS NULL THEN 0 ELSE 1 END`,
      asc(mistakes.nextReviewAt)
    );
  
  return result.map(r => r.questionId);
}

/**
 * Check if a question is in mistakes
 */
export async function isMistake(lang: number, questionId: string): Promise<boolean> {
  const result = await db.select()
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    )
    .limit(1);
  
  return result.length > 0;
}

/**
 * Get mistake details for a question (including spaced repetition info)
 */
export async function getMistakeDetails(lang: number, questionId: string) {
  const result = await db.select({
    streakCount: mistakes.streakCount,
    nextReviewAt: mistakes.nextReviewAt,
    intervalDays: mistakes.intervalDays,
  })
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    )
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * Get mistake details for multiple questions
 */
export async function getMistakeDetailsBatch(lang: number, questionIds: string[]) {
  if (questionIds.length === 0) return {};
  
  const result = await db.select({
    questionId: mistakes.questionId,
    streakCount: mistakes.streakCount,
    nextReviewAt: mistakes.nextReviewAt,
    intervalDays: mistakes.intervalDays,
  })
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        inArray(mistakes.questionId, questionIds)
      )
    );
  
  // Convert to map for easy lookup
  const detailsMap = {};
  for (const row of result) {
    detailsMap[row.questionId] = {
      streakCount: row.streakCount,
      nextReviewAt: row.nextReviewAt,
      intervalDays: row.intervalDays,
    };
  }
  
  return detailsMap;
}

/**
 * Get streak count for a question
 */
export async function getStreak(lang: number, questionId: string): Promise<number> {
  const result = await db.select({ streakCount: mistakes.streakCount })
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    )
    .limit(1);
  
  return result.length > 0 ? result[0].streakCount : 0;
}

/**
 * Add a question to mistakes (or reset streak if already there)
 * Resets interval to 0 and sets next_review_at to now (immediately due)
 */
export async function addMistake(lang: number, questionId: string): Promise<void> {
  const deviceId = await getDeviceId();
  const now = new Date();
  const existing = await db.select()
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    // Reset streak and interval (wrong answer)
    await db.update(mistakes)
      .set({
        streakCount: 0,
        intervalDays: 0,
        nextReviewAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(mistakes.lang, lang),
          eq(mistakes.questionId, questionId)
        )
      );
  } else {
    // Add new mistake
    await db.insert(mistakes).values({
      id: generateId(),
      deviceId,
      lang,
      questionId,
      streakCount: 0,
      intervalDays: 0,
      nextReviewAt: now,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
    });
  }
}

/**
 * Record a correct answer for a question in mistakes
 * Implements spaced repetition intervals: 0 → 1 → 3 → 7 → remove
 * @returns Object with removed flag and nextInterval
 */
export async function recordCorrectAnswer(
  lang: number, 
  questionId: string
): Promise<{ removed: boolean; nextInterval: number }> {
  const INTERVALS = [1, 3, 7];
  
  const existing = await db.select()
    .from(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    )
    .limit(1);
  
  if (existing.length === 0) {
    // Not in mistakes, nothing to do
    return { removed: false, nextInterval: 0 };
  }
  
  const currentInterval = existing[0].intervalDays ?? 0;
  const currentStreak = existing[0].streakCount;
  
  // Find next interval in progression
  const currentIndex = INTERVALS.indexOf(currentInterval);
  let nextInterval: number;
  
  if (currentInterval === 7) {
    // Already at max interval - mastered, remove from mistakes
    await db.delete(mistakes)
      .where(
        and(
          eq(mistakes.lang, lang),
          eq(mistakes.questionId, questionId)
        )
      );
    return { removed: true, nextInterval: 0 };
  } else if (currentIndex >= 0) {
    // Found in intervals array, move to next
    nextInterval = INTERVALS[currentIndex + 1] ?? INTERVALS[0];
  } else {
    // Not in intervals array (should be 0), move to first interval
    nextInterval = INTERVALS[0];
  }
  
  // Calculate next review date
  const nextReview = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000);
  
  // Update mistake with new interval and review date
  await db.update(mistakes)
    .set({
      streakCount: currentStreak + 1,
      intervalDays: nextInterval,
      nextReviewAt: nextReview,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    );
  
  return { removed: false, nextInterval };
}

/**
 * Increment streak for a question (deprecated - use recordCorrectAnswer instead)
 * Kept for backward compatibility
 */
export async function incrementStreak(lang: number, questionId: string): Promise<number> {
  const result = await recordCorrectAnswer(lang, questionId);
  if (result.removed) {
    return 2; // Was removed (mastered)
  }
  // Get current streak to return
  const streak = await getStreak(lang, questionId);
  return streak;
}

/**
 * Remove a question from mistakes (manual removal)
 */
export async function removeMistake(lang: number, questionId: string): Promise<void> {
  await db.delete(mistakes)
    .where(
      and(
        eq(mistakes.lang, lang),
        eq(mistakes.questionId, questionId)
      )
    );
}

/**
 * Get count of mistakes for a language
 */
export async function getMistakesCount(lang: number): Promise<number> {
  const result = await db.select()
    .from(mistakes)
    .where(eq(mistakes.lang, lang));
  
  return result.length;
}

/**
 * Reset all mistakes for a language (or all languages if lang is null)
 */
export async function resetMistakes(lang: number | null = null): Promise<void> {
  if (lang !== null) {
    await db.delete(mistakes).where(eq(mistakes.lang, lang));
  } else {
    await db.delete(mistakes);
  }
}
