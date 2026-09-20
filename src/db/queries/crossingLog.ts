import { eq, sql } from 'drizzle-orm';
import { getDeviceId } from '../device';
import { database, db } from '../index';
import { crossingLog } from '../schema/crossingLog';
import { generateId } from '../utils';
import { isDriveRecord } from '../../lib/crossingLog';

export type CrossingOutcome = 'clean' | 'crash' | 'spoiled';

export interface CrossingLogInput {
  id?: string;
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
  const id = input.id ?? generateId();
  const deviceId = await getDeviceId();
  // Keep the drive loop free of synchronous database work. The async worker
  // transport also handles full scene JSON without the web sync reply limit.
  await database.runAsync(
    `INSERT INTO crossing_log (id, device_id, lang, run_id, outcome, points, record, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET outcome = excluded.outcome, points = excluded.points,
       record = excluded.record, synced_at = NULL`,
    [id, deviceId, input.lang, input.runId, input.outcome, Math.max(0, Math.round(input.points)), JSON.stringify(input.record), Math.floor(Date.now() / 1000)],
  );
  return id;
}

export async function getRecentCrossingLog(lang: number, limit = 100): Promise<CrossingLogEntry[]> {
  const rows = await database.getAllAsync<{
    id: string; run_id: string; outcome: CrossingOutcome; points: number; record: string; created_at: number;
  }>('SELECT id, run_id, outcome, points, record, created_at FROM crossing_log WHERE lang = ? ORDER BY created_at DESC, rowid DESC LIMIT ?', [lang, limit]);
  const entries: CrossingLogEntry[] = [];
  for (const row of rows) {
    try {
      const record = JSON.parse(row.record);
      if (!isDriveRecord(record)) continue;
      entries.push({
        id: row.id,
        runId: row.run_id,
        outcome: row.outcome,
        points: row.points,
        record,
        createdAt: new Date(row.created_at * 1000),
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
