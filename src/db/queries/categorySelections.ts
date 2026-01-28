import { db } from '../index';
import { categorySelections } from '../schema/categorySelections';
import { eq } from 'drizzle-orm';

/**
 * Get category selection for a language
 */
export async function getCategorySelection(lang: number): Promise<string> {
  const result = await db.select()
    .from(categorySelections)
    .where(eq(categorySelections.lang, lang))
    .limit(1);
  
  if (result.length === 0) {
    // Create default
    await db.insert(categorySelections).values({
      lang,
      categoryText: 'all',
      updatedAt: new Date(),
    });
    return 'all';
  }
  
  return result[0].categoryText;
}

/**
 * Set category selection for a language
 */
export async function setCategorySelection(lang: number, categoryText: string): Promise<void> {
  const existing = await db.select()
    .from(categorySelections)
    .where(eq(categorySelections.lang, lang))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(categorySelections).values({
      lang,
      categoryText,
      updatedAt: new Date(),
    });
  } else {
    await db.update(categorySelections)
      .set({
        categoryText,
        updatedAt: new Date(),
      })
      .where(eq(categorySelections.lang, lang));
  }
}
