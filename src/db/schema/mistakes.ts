import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const mistakes = sqliteTable('mistakes', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  questionId: text('question_id').notNull(), // qid from question bank
  streakCount: integer('streak_count').notNull().default(0), // consecutive correct answers
  nextReviewAt: integer('next_review_at', { mode: 'timestamp' }), // when to show again (null = immediately due)
  intervalDays: integer('interval_days').notNull().default(0), // current interval (0, 1, 3, or 7)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langQuestionUnique: uniqueIndex('mistakes_lang_question_unique').on(table.lang, table.questionId),
  langIdx: index('mistakes_lang_idx').on(table.lang),
}));
