/**
 * The official question bank, held in memory once it is loaded.
 *
 * The native app does not bundle the bank: it downloads a content pack on
 * first launch (src/lib/contentPack.ts) and loads it from the device after
 * that. The web build and the tests set it from data/data5.js directly.
 * bank.ts and categories.js read it through getQuestionData().
 *
 * Shape (as in data5.js): [slovakTests[], englishTests[], hungarianTests[]].
 */
let questionData: unknown[][] | null = null;

export const setQuestionData = (data: unknown[][]): void => {
  questionData = data;
};

export const hasQuestionData = (): boolean => questionData !== null;

export const getQuestionData = (): unknown[][] => {
  if (!questionData) throw new Error('The question bank is not loaded yet');
  return questionData;
};
