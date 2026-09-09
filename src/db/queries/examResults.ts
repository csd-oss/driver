import { desc, eq } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { db } from '../index';
import { examResults } from '../schema/examResults';
import { generateId } from '../utils';

export const DEFAULT_MAX_POINTS = 100;
export const DEFAULT_MIN_TO_PASS = 90;

export interface ExamResultInput {
  lang: number;
  passed: boolean;
  points: number;
  maxPoints?: number;
  minToPass?: number;
  readinessScore?: number | null;
  takenAt: Date;
}

export type ExamResultRow = typeof examResults.$inferSelect;

/**
 * Record a real driving-exam outcome. Returns the new row id.
 * Throws when `points` is not an integer in [0, maxPoints].
 */
export async function addExamResult(input: ExamResultInput): Promise<string> {
  const maxPoints = input.maxPoints ?? DEFAULT_MAX_POINTS;
  const minToPass = input.minToPass ?? DEFAULT_MIN_TO_PASS;

  if (!Number.isInteger(input.points) || input.points < 0 || input.points > maxPoints) {
    throw new Error(`Exam points must be an integer between 0 and ${maxPoints}, got ${input.points}`);
  }
  if (!(input.takenAt instanceof Date) || Number.isNaN(input.takenAt.getTime())) {
    throw new Error('Exam takenAt must be a valid Date');
  }

  const deviceId = await getDeviceId();
  const id = generateId();

  await db.insert(examResults).values({
    id,
    deviceId,
    lang: input.lang,
    passed: input.passed,
    points: input.points,
    maxPoints,
    minToPass,
    readinessScore: input.readinessScore ?? null,
    takenAt: input.takenAt,
    createdAt: new Date(),
    syncedAt: null,
  });

  return id;
}

/**
 * All real-exam results for a language, newest first (by exam date, then by insert time)
 */
export async function getExamResults(lang: number): Promise<ExamResultRow[]> {
  return db.select()
    .from(examResults)
    .where(eq(examResults.lang, lang))
    .orderBy(desc(examResults.takenAt), desc(examResults.createdAt));
}

/**
 * Most recent real-exam result for a language, or null
 */
export async function getLatestExamResult(lang: number): Promise<ExamResultRow | null> {
  const rows = await db.select()
    .from(examResults)
    .where(eq(examResults.lang, lang))
    .orderBy(desc(examResults.takenAt), desc(examResults.createdAt))
    .limit(1);

  return rows[0] || null;
}

/**
 * True when the user has recorded at least one passed real exam for this language
 */
export async function hasPassedExam(lang: number): Promise<boolean> {
  const rows = await getExamResults(lang);
  return rows.some((row) => row.passed);
}

/**
 * Delete all exam results for a language (or all languages if lang is null)
 */
export async function deleteExamResults(lang: number | null = null): Promise<void> {
  if (lang !== null) {
    await db.delete(examResults).where(eq(examResults.lang, lang));
  } else {
    await db.delete(examResults);
  }
}
