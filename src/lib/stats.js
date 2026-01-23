import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildQuestionIndex } from './bank';

const STATS_KEY = 'DRIVING_MVP_STATS';

/**
 * Get default stats structure for a language
 */
const getDefaultLangStats = () => ({
  study: {
    attempts: 0,
    correct: 0,
    wrong: 0,
    daily: {},
    byCategory: {},
  },
  mock: {
    examsTaken: 0,
    examsPassed: 0,
    bestScore: 0,
    lastScore: 0,
    history: [],
  },
  engagement: {
    currentStreak: 0,
    lastStudyDate: null,
    lastOpenedDate: null,
  },
  coverage: {
    questionsSeen: [],
  },
});

/**
 * Get default stats structure
 */
const getDefaultStats = () => ({
  statsByLang: {
    '1': getDefaultLangStats(),
    '2': getDefaultLangStats(),
    '3': getDefaultLangStats(),
  },
});

/**
 * Load stats from AsyncStorage
 */
export const loadStats = async () => {
  try {
    const json = await AsyncStorage.getItem(STATS_KEY);
    if (json) {
      const stats = JSON.parse(json);
      // Ensure all languages have the full structure
      const defaultStats = getDefaultStats();
      const merged = {
        statsByLang: {
          '1': { ...defaultStats.statsByLang['1'], ...(stats.statsByLang?.['1'] || {}) },
          '2': { ...defaultStats.statsByLang['2'], ...(stats.statsByLang?.['2'] || {}) },
          '3': { ...defaultStats.statsByLang['3'], ...(stats.statsByLang?.['3'] || {}) },
        },
      };
      return merged;
    }
    return getDefaultStats();
  } catch (error) {
    console.error('Error loading stats:', error);
    return getDefaultStats();
  }
};

/**
 * Save stats to AsyncStorage
 */
export const saveStats = async (stats) => {
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
    return true;
  } catch (error) {
    console.error('Error saving stats:', error);
    return false;
  }
};

/**
 * Get stats for a specific language, initialize if needed
 */
export const getStatsForLang = async (lang) => {
  const stats = await loadStats();
  const langStr = String(lang);
  
  if (!stats.statsByLang[langStr]) {
    stats.statsByLang[langStr] = getDefaultLangStats();
    await saveStats(stats);
  }
  
  return stats.statsByLang[langStr];
};

/**
 * Get today's date as yyyyMMdd string
 */
export const todayKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Get yesterday's date as yyyyMMdd string
 */
export const yesterdayKey = () => {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Get array of date keys for last 7 days (today → 6 days ago)
 */
export const getLast7Days = () => {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dates.push(`${year}${month}${day}`);
  }
  return dates;
};

/**
 * Calculate accuracy percentage
 */
export const calculateAccuracy = (attempts, correct) => {
  if (attempts === 0) return '—';
  return Math.round((correct / attempts) * 100);
};

/**
 * Prune daily entries older than keepDays
 */
export const pruneDaily = (stats, keepDays = 14) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const cutoffKey = `${cutoffDate.getFullYear()}${String(cutoffDate.getMonth() + 1).padStart(2, '0')}${String(cutoffDate.getDate()).padStart(2, '0')}`;
  
  Object.keys(stats.study.daily).forEach((dateKey) => {
    if (dateKey < cutoffKey) {
      delete stats.study.daily[dateKey];
    }
  });
};

/**
 * Cap history array to max entries
 */
export const capHistory = (history, max = 50) => {
  if (history.length > max) {
    return history.slice(0, max);
  }
  return history;
};

/**
 * Get total count of unique questions in bank
 */
export const getTotalUniqueQuestions = (lang) => {
  const index = buildQuestionIndex(lang);
  return Object.keys(index).length;
};

/**
 * Calculate coverage percentage
 */
export const calculateCoverage = (lang, questionsSeen) => {
  const total = getTotalUniqueQuestions(lang);
  if (total === 0) return 0;
  return Math.round((questionsSeen.length / total) * 100);
};

/**
 * Record a study attempt
 */
