import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const mockExams = sqliteTable('mock_exams', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  testId: text('test_id').notNull(), // "L{lang}-T{testIndex}"
  
  // Timing
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  durationSec: integer('duration_sec'),
  
  // Results
  score: integer('score'),
  maxScore: integer('max_score').notNull(),
  minToPass: integer('min_to_pass').notNull(),
  passed: integer('passed', { mode: 'boolean' }),
  wrongCount: integer('wrong_count'),
  addedToMistakesCount: integer('added_to_mistakes_count').default(0),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('mock_exams_lang_idx').on(table.lang),
  dateIdx: index('mock_exams_date_idx').on(table.createdAt),
  syncIdx: index('mock_exams_sync_idx').on(table.syncedAt),
}));
