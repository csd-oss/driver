import { and, eq } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { db } from '../index';
import { mistakes } from '../schema/mistakes';
import { generateId } from '../utils';

/**
 * Get all mistake question IDs for a language
 */
export async function getMistakes(lang: number): Promise<string[]> {
  const result = await db.select({ questionId: mistakes.questionId })
    .from(mistakes)
    .where(eq(mistakes.lang, lang));
  
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
 */
export async function addMistake(lang: number, questionId: string): Promise<void> {
  const deviceId = await getDeviceId();
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
    // Reset streak
    await db.update(mistakes)
      .set({
        streakCount: 0,
        updatedAt: new Date(),
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
      createdAt: new Date(),
      updatedAt: new Date(),
      syncedAt: null,
    });
  }
}

/**
 * Increment streak for a question (called when answer is correct)
 */
export async function incrementStreak(lang: number, questionId: string): Promise<number> {
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
    return 0;
  }
  
  const newStreak = existing[0].streakCount + 1;
  
  if (newStreak >= 2) {
    // Remove from mistakes (mastered)
    await db.delete(mistakes)
      .where(
        and(
          eq(mistakes.lang, lang),
          eq(mistakes.questionId, questionId)
        )
      );
    return newStreak;
  } else {
    // Update streak
    await db.update(mistakes)
      .set({
        streakCount: newStreak,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mistakes.lang, lang),
          eq(mistakes.questionId, questionId)
        )
      );
    return newStreak;
  }
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
