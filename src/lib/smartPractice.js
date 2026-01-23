import { loadProgress } from './storage';
import { loadStats } from './stats';
import {
  buildQuestionIndex,
  findQuestionById,
  getTestForQuestion,
  getTests,
  flattenRandomQuestion,
} from './bank';
import { getCategoryForQuestion } from './categories';

/**
 * Check if a question ID is in the recent list
 * @param {string} qid - Question ID
 * @param {string[]} recentIds - Array of recent question IDs
 * @returns {boolean}
 */
export const isRecent = (qid, recentIds) => {
  return recentIds.includes(qid);
};

/**
 * Add a question ID to the recent list, maintaining max size
 * @param {string} qid - Question ID to add
 * @param {string[]} recentIds - Current array of recent IDs
 * @param {number} max - Maximum size of the list (default 20)
 * @returns {string[]} Updated array
 */
export const pushRecent = (qid, recentIds, max = 20) => {
  const updated = [...recentIds];
  
  // Remove if already present (to avoid duplicates)
  const index = updated.indexOf(qid);
  if (index > -1) {
    updated.splice(index, 1);
  }
  
  // Add to end
  updated.push(qid);
  
  // Trim to max size (remove oldest)
  if (updated.length > max) {
    updated.shift();
  }
  
  return updated;
};

/**
 * Filter questions by category
 * @param {number} lang - Language index
 * @param {string[]} qids - Array of question IDs
 * @param {string} selectedCategory - Category to filter by ('all' or category text)
 * @returns {string[]} Filtered question IDs
 */
const filterByCategory = (lang, qids, selectedCategory) => {
  if (selectedCategory === 'all') {
    return qids;
  }
  
  const filtered = [];
  for (const qid of qids) {
    const test = getTestForQuestion(lang, qid);
    if (!test) continue;
    
    const index = buildQuestionIndex(lang);
    const entry = index[qid];
    if (!entry) continue;
    
    const category = getCategoryForQuestion(test, entry.qNo);
    if (category === selectedCategory) {
      filtered.push(qid);
    }
  }
  
  return filtered;
};

/**
 * Get all question IDs in a specific category
 * @param {number} lang - Language index
 * @param {string} category - Category text
 * @returns {string[]} Array of question IDs
 */
const getAllQuestionsInCategory = (lang, category) => {
  const index = buildQuestionIndex(lang);
  const tests = getTests(lang);
  const qids = [];
  
  for (const qid of Object.keys(index)) {
    const test = getTestForQuestion(lang, qid);
    if (!test) continue;
    
    const entry = index[qid];
    const questionCategory = getCategoryForQuestion(test, entry.qNo);
    if (questionCategory === category) {
      qids.push(qid);
    }
  }
  
  return qids;
};

/**
 * Priority 1: Pick a question from mistakes
 * @param {Object} params
 * @param {number} params.lang - Language index
 * @param {string} params.selectedCategory - Selected category ('all' or category text)
 * @param {string[]} params.recentIds - Recent question IDs
 * @param {string[]} params.mistakes - Array of mistake question IDs
 * @param {Set<string>} params.seenSet - Set of seen question IDs
 * @returns {Object|null} Question object or null
 */
const pickFromMistakes = ({ lang, selectedCategory, recentIds, mistakes, seenSet }) => {
  if (!mistakes || mistakes.length === 0) {
    return null;
  }
  
  // Filter by category if needed
  let candidates = selectedCategory === 'all' 
    ? [...mistakes] 
    : filterByCategory(lang, mistakes, selectedCategory);
  
  if (candidates.length === 0) {
    return null;
  }
  
  // Exclude recent questions (but allow reuse if all are recent)
  const nonRecent = candidates.filter(qid => !isRecent(qid, recentIds));
  const finalCandidates = nonRecent.length > 0 ? nonRecent : candidates;
  
  if (finalCandidates.length === 0) {
    return null;
  }
  
  // Random pick
  const randomIndex = Math.floor(Math.random() * finalCandidates.length);
  const selectedQid = finalCandidates[randomIndex];
  
  return findQuestionById(lang, selectedQid);
};

/**
 * Priority 2: Pick an unseen question
 * @param {Object} params
 * @param {number} params.lang - Language index
 * @param {string} params.selectedCategory - Selected category ('all' or category text)
 * @param {string[]} params.recentIds - Recent question IDs
 * @param {Set<string>} params.seenSet - Set of seen question IDs
 * @returns {Object|null} Question object or null
 */
const pickUnseen = ({ lang, selectedCategory, recentIds, seenSet }) => {
  const index = buildQuestionIndex(lang);
  const allQids = Object.keys(index);
  
  // Filter out seen questions
  const unseenQids = allQids.filter(qid => !seenSet.has(qid));
  
  if (unseenQids.length === 0) {
    return null;
  }
  
  // Filter by category if needed
  let candidates = selectedCategory === 'all'
    ? unseenQids
    : filterByCategory(lang, unseenQids, selectedCategory);
  
  if (candidates.length === 0) {
    return null;
  }
  
  // Exclude recent questions (but allow reuse if all are recent)
  const nonRecent = candidates.filter(qid => !isRecent(qid, recentIds));
  const finalCandidates = nonRecent.length > 0 ? nonRecent : candidates;
  
  if (finalCandidates.length === 0) {
    return null;
  }
  
  // Random pick
  const randomIndex = Math.floor(Math.random() * finalCandidates.length);
  const selectedQid = finalCandidates[randomIndex];
  
  return findQuestionById(lang, selectedQid);
};

