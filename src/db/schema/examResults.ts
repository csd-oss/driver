import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Real driving-exam outcomes reported by the user.
 * Event-sourced: one row per real attempt, never updated. A retake is a new row.
 */
export const examResults = sqliteTable('exam_results', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),

  // Outcome
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  points: integer('points').notNull(), // 0..max_points
  maxPoints: integer('max_points').notNull().default(100),
  minToPass: integer('min_to_pass').notNull().default(90),
  readinessScore: integer('readiness_score'), // app readiness score when recorded (null = unknown)

  // Timing
  takenAt: integer('taken_at', { mode: 'timestamp' }).notNull(), // date of the real exam

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('exam_results_lang_idx').on(table.lang),
  dateIdx: index('exam_results_date_idx').on(table.takenAt),
}));
