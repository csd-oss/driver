import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mockExams } from './mockExams';
import { studySessions } from './studySessions';

export const answerAttempts = sqliteTable('answer_attempts', {
  id: text('id').primaryKey(), // UUID - sync-ready
  deviceId: text('device_id').notNull(), // which device created this
  lang: integer('lang').notNull(),
  questionId: text('question_id').notNull(),
  
  // Context
  mode: text('mode').notNull(), // 'study' | 'mock' | 'mistakes'
  sessionId: text('session_id').references(() => studySessions.id), // FK to study_sessions (study/mistakes modes)
  mockExamId: text('mock_exam_id').references(() => mockExams.id), // FK to mock_exams (mock mode)
  categoryText: text('category_text'), // category at time of attempt
  
  // Answer data
  selectedAnswerIndex: integer('selected_answer_index').notNull(), // 1, 2, or 3
  correctAnswerIndex: integer('correct_answer_index').notNull(), // 1, 2, or 3
  isCorrect: integer('is_correct', { mode: 'boolean' }).notNull(),
  points: integer('points').notNull(), // question point value
  
  // Timing (NEW - enables future analytics)
  questionShownAt: integer('question_shown_at', { mode: 'timestamp' }).notNull(),
  answerSubmittedAt: integer('answer_submitted_at', { mode: 'timestamp' }).notNull(),
  responseTimeMs: integer('response_time_ms').notNull(), // calculated
  
  // Metadata
  wasInMistakes: integer('was_in_mistakes', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }), // null = not synced
}, (table) => ({
  langIdx: index('answer_attempts_lang_idx').on(table.lang),
  questionIdx: index('answer_attempts_question_idx').on(table.questionId),
  modeIdx: index('answer_attempts_mode_idx').on(table.mode),
  sessionIdx: index('answer_attempts_session_idx').on(table.sessionId),
  dateIdx: index('answer_attempts_date_idx').on(table.createdAt),
  mockExamIdx: index('answer_attempts_mock_exam_idx').on(table.mockExamId),
  syncIdx: index('answer_attempts_sync_idx').on(table.syncedAt), // for finding unsynced records
}));