/**
 * Priority 3: Pick a question from the weakest category
 * @param {Object} params
 * @param {number} params.lang - Language index
 * @param {string} params.selectedCategory - Selected category ('all' or category text)
 * @param {string[]} params.recentIds - Recent question IDs
 * @param {Object} params.stats - Language stats object
 * @returns {Object|null} Question object or null
 */
const pickFromWeakCategory = ({ lang, selectedCategory, recentIds, stats }) => {
  const byCategory = stats?.study?.byCategory || {};
  
  // Filter categories with attempts > 0
  const categoriesWithAttempts = Object.keys(byCategory).filter(category => {
    const catStats = byCategory[category];
    return catStats && catStats.attempts > 0;
  });
  
  if (categoriesWithAttempts.length === 0) {
    return null;
  }
  
  // Calculate accuracy for each category and sort by lowest (weakest first)
  const categoryAccuracies = categoriesWithAttempts.map(category => {
    const catStats = byCategory[category];
    const accuracy = catStats.attempts > 0 ? catStats.correct / catStats.attempts : 1;
    return { category, accuracy, attempts: catStats.attempts };
  });
  
  categoryAccuracies.sort((a, b) => {
    // Sort by accuracy (lowest first), then by attempts (more attempts = more data = more reliable)
    if (Math.abs(a.accuracy - b.accuracy) < 0.001) {
      return b.attempts - a.attempts;
    }
    return a.accuracy - b.accuracy;
  });
  
  // Try each category starting from weakest
  for (const { category } of categoryAccuracies) {
    // If a specific category is selected, only use that category
    if (selectedCategory !== 'all' && category !== selectedCategory) {
      continue;
    }
    
    // Get all questions in this category
    const categoryQids = getAllQuestionsInCategory(lang, category);
    
    if (categoryQids.length === 0) {
      continue;
    }
    
    // Exclude recent questions (but allow reuse if all are recent)
    const nonRecent = categoryQids.filter(qid => !isRecent(qid, recentIds));
    const finalCandidates = nonRecent.length > 0 ? nonRecent : categoryQids;
    
    if (finalCandidates.length === 0) {
      continue;
    }
    
    // Random pick
    const randomIndex = Math.floor(Math.random() * finalCandidates.length);
    const selectedQid = finalCandidates[randomIndex];
    
    return { question: findQuestionById(lang, selectedQid), category };
  }
  
  return null;
};

/**
 * Main function: Get a smart question based on priority system
 * @param {Object} params
 * @param {number} params.lang - Language index (1, 2, or 3)
 * @param {string} params.selectedCategory - Selected category ('all' or category text)
 * @param {string[]} params.recentIds - Array of recent question IDs (max 20)
 * @returns {Promise<Object|null>} Question object or null
 */
export const getSmartQuestion = async ({ lang, selectedCategory, recentIds = [] }) => {
  // Validate language
  if (lang < 1 || lang > 3) {
    console.warn(`Invalid language: ${lang}, defaulting to 1`);
    lang = 1;
  }
  
  // Load required data
  const progress = await loadProgress();
  const stats = await loadStats();
  
  const langStr = String(lang);
  const mistakes = progress?.mistakesByLang?.[langStr] || [];
  const langStats = stats?.statsByLang?.[langStr] || {};
  const questionsSeen = langStats?.coverage?.questionsSeen || [];
  
  // Build seen set once for performance
  const seenSet = new Set(questionsSeen);
  
  // Priority 1: Mistakes
  const withReason = (question, reason, meta) => {
    if (!question) return null;
    return {
      ...question,
      smartReason: reason,
      smartMeta: meta,
    };
  };

  const q1 = pickFromMistakes({
    lang,
    selectedCategory,
    recentIds,
    mistakes,
    seenSet,
  });
  if (q1) return withReason(q1, 'mistakes');
  
  // Priority 2: Unseen questions
  const q2 = pickUnseen({
    lang,
    selectedCategory,
    recentIds,
    seenSet,
  });
  if (q2) return withReason(q2, 'unseen');
  
  // Priority 3: Weakest category
  const q3 = pickFromWeakCategory({
    lang,
    selectedCategory,
    recentIds,
    stats: langStats,
  });
  if (q3?.question) return withReason(q3.question, 'weakCategory', { category: q3.category });
  
  // Priority 4: Random fallback
  // Note: flattenRandomQuestion doesn't respect category, so we need to handle that
  if (selectedCategory === 'all') {
    return withReason(flattenRandomQuestion(lang), 'random');
  }
  
  // For specific category, try to find a random question in that category
  // Try up to 30 times (same as current study.tsx logic)
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    const q = flattenRandomQuestion(lang);
    if (!q) break;
    
    const test = getTestForQuestion(lang, q.qid);
    if (test) {
      const category = getCategoryForQuestion(test, q.qNo);
      if (category === selectedCategory) {
        return withReason(q, 'random', { category: selectedCategory });
      }
    }
    
    attempts++;
  }
  
  // Final fallback: return any random question
  return withReason(flattenRandomQuestion(lang), 'random');
};
