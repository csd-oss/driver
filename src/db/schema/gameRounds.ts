import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// One row per finished "Who goes first?" round. Best score is MAX(score).
export const gameRounds = sqliteTable('game_rounds', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(),
  lang: integer('lang').notNull(),
  score: integer('score').notNull(),
  correctCount: integer('correct_count').notNull(),
  total: integer('total').notNull(),
  durationSec: integer('duration_sec'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
}, (table) => ({
  langIdx: index('game_rounds_lang_idx').on(table.lang),
  dateIdx: index('game_rounds_date_idx').on(table.createdAt),
}));
