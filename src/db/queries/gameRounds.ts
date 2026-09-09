import { desc, eq, sql } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { db } from '../index';
import { gameRounds } from '../schema/gameRounds';
import { generateId } from '../utils';

export interface GameRoundInput {
  lang: number;
  score: number;
  correctCount: number;
  total: number;
  durationSec?: number | null;
}

export type GameRoundRow = typeof gameRounds.$inferSelect;

export async function addGameRound(input: GameRoundInput): Promise<string> {
  const id = generateId();
  const deviceId = await getDeviceId();
  await db.insert(gameRounds).values({
    id,
    deviceId,
    lang: input.lang,
    score: Math.max(0, Math.round(input.score)),
    correctCount: input.correctCount,
    total: input.total,
    durationSec: input.durationSec ?? null,
    createdAt: new Date(),
    syncedAt: null,
  });
  return id;
}

export async function getBestScore(lang: number): Promise<number> {
  const rows = await db
    .select({ best: sql<number>`COALESCE(MAX(${gameRounds.score}), 0)` })
    .from(gameRounds)
    .where(eq(gameRounds.lang, lang));
  return Number(rows[0]?.best ?? 0);
}

export async function getGameStats(lang: number): Promise<{ rounds: number; best: number }> {
  const rows = await db
    .select({
      rounds: sql<number>`COUNT(*)`,
      best: sql<number>`COALESCE(MAX(${gameRounds.score}), 0)`,
    })
    .from(gameRounds)
    .where(eq(gameRounds.lang, lang));
  return { rounds: Number(rows[0]?.rounds ?? 0), best: Number(rows[0]?.best ?? 0) };
}

export async function getRecentGameRounds(lang: number, limit = 10): Promise<GameRoundRow[]> {
  return db
    .select()
    .from(gameRounds)
    .where(eq(gameRounds.lang, lang))
    .orderBy(desc(gameRounds.createdAt))
    .limit(limit);
}

export async function deleteGameRounds(lang: number | null = null): Promise<void> {
  if (lang === null) {
    await db.delete(gameRounds);
  } else {
    await db.delete(gameRounds).where(eq(gameRounds.lang, lang));
  }
}
