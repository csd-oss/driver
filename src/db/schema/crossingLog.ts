import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One row per junction you drove through in the crossing minigame: what
// happened and why, so the drive log can replay it with the scene picture.
export const crossingLog = sqliteTable('crossing_log', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(),
  lang: integer('lang').notNull(),
  runId: text('run_id').notNull(), // groups the junctions of one run
  outcome: text('outcome').notNull(), // 'clean' | 'crash' | 'spoiled'
  points: integer('points').notNull(),
  record: text('record').notNull(), // JSON: junctionRecord() from src/lib/priority/world.js
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
}, (table) => ({
  langIdx: index('crossing_log_lang_idx').on(table.lang),
  dateIdx: index('crossing_log_date_idx').on(table.createdAt),
}));
