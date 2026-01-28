import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const studySessions = sqliteTable('study_sessions', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  mode: text('mode').notNull(), // 'study' | 'mistakes'
  categoryText: text('category_text'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  questionsCount: integer('questions_count').default(0),
  correctCount: integer('correct_count').default(0),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('study_sessions_lang_idx').on(table.lang),
  dateIdx: index('study_sessions_date_idx').on(table.startedAt),
  syncIdx: index('study_sessions_sync_idx').on(table.syncedAt),
}));
