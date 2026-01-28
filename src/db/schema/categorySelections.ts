import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const categorySelections = sqliteTable('category_selections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lang: integer('lang').notNull(), // 1, 2, 3
  categoryText: text('category_text').notNull().default('all'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  langUnique: uniqueIndex('category_selections_lang_unique').on(table.lang),
}));
