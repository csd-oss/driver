import { db } from '../index';
import { answerAttempts } from '../schema/answerAttempts';
import { eq, and, desc } from 'drizzle-orm';
import { generateId } from '../utils';
import { getDeviceId } from '../device';

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
}

/**
 * Log an answer attempt
 */
export async function logAnswerAttempt(data: AnswerAttemptData): Promise<string> {
  const deviceId = await getDeviceId();
  const responseTimeMs = data.answerSubmittedAt.getTime() - data.questionShownAt.getTime();
  
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
 * Delete all answer attempts for a language (or all languages if lang is null)
 */
export async function deleteAnswerAttempts(lang: number | null = null): Promise<void> {
  if (lang !== null) {
    await db.delete(answerAttempts).where(eq(answerAttempts.lang, lang));
  } else {
    await db.delete(answerAttempts);
  }
}
