import { buildQuestionIndex } from './bank';
import * as StatsDB from '../db/queries/stats';
import * as EngagementDB from '../db/queries/engagement';
import * as MockDB from '../db/queries/mockExams';
import * as AttemptsDB from '../db/queries/attempts';
import * as StudySessionDB from '../db/queries/studySessions';
import * as ExamResultsDB from '../db/queries/examResults';
import { WEIGHTS, scoreComponents } from './readiness';

/**
 * Get default stats structure for a language (for backward compatibility)
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
 * Load stats from database (computed from answer_attempts and mock_exams).
 * Pass `onlyLang` to load a single language — each language costs ~10
 * queries, so screens that only need the active language should pass it.
 * Other languages stay at their zeroed defaults.
 */
export const loadStats = async (onlyLang = null) => {
  // Build stats object from database
  const stats = getDefaultStats();
  const langs = onlyLang ? [onlyLang] : [1, 2, 3];

  for (const lang of langs) {
    const langStr = String(lang);
    const langStats = stats.statsByLang[langStr];
    
    // Study stats
    const studyStats = await StatsDB.getStudyStats(lang);
    langStats.study.attempts = studyStats.attempts;
    langStats.study.correct = studyStats.correct;
    langStats.study.wrong = studyStats.wrong;
    
    // Daily stats
    const dailyStats = await StatsDB.getDailyStats(lang, 14);
    for (const day of dailyStats) {
      const dateKey = day.date.replace(/-/g, '');
      langStats.study.daily[dateKey] = {
        attempts: day.attempts,
        correct: day.correct,
        wrong: day.wrong,
      };
    }
    
    // Category stats
    const categoryStats = await StatsDB.getCategoryStats(lang);
    langStats.study.byCategory = categoryStats;
    
    // Mock stats
    const mockStats = await StatsDB.getMockStats(lang);
    langStats.mock.examsTaken = mockStats.examsTaken;
    langStats.mock.examsPassed = mockStats.examsPassed;
    langStats.mock.bestScore = mockStats.bestScore;
    langStats.mock.lastScore = mockStats.lastScore;
    langStats.mock.history = mockStats.history.map(exam => ({
      id: exam.id,
      date: exam.completedAt?.getTime() || exam.createdAt.getTime(),
      testId: exam.testId,
      score: exam.score || 0,
      maxScore: exam.maxScore,
      minToPass: exam.minToPass,
      passed: exam.passed || false,
      durationSec: exam.durationSec || undefined,
      wrongCount: exam.wrongCount || undefined,
      addedToMistakesCount: exam.addedToMistakesCount || undefined,
    }));
    
    // Engagement
    langStats.engagement.currentStreak = await EngagementDB.getCurrentStreak(lang);
    langStats.engagement.lastStudyDate = await EngagementDB.getLastStudyDate(lang);
    langStats.engagement.lastOpenedDate = await EngagementDB.getLastOpenedDate(lang);
    
    // Coverage (computed from answer_attempts)
    const questionsSeenCount = await StatsDB.getQuestionsSeenCount(lang);
    // Store the count directly - the array is no longer needed
    langStats.coverage.questionsSeen = []; // Empty array for backward compatibility
    langStats.coverage.questionsSeenCount = questionsSeenCount;
  }
  
  return stats;
};

/**
 * Save stats - no-op since stats are computed from database
 */
export const saveStats = async (stats) => {
  // Stats are computed from database, so this is a no-op
  return true;
};

/**
 * Get stats for a specific language
 */