export const recordStudyAttempt = async ({ lang, category, isCorrect }) => {
  const stats = await loadStats();
  const langStr = String(lang);
  const langStats = stats.statsByLang[langStr] || getDefaultLangStats();
  
  // Update lifetime counters
  langStats.study.attempts += 1;
  if (isCorrect) {
    langStats.study.correct += 1;
  } else {
    langStats.study.wrong += 1;
  }
  
  // Update daily counters
  const today = todayKey();
  if (!langStats.study.daily[today]) {
    langStats.study.daily[today] = { attempts: 0, correct: 0, wrong: 0 };
  }
  langStats.study.daily[today].attempts += 1;
  if (isCorrect) {
    langStats.study.daily[today].correct += 1;
  } else {
    langStats.study.daily[today].wrong += 1;
  }
  
  // Update category counters (if category provided)
  if (category) {
    if (!langStats.study.byCategory[category]) {
      langStats.study.byCategory[category] = { attempts: 0, correct: 0, wrong: 0 };
    }
    langStats.study.byCategory[category].attempts += 1;
    if (isCorrect) {
      langStats.study.byCategory[category].correct += 1;
    } else {
      langStats.study.byCategory[category].wrong += 1;
    }
  }
  
  // Prune old daily entries
  pruneDaily(langStats);
  
  stats.statsByLang[langStr] = langStats;
  await saveStats(stats);
};

/**
 * Record a question as seen
 */
export const recordQuestionSeen = async ({ lang, qid }) => {
  const stats = await loadStats();
  const langStr = String(lang);
  const langStats = stats.statsByLang[langStr] || getDefaultLangStats();
  
  // Ensure coverage structure exists
  if (!langStats.coverage) {
    langStats.coverage = { questionsSeen: [] };
  }
  
  // Add qid if not already present (deduplication)
  if (!langStats.coverage.questionsSeen.includes(qid)) {
    langStats.coverage.questionsSeen.push(qid);
  }
  
  stats.statsByLang[langStr] = langStats;
  await saveStats(stats);
};

/**
 * Update engagement streak
 */
export const updateStreak = async ({ lang, isMockPass }) => {
  const stats = await loadStats();
  const langStr = String(lang);
  const langStats = stats.statsByLang[langStr] || getDefaultLangStats();
  
  if (!langStats.engagement) {
    langStats.engagement = {
      currentStreak: 0,
      lastStudyDate: null,
      lastOpenedDate: null,
    };
  }
  
  const today = todayKey();
  const yesterday = yesterdayKey();
  const lastStudyDate = langStats.engagement.lastStudyDate;
  
  // Only update streak if this is the first activity of the day
  if (lastStudyDate !== today) {
    if (lastStudyDate === yesterday) {
      // Consecutive day - increment streak
      langStats.engagement.currentStreak += 1;
    } else if (lastStudyDate === null) {
      // First time studying - start streak at 1
      langStats.engagement.currentStreak = 1;
    } else {
      // Gap in days - reset streak to 1
      langStats.engagement.currentStreak = 1;
    }
    
    langStats.engagement.lastStudyDate = today;
  }
  
  stats.statsByLang[langStr] = langStats;
  await saveStats(stats);
};

/**
 * Record mock exam result
 */
export const recordMockResult = async ({
  lang,
  testId,
  score,
  maxScore,
  minToPass,
  passed,
  durationSec,
  wrongCount,
}) => {
  const stats = await loadStats();
  const langStr = String(lang);
  const langStats = stats.statsByLang[langStr] || getDefaultLangStats();
  
  // Update counters
  langStats.mock.examsTaken += 1;
  if (passed) {
    langStats.mock.examsPassed += 1;
  }
  
  langStats.mock.lastScore = score;
  if (score > langStats.mock.bestScore) {
    langStats.mock.bestScore = score;
  }
  
  // Add to history (newest first)
  const historyItem = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    date: Date.now(),
    testId,
    score,
    maxScore,
    minToPass,
    passed,
    durationSec,
    wrongCount,
    addedToMistakesCount: undefined,
  };
  
  langStats.mock.history.unshift(historyItem);
  langStats.mock.history = capHistory(langStats.mock.history, 50);
  
  stats.statsByLang[langStr] = langStats;
  await saveStats(stats);
  
  return historyItem.id;
};

/**
 * Record when wrong answers are added to mistakes
 */
export const recordAddedToMistakes = async ({ lang, historyId, count }) => {
  const stats = await loadStats();
  const langStr = String(lang);
  const langStats = stats.statsByLang[langStr] || getDefaultLangStats();
  
  // Find the most recent history item and update it
  const historyItem = langStats.mock.history.find((item) => item.id === historyId);
  if (historyItem) {
    historyItem.addedToMistakesCount = count;
  }
  
  stats.statsByLang[langStr] = langStats;
  await saveStats(stats);
};

/**
 * Reset statistics for a language (optional, for dev/debug)
 */
export const resetStats = async (lang = null) => {
  try {
    if (lang) {
      const stats = await loadStats();
      const langStr = String(lang);
      stats.statsByLang[langStr] = getDefaultLangStats();
      await saveStats(stats);
    } else {
      await AsyncStorage.removeItem(STATS_KEY);
    }
    return true;
  } catch (error) {
    console.error('Error resetting stats:', error);
    return false;
  }
};
