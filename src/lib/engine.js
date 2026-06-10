import * as MistakesDB from '../db/queries/mistakes';

/**
 * Apply an answer and update mistakes/streaks tracking in the database.
 * @param {Object} state - Unused, kept so existing call sites don't change
 * @param {number} lang - Language index (1, 2, or 3)
 * @param {string} qid - Question ID
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {Promise<void>}
 */
export const applyAnswer = async (state, lang, qid, isCorrect) => {
  if (!isCorrect) {
    // Wrong answer: add to mistakes (or reset streak if already there)
    await MistakesDB.addMistake(lang, qid);
  } else {
    // Correct answer: record correct answer (implements spaced repetition)
    await MistakesDB.recordCorrectAnswer(lang, qid);
  }
};
