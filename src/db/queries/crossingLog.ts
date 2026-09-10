import { desc, eq, sql } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { database, db } from '../index';
import { crossingLog } from '../schema/crossingLog';
import { generateId } from '../utils';

export type CrossingOutcome = 'clean' | 'crash' | 'spoiled';

export interface CrossingLogInput {
  lang: number;
  runId: string;
  outcome: CrossingOutcome;
  points: number;
  record: unknown; // junctionRecord() from src/lib/priority/world.js
}

export type CrossingLogRow = typeof crossingLog.$inferSelect;

export interface CrossingLogEntry {
  id: string;
  runId: string;
  outcome: CrossingOutcome;
  points: number;
  record: any;
  createdAt: Date;
}

// Keep the log bounded: the newest rows per language survive a purge.
export const LOG_KEEP = 300;

export async function addCrossingLog(input: CrossingLogInput): Promise<string> {
  const id = generateId();
  const deviceId = await getDeviceId();
  await db.insert(crossingLog).values({
    id,
    deviceId,
    lang: input.lang,
    runId: input.runId,
    outcome: input.outcome,
    points: Math.max(0, Math.round(input.points)),
    record: JSON.stringify(input.record),
    createdAt: new Date(),
    syncedAt: null,
  });
  return id;
}

export async function getRecentCrossingLog(lang: number, limit = 100): Promise<CrossingLogEntry[]> {
  const rows = await db
    .select()
    .from(crossingLog)
    .where(eq(crossingLog.lang, lang))
    .orderBy(desc(crossingLog.createdAt))
    .limit(limit);
  const entries: CrossingLogEntry[] = [];
  for (const row of rows) {
    try {
      entries.push({
        id: row.id,
        runId: row.runId,
        outcome: row.outcome as CrossingOutcome,
        points: row.points,
        record: JSON.parse(row.record),
        createdAt: row.createdAt,
      });
    } catch {
      // A row we cannot parse is skipped rather than breaking the whole list.
    }
  }
  return entries;
}

export async function getCrossingLogStats(lang: number): Promise<{ total: number; crashes: number; spoiled: number }> {
  const rows = await db
    .select({
      total: sql<number>`COUNT(*)`,
      crashes: sql<number>`SUM(CASE WHEN ${crossingLog.outcome} = 'crash' THEN 1 ELSE 0 END)`,
      spoiled: sql<number>`SUM(CASE WHEN ${crossingLog.outcome} = 'spoiled' THEN 1 ELSE 0 END)`,
    })
    .from(crossingLog)
    .where(eq(crossingLog.lang, lang));
  return { total: Number(rows[0]?.total ?? 0), crashes: Number(rows[0]?.crashes ?? 0), spoiled: Number(rows[0]?.spoiled ?? 0) };
}

// Drop everything older than the newest LOG_KEEP rows for a language.
export async function purgeCrossingLog(lang: number, keep = LOG_KEEP): Promise<void> {
  await database.runAsync(
    `DELETE FROM crossing_log WHERE lang = ? AND id NOT IN (
       SELECT id FROM crossing_log WHERE lang = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
    [lang, lang, keep]
  );
}

export async function deleteCrossingLog(lang: number | null = null): Promise<void> {
  if (lang === null) {
    await db.delete(crossingLog);
  } else {
    await db.delete(crossingLog).where(eq(crossingLog.lang, lang));
  }
}
