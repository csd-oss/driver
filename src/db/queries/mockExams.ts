import { desc, eq } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { db } from '../index';
import { mockExams } from '../schema/mockExams';
import { generateId } from '../utils';

export interface MockExamData {
  lang: number;
  testId: string;
  maxScore: number;
  minToPass: number;
}

export interface MockExamResult {
  score: number;
  passed: boolean;
  wrongCount?: number;
  durationSec?: number;
}

/**
 * Create a new mock exam session
 */
export async function createMockExam(data: MockExamData): Promise<string> {
  const deviceId = await getDeviceId();
  const id = generateId();
  
  await db.insert(mockExams).values({
    id,
    deviceId,
    lang: data.lang,
    testId: data.testId,
    startedAt: new Date(),
    completedAt: null,
    durationSec: null,
    score: null,
    maxScore: data.maxScore,
    minToPass: data.minToPass,
    passed: null,
    wrongCount: null,
    addedToMistakesCount: 0,
    createdAt: new Date(),
    syncedAt: null,
  });
  
  return id;
}

/**
 * Complete a mock exam
 */
export async function completeMockExam(
  examId: string,
  result: MockExamResult,
  startedAt: Date
): Promise<void> {
  const completedAt = new Date();
  const durationSec = result.durationSec || Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000);
  
  await db.update(mockExams)
    .set({
      completedAt,
      durationSec,
      score: result.score,
      passed: result.passed,
      wrongCount: result.wrongCount || null,
    })
    .where(eq(mockExams.id, examId));
}

/**
 * Update added to mistakes count
 */
export async function updateAddedToMistakesCount(examId: string, count: number): Promise<void> {
  await db.update(mockExams)
    .set({
      addedToMistakesCount: count,
    })
    .where(eq(mockExams.id, examId));
}

/**
 * Get mock exam history for a language
 */
export async function getMockExamHistory(lang: number, limit: number = 50) {
  return db.select()
    .from(mockExams)
    .where(eq(mockExams.lang, lang))
    .orderBy(desc(mockExams.completedAt))
    .limit(limit);
}

/**
 * Get mock exam by ID
 */
export async function getMockExam(examId: string) {
  const result = await db.select()
    .from(mockExams)
    .where(eq(mockExams.id, examId))
    .limit(1);
  
  return result[0] || null;
}

/**
 * Delete all mock exams for a language (or all languages if lang is null)
 */
export async function deleteMockExams(lang: number | null = null): Promise<void> {
  if (lang !== null) {
    await db.delete(mockExams).where(eq(mockExams.lang, lang));
  } else {
    await db.delete(mockExams);
  }
}
