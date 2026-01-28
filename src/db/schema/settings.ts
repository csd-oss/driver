import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lang: integer('lang').notNull().default(1), // 1=SK, 2=EN, 3=HU
  hasOnboarded: integer('has_onboarded', { mode: 'boolean' }).notNull().default(false),
  hasChosenLanguage: integer('has_chosen_language', { mode: 'boolean' }).notNull().default(false),
  useConservativeReadiness: integer('use_conservative_readiness', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
