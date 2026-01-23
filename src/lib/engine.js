/**
 * Apply an answer and update mistakes/streaks tracking
 * @param {Object} state - Current state with mistakesByLang and streaksByLang
 * @param {number} lang - Language index (1, 2, or 3)
 * @param {string} qid - Question ID
 * @param {boolean} isCorrect - Whether the answer was correct
 * @returns {Object} Updated state
 */
export const applyAnswer = (state, lang, qid, isCorrect) => {
  const langStr = String(lang);
  
  // Initialize structures if needed
  if (!state.mistakesByLang) {
    state.mistakesByLang = {};
  }
  if (!state.streaksByLang) {
    state.streaksByLang = {};
  }
  if (!state.mistakesByLang[langStr]) {
    state.mistakesByLang[langStr] = [];
  }
  if (!state.streaksByLang[langStr]) {
    state.streaksByLang[langStr] = {};
  }
  
  const mistakes = state.mistakesByLang[langStr];
  const streaks = state.streaksByLang[langStr];
  
  if (!isCorrect) {
    // Wrong answer: add to mistakes (no duplicates), reset streak
    if (!mistakes.includes(qid)) {
      mistakes.push(qid);
    }
    streaks[qid] = 0;
  } else {
    // Correct answer
    if (mistakes.includes(qid)) {
      // Question is in mistakes: increment streak
      streaks[qid] = (streaks[qid] || 0) + 1;
      
      // If streak >= 2, remove from mistakes
      if (streaks[qid] >= 2) {
        const index = mistakes.indexOf(qid);
        if (index > -1) {
          mistakes.splice(index, 1);
        }
        delete streaks[qid];
      }
    }
  }
  
  return {
    mistakesByLang: { ...state.mistakesByLang },
    streaksByLang: { ...state.streaksByLang },
  };
};
