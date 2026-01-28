import * as MistakesDB from '../db/queries/mistakes';

/**
 * Apply an answer and update mistakes/streaks tracking
 * This function now uses the database directly
 * @param {Object} state - Current state (kept for backward compatibility, but not used)
 * @param {number} lang - Language index (1, 2, or 3)
 * @param {string} qid - Question ID
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {Promise<Object>} Updated state (for backward compatibility)
 */
export const applyAnswer = async (state, lang, qid, isCorrect) => {
  if (!isCorrect) {
    // Wrong answer: add to mistakes (or reset streak if already there)
    await MistakesDB.addMistake(lang, qid);
  } else {
    // Correct answer: increment streak if in mistakes
    await MistakesDB.incrementStreak(lang, qid);
  }
  
  // Return updated state for backward compatibility
  // Note: This is now computed from DB, but we maintain the old structure
  const mistakes = await MistakesDB.getMistakes(lang);
  const mistakesByLang = {
    [String(lang)]: mistakes,
  };
  
  // Build streaks object (only for questions in mistakes)
  const streaksByLang = {};
  for (const qid of mistakes) {
    const streak = await MistakesDB.getStreak(lang, qid);
    if (streak > 0) {
      if (!streaksByLang[String(lang)]) {
        streaksByLang[String(lang)] = {};
      }
      streaksByLang[String(lang)][qid] = streak;
    }
  }
  
  return {
    mistakesByLang,
    streaksByLang,
  };
};
