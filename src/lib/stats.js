import { buildQuestionIndex } from './bank';
import { getReadinessMode } from './settings';
import * as StatsDB from '../db/queries/stats';
import * as EngagementDB from '../db/queries/engagement';
import * as MockDB from '../db/queries/mockExams';
import * as AttemptsDB from '../db/queries/attempts';
import * as MistakesDB from '../db/queries/mistakes';
import * as StudySessionDB from '../db/queries/studySessions';

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
 * Load stats from database (computed from answer_attempts and mock_exams)
 */
export const loadStats = async () => {
  // Build stats object from database
  const stats = getDefaultStats();
  
  for (const lang of [1, 2, 3]) {
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
  const stats = await loadStats();
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
  
  return true;
};

/**
 * Calculate exam readiness score (0-100)
 */
export const calculateReadinessScore = async (lang, mistakesCount, stats, useConservative = false) => {
  const totalQuestions = getTotalUniqueQuestions(lang);
  if (totalQuestions === 0) return 0;
  
  const questionsSeenCount = await StatsDB.getQuestionsSeenCount(lang);
  const coverageRatio = questionsSeenCount / totalQuestions;
  
  // ===== Component 1: Mistake Score (30% weight) =====
  const MIN_COVERAGE_FOR_MISTAKES = 0.10;
  const MIN_QUESTIONS_FOR_MISTAKES = 50;
  const hasEnoughData = questionsSeenCount >= MIN_QUESTIONS_FOR_MISTAKES || 
                        coverageRatio >= MIN_COVERAGE_FOR_MISTAKES;
  
  let mistakeScore;
  if (!hasEnoughData) {
    if (useConservative) {
      mistakeScore = Math.min(30, coverageRatio * 100);
    } else {
      mistakeScore = 0;
    }
  } else {
    const mistakeRatio = mistakesCount / Math.max(questionsSeenCount, 1);
    mistakeScore = Math.max(0, 100 - (mistakeRatio * 100));
  }
  
  // ===== Component 2: Performance Score (25% weight) =====
  const last7DaysAccuracy = await StatsDB.getLast7DaysAccuracy(lang);
  const MIN_ATTEMPTS_FOR_PERFORMANCE = 10;
  
  // Get study stats to check attempts
  const studyStats = await StatsDB.getStudyStats(lang);
  const dailyStats = await StatsDB.getDailyStats(lang, 7);
  const totalAttempts7d = dailyStats.reduce((sum, day) => sum + day.attempts, 0);
  
  let performanceScore;
  if (totalAttempts7d < MIN_ATTEMPTS_FOR_PERFORMANCE || last7DaysAccuracy === null) {
    if (useConservative) {
      performanceScore = Math.min(30, (totalAttempts7d / MIN_ATTEMPTS_FOR_PERFORMANCE) * 30);
    } else {
      performanceScore = 0;
    }
  } else {
    performanceScore = last7DaysAccuracy;
  }
  
  // ===== Component 3: Mock Exam Score (30% weight) =====
  const mockStats = await StatsDB.getMockStats(lang);
  let mockExamScore = 0;
  
  if (mockStats.examsTaken > 0) {
    const passRate = (mockStats.examsPassed / mockStats.examsTaken) * 100;
    const recentExams = mockStats.history.slice(0, 3);
    const recentPassed = recentExams.filter(exam => exam.passed).length;
    const recentScore = recentExams.length > 0
      ? (recentPassed / recentExams.length) * 100
      : passRate;
    
    mockExamScore = (passRate * 0.6) + (recentScore * 0.4);
  }
  
  // ===== Component 4: Coverage Score (15% weight) =====
  const coverageScore = await calculateCoverage(lang, []);
  
  // ===== Final Weighted Score =====
  const readinessScore = Math.round(
    (mistakeScore * 0.30) + 
    (performanceScore * 0.25) + 
    (mockExamScore * 0.30) + 
    (coverageScore * 0.15)
  );
  
  return Math.max(0, Math.min(100, readinessScore));
};

/**
 * Get readiness score breakdown for display
 */
export const getReadinessBreakdown = async (lang, mistakesCount, stats, useConservative = false) => {
  const totalQuestions = getTotalUniqueQuestions(lang);
  const questionsSeenCount = await StatsDB.getQuestionsSeenCount(lang);
  const coverageRatio = questionsSeenCount / totalQuestions;
  
  // Calculate each component
  const MIN_COVERAGE_FOR_MISTAKES = 0.10;
  const MIN_QUESTIONS_FOR_MISTAKES = 50;
  const hasEnoughData = questionsSeenCount >= MIN_QUESTIONS_FOR_MISTAKES || 
                        coverageRatio >= MIN_COVERAGE_FOR_MISTAKES;
  
  let mistakeScore;
  if (!hasEnoughData) {
    if (useConservative) {
      mistakeScore = Math.min(30, coverageRatio * 100);
    } else {
      mistakeScore = 0;
    }
  } else {
    const mistakeRatio = mistakesCount / Math.max(questionsSeenCount, 1);
    mistakeScore = Math.max(0, 100 - (mistakeRatio * 100));
  }
  
  // Performance
  const dailyStats = await StatsDB.getDailyStats(lang, 7);
  const totalAttempts7d = dailyStats.reduce((sum, day) => sum + day.attempts, 0);
  const totalCorrect7d = dailyStats.reduce((sum, day) => sum + day.correct, 0);
  
  const MIN_ATTEMPTS_FOR_PERFORMANCE = 10;
  let performanceScore;
  let hasEnoughPerformanceData;
  if (totalAttempts7d < MIN_ATTEMPTS_FOR_PERFORMANCE) {
    if (useConservative) {
      performanceScore = Math.min(30, (totalAttempts7d / MIN_ATTEMPTS_FOR_PERFORMANCE) * 30);
    } else {
      performanceScore = 0;
    }
    hasEnoughPerformanceData = false;
  } else {
    performanceScore = Math.round((totalCorrect7d / totalAttempts7d) * 100);
    hasEnoughPerformanceData = true;
  }
  
  // Mock Exam
  const mockStats = await StatsDB.getMockStats(lang);
  let mockExamScore = 0;
  let mockDetails = { passRate: 0, recentPassRate: 0, examsTaken: 0 };
  
  if (mockStats.examsTaken > 0) {
    const passRate = (mockStats.examsPassed / mockStats.examsTaken) * 100;
    const recentExams = mockStats.history.slice(0, 3);
    const recentPassed = recentExams.filter(exam => exam.passed).length;
    const recentPassRate = recentExams.length > 0
      ? (recentPassed / recentExams.length) * 100
      : passRate;
    
    mockExamScore = (passRate * 0.6) + (recentPassRate * 0.4);
    mockDetails = { passRate, recentPassRate, examsTaken: mockStats.examsTaken };
  }
  
  // Coverage
  const coverageScore = await calculateCoverage(lang, []);
  
  // Overall
  const overall = await calculateReadinessScore(lang, mistakesCount, stats, useConservative);
  
  return {
    overall,
    components: {
      mistakes: { 
        score: mistakeScore, 
        weight: 0.30, 
        count: mistakesCount,
        hasEnoughData,
        warning: !hasEnoughData ? 'Need more practice to assess mistakes' : null
      },
      performance: { 
        score: performanceScore, 
        weight: 0.25, 
        attempts: totalAttempts7d,
        hasEnoughData: hasEnoughPerformanceData,
        warning: !hasEnoughPerformanceData ? 'Need more practice to assess performance' : null
      },
      mockExam: { 
        score: mockExamScore, 
        weight: 0.30, 
        ...mockDetails 
      },
      coverage: { 
        score: coverageScore, 
        weight: 0.15, 
        seen: questionsSeenCount,
        total: totalQuestions
      },
    },
  };
};