export const getStatsForLang = async (lang) => {
  const stats = await loadStats(lang);
  const langStr = String(lang);
  return stats.statsByLang[langStr] || getDefaultLangStats();
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
 * Prune daily entries - no-op since stats are computed from database
 */
export const pruneDaily = (stats, keepDays = 14) => {
  // Stats are computed from database, so this is a no-op
};

/**
 * Cap history array - handled by database query
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
export const calculateCoverage = async (lang, questionsSeen) => {
  const total = getTotalUniqueQuestions(lang);
  if (total === 0) return 0;
  const seenCount = await StatsDB.getQuestionsSeenCount(lang);
  return Math.round((seenCount / total) * 100);
};

/**
 * Record a study attempt - now logs to answer_attempts table
 * This function is kept for backward compatibility but should be called via logAnswerAttempt
 */
export const recordStudyAttempt = async ({ lang, category, isCorrect }) => {
  // This function is now a no-op - attempts are logged via logAnswerAttempt
  // Kept for backward compatibility
};

/**
 * Record a question as seen - now computed from answer_attempts
 */
export const recordQuestionSeen = async ({ lang, qid }) => {
  // This function is now a no-op - questions seen are computed from answer_attempts
  // Kept for backward compatibility
};

/**
 * Update engagement streak - now computed from answer_attempts
 */
export const updateStreak = async ({ lang, isMockPass }) => {
  // This function is now a no-op - streak is computed from answer_attempts
  // Kept for backward compatibility
};

/**
 * Record mock exam result - now uses mock_exams table
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
  // This function should be called via MockDB.createMockExam and MockDB.completeMockExam
  // Kept for backward compatibility - returns a placeholder ID
  return `mock-${Date.now()}`;
};

/**
 * Record when wrong answers are added to mistakes
 */
export const recordAddedToMistakes = async ({ lang, historyId, count }) => {
  // Update the mock exam record
  await MockDB.updateAddedToMistakesCount(historyId, count);
};

/**
 * Reset statistics for a language (or all languages if lang is null)
 * This deletes all answer attempts, mock exams, and study sessions
 */
export const resetStats = async (lang = null) => {
  // Delete all answer attempts (this is the source of all stats)
  await AttemptsDB.deleteAnswerAttempts(lang);
  
  // Delete all mock exams
  await MockDB.deleteMockExams(lang);
  
  // Delete all study sessions
  await StudySessionDB.deleteStudySessions(lang);

  // Delete real exam results
  await ExamResultsDB.deleteExamResults(lang);
  
  return true;
};

/**
 * Read the inputs the readiness formula needs for one language.
 * Shared by calculateReadinessScore and getReadinessBreakdown so both
 * always agree with each other and with the forecast in readiness.js.
 */
const loadReadinessInputs = async (lang, mistakesCount, useConservative) => {
  const totalQuestions = getTotalUniqueQuestions(lang);
  const questionsSeenCount = await StatsDB.getQuestionsSeenCount(lang);
  const dailyStats = await StatsDB.getDailyStats(lang, 7);
  const totalAttempts7d = dailyStats.reduce((sum, day) => sum + day.attempts, 0);
  const totalCorrect7d = dailyStats.reduce((sum, day) => sum + day.correct, 0);
  const accuracy7d = totalAttempts7d > 0
    ? Math.round((totalCorrect7d / totalAttempts7d) * 100)
    : null;
  const mockStats = await StatsDB.getMockStats(lang);

  const components = scoreComponents({
    totalQuestions,
    seenCount: questionsSeenCount,
    mistakesCount,
    accuracy7d,
    attempts7d: totalAttempts7d,
    mockHistory: mockStats.history,
    useConservative,
  });

  return { totalQuestions, questionsSeenCount, totalAttempts7d, components };
};

/**
 * Calculate exam readiness score (0-100)
 */
export const calculateReadinessScore = async (lang, mistakesCount, stats, useConservative = false) => {
  const { components } = await loadReadinessInputs(lang, mistakesCount, useConservative);
  return components.overall;
};

/**
 * Get readiness score breakdown for display
 */
export const getReadinessBreakdown = async (lang, mistakesCount, stats, useConservative = false) => {
  const { totalQuestions, questionsSeenCount, totalAttempts7d, components } =
    await loadReadinessInputs(lang, mistakesCount, useConservative);

  return {
    overall: components.overall,
    components: {
      mistakes: {
        score: components.mistakes,
        weight: WEIGHTS.mistakes,
        count: mistakesCount,
        hasEnoughData: components.hasEnoughMistakeData,
        warning: !components.hasEnoughMistakeData ? 'Need more practice to assess mistakes' : null,
      },
      performance: {
        score: components.performance,
        weight: WEIGHTS.performance,
        attempts: totalAttempts7d,
        hasEnoughData: components.hasEnoughPerformanceData,
        warning: !components.hasEnoughPerformanceData ? 'Need more practice to assess performance' : null,
      },
      mockExam: {
        score: components.mockExam,
        weight: WEIGHTS.mockExam,
        passRate: components.mockPassRate,
        recentPassRate: components.mockRecentPassRate,
        examsTaken: components.examsTaken,
      },
      coverage: {
        score: components.coverage,
        weight: WEIGHTS.coverage,
        seen: questionsSeenCount,
        total: totalQuestions,
      },
    },
  };
};
