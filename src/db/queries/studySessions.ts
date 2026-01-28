import { db } from '../index';
import { studySessions } from '../schema/studySessions';
import { eq } from 'drizzle-orm';
import { generateId } from '../utils';
import { getDeviceId } from '../device';

export interface StudySessionData {
  lang: number;
  mode: 'study' | 'mistakes';
  categoryText?: string;
}

/**
 * Create a new study session
 */
export async function createStudySession(data: StudySessionData): Promise<string> {
  const deviceId = await getDeviceId();
  const id = generateId();
  
  await db.insert(studySessions).values({
    id,
    deviceId,
    lang: data.lang,
    mode: data.mode,
    categoryText: data.categoryText || null,
    startedAt: new Date(),
    endedAt: null,
    questionsCount: 0,
    correctCount: 0,
    syncedAt: null,
  });
  
  return id;
}

/**
 * End a study session
 */
export async function endStudySession(
  sessionId: string,
  questionsCount: number,
  correctCount: number
): Promise<void> {
  await db.update(studySessions)
    .set({
      endedAt: new Date(),
      questionsCount,
      correctCount,
    })
    .where(eq(studySessions.id, sessionId));
}

/**
 * Get study session by ID
 */
export async function getStudySession(sessionId: string) {
  const result = await db.select()
    .from(studySessions)
    .where(eq(studySessions.id, sessionId))
    .limit(1);
  
  return result[0] || null;
}

/**
 * Delete all study sessions for a language (or all languages if lang is null)
 */
export async function deleteStudySessions(lang: number | null = null): Promise<void> {
  if (lang !== null) {
    await db.delete(studySessions).where(eq(studySessions.lang, lang));
  } else {
    await db.delete(studySessions);
  }
}
