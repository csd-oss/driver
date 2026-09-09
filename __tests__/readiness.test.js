// Mocks must be declared before importing the code under test.
jest.mock('../src/db/index', () => ({
  database: { getAllAsync: jest.fn() },
  db: {},
}));

jest.mock('../src/db/queries/stats', () => ({
  getQuestionsSeenCount: jest.fn(),
  getDailyStats: jest.fn(),
  getWindowStats: jest.fn(),
  getOpenMistakes: jest.fn(),
  getMockStats: jest.fn(),
  getMockAccuracy: jest.fn(),
  getPaceStats: jest.fn(),
}));

jest.mock('../src/lib/bank', () => ({
  buildQuestionIndex: jest.fn(),
}));

import {
  DEFAULT_PACE,
  LABEL_THRESHOLDS,
  MAX_FORECAST_DAYS,
  READY_THRESHOLD,
  WEIGHTS,
  getReadinessForecast,
  getReadinessLabel,
  requiredPaceForDate,
  scoreComponents,
  simulateDaysToReady,
} from '../src/lib/readiness';
import * as StatsDB from '../src/db/queries/stats';
import { buildQuestionIndex } from '../src/lib/bank';

/**
 * The formula as it was written before extraction, kept here as the oracle.
 */
const legacyOverall = ({ totalQuestions, seenCount, mistakesCount, accuracy7d, attempts7d, mockHistory, useConservative }) => {
  const coverageRatio = seenCount / totalQuestions;
  const hasEnoughData = seenCount >= 50 || coverageRatio >= 0.10;
  let mistakeScore;
  if (!hasEnoughData) mistakeScore = useConservative ? Math.min(30, coverageRatio * 100) : 0;
  else mistakeScore = Math.max(0, 100 - (mistakesCount / Math.max(seenCount, 1)) * 100);

  let performanceScore;
  if (attempts7d < 10 || accuracy7d === null) {
    performanceScore = useConservative ? Math.min(30, (attempts7d / 10) * 30) : 0;
  } else {
    performanceScore = accuracy7d;
  }

  let mockExamScore = 0;
  if (mockHistory.length > 0) {
    const passRate = (mockHistory.filter((e) => e.passed).length / mockHistory.length) * 100;
    const recent = mockHistory.slice(0, 3);
    const recentScore = (recent.filter((e) => e.passed).length / recent.length) * 100;
    mockExamScore = passRate * 0.6 + recentScore * 0.4;
  }

  const coverageScore = Math.round(coverageRatio * 100);
  return Math.max(0, Math.min(100, Math.round(
    mistakeScore * 0.30 + performanceScore * 0.25 + mockExamScore * 0.30 + coverageScore * 0.15
  )));
};

const readyUser = {
  totalQuestions: 1500,
  seenCount: 1500,
  mistakes: [],
  accuracy7d: 97,
  attempts7d: 200,
  mockHistory: [{ passed: true }, { passed: true }, { passed: true }],
  pace: 30,
};

describe('readiness labels', () => {
  it('uses the agreed thresholds', () => {
    expect(READY_THRESHOLD).toBe(97);
    expect(LABEL_THRESHOLDS).toEqual({ ready: 97, almostReady: 85, gettingThere: 60 });
    expect(getReadinessLabel(100)).toBe('ready');
    expect(getReadinessLabel(97)).toBe('ready');
    expect(getReadinessLabel(96)).toBe('almostReady');
    expect(getReadinessLabel(85)).toBe('almostReady');
    expect(getReadinessLabel(84)).toBe('gettingThere');
    expect(getReadinessLabel(60)).toBe('gettingThere');
    expect(getReadinessLabel(59)).toBe('needsWork');
    expect(getReadinessLabel(0)).toBe('needsWork');
  });

  it('weights sum to one', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });
});

describe('scoreComponents', () => {
  const fixtures = [
    { totalQuestions: 1500, seenCount: 0, mistakesCount: 0, accuracy7d: null, attempts7d: 0, mockHistory: [], useConservative: false },
    { totalQuestions: 1500, seenCount: 40, mistakesCount: 8, accuracy7d: 80, attempts7d: 6, mockHistory: [], useConservative: true },
    { totalQuestions: 1500, seenCount: 600, mistakesCount: 30, accuracy7d: 82, attempts7d: 140, mockHistory: [{ passed: false }, { passed: true }], useConservative: false },
    { totalQuestions: 1500, seenCount: 1500, mistakesCount: 5, accuracy7d: 96, attempts7d: 210, mockHistory: [{ passed: true }, { passed: true }, { passed: true }, { passed: false }], useConservative: false },
  ];

  it.each(fixtures)('matches the legacy formula for %o', (fixture) => {
    expect(scoreComponents(fixture).overall).toBe(legacyOverall(fixture));
  });

  it('exposes mock details and data flags', () => {
    const result = scoreComponents(fixtures[2]);
    expect(result.examsTaken).toBe(2);
    expect(result.mockPassRate).toBe(50);
    expect(result.mockRecentPassRate).toBe(50);
    expect(result.hasEnoughMistakeData).toBe(true);
    expect(result.hasEnoughPerformanceData).toBe(true);
    expect(scoreComponents(fixtures[0]).hasEnoughMistakeData).toBe(false);
    expect(scoreComponents(fixtures[0]).hasEnoughPerformanceData).toBe(false);
  });

  it('returns zero for an empty bank', () => {
    expect(scoreComponents({ totalQuestions: 0, seenCount: 0, mistakesCount: 0, accuracy7d: null, attempts7d: 0 }).overall).toBe(0);
  });
});

describe('simulateDaysToReady', () => {
  it('returns 0 days when already ready', () => {
    const result = simulateDaysToReady(readyUser);
    expect(result.days).toBe(0);
    expect(result.finalScore).toBeGreaterThanOrEqual(READY_THRESHOLD);
    expect(result.blockers).toEqual([]);
  });

  it('gives a fresh user a finite estimate at the default pace', () => {
    const result = simulateDaysToReady({
      totalQuestions: 1500,
      seenCount: 0,
      mistakes: [],
      accuracy7d: null,
      attempts7d: 0,
      mockHistory: [],
      pace: DEFAULT_PACE,
    });
    expect(result.days).not.toBeNull();
    expect(result.days).toBeGreaterThan(0);
    expect(result.days).toBeLessThanOrEqual(MAX_FORECAST_DAYS);
    expect(result.trajectory[0]).toBe(0);
    expect(result.trajectory[result.days]).toBeGreaterThanOrEqual(READY_THRESHOLD);
    expect(result.blockers.map((b) => b.key)).toEqual(['unseen', 'accuracy', 'mocks']);
    expect(result.blockers.find((b) => b.key === 'accuracy').current).toBeNull();
    expect(result.blockers.find((b) => b.key === 'mocks')).toEqual({ key: 'mocks', taken: 0, needed: 1 });
  });

  it('is faster at a higher pace', () => {
    const base = { totalQuestions: 1500, seenCount: 300, mistakes: [], accuracy7d: 88, attempts7d: 120, mockHistory: [] };
    const slow = simulateDaysToReady({ ...base, pace: 20 }).days;
    const fast = simulateDaysToReady({ ...base, pace: 80 }).days;
    expect(slow).not.toBeNull();
    expect(fast).not.toBeNull();
    expect(fast).toBeLessThanOrEqual(slow);
  });

  it('reports an accuracy blocker and no estimate when accuracy cannot improve', () => {
    const result = simulateDaysToReady({
      totalQuestions: 1500,
      seenCount: 1200,
      mistakes: [],
      accuracy7d: 70,
      accuracyTrendPerWeek: 0,
      attempts7d: 150,
      mockHistory: [{ passed: true }],
      pace: 40,
    });
    expect(result.days).toBeNull();
    expect(result.finalScore).toBeLessThan(READY_THRESHOLD);
    const accuracy = result.blockers.find((b) => b.key === 'accuracy');
    expect(accuracy).toEqual({ key: 'accuracy', current: 70, needed: 90 });
  });

  it('clears mistakes through the spaced-repetition schedule', () => {
    const mistakes = Array.from({ length: 150 }, () => ({ intervalDays: 0, dueInDays: 0 }));
    const result = simulateDaysToReady({
      totalQuestions: 1500,
      seenCount: 1500,
      mistakes,
      accuracy7d: 96,
      accuracyTrendPerWeek: 0,
      attempts7d: 200,
      mockHistory: [{ passed: true }, { passed: true }],
      pace: 30,
    });
    // Four correct reviews spaced 0/1/3/7 days need at least 11 days.
    expect(result.days).not.toBeNull();
    expect(result.days).toBeGreaterThanOrEqual(11);
    expect(result.blockers).toEqual([{ key: 'mistakes', count: 150 }]);
  });

  it('counts the passed mocks a poor history still needs', () => {
    const result = simulateDaysToReady({
      ...readyUser,
      mockHistory: [{ passed: false }, { passed: false }],
    });
    expect(result.days).toBeGreaterThan(0);
    const mocks = result.blockers.find((b) => b.key === 'mocks');
    expect(mocks.taken).toBe(2);
    expect(mocks.needed).toBeGreaterThan(1);
  });
});

describe('requiredPaceForDate', () => {
  const midway = {
    totalQuestions: 1500,
    seenCount: 1000,
    mistakes: Array.from({ length: 20 }, () => ({ intervalDays: 1, dueInDays: 1 })),
    accuracy7d: 93,
    attempts7d: 150,
    mockHistory: [{ passed: true }],
  };

  it('finds the smallest pace that meets the date', () => {
    const pace = requiredPaceForDate(midway, 30);
    expect(pace).not.toBeNull();
    expect(pace).toBeGreaterThanOrEqual(5);
    expect(simulateDaysToReady({ ...midway, pace }).days).toBeLessThanOrEqual(30);
    if (pace > 5) {
      const slower = simulateDaysToReady({ ...midway, pace: pace - 1 }).days;
      expect(slower === null || slower > 30).toBe(true);
    }
  });

  it('returns null when the date is impossible', () => {
    expect(requiredPaceForDate(midway, 0)).toBeNull();
    expect(requiredPaceForDate(midway, -3)).toBeNull();
    // A fresh user cannot lift accuracy from 75 to 92 in 5 days at any pace.
    expect(requiredPaceForDate({ totalQuestions: 1500, seenCount: 0, mistakes: [], accuracy7d: null, attempts7d: 0, mockHistory: [] }, 5)).toBeNull();
  });
});

describe('getReadinessForecast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildQuestionIndex.mockReturnValue(Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`q${i}`, {}])));
  });

  it('uses the default pace when there is no history', async () => {
    StatsDB.getQuestionsSeenCount.mockResolvedValue(0);
    StatsDB.getDailyStats.mockResolvedValue([]);
    StatsDB.getWindowStats.mockResolvedValue({ attempts: 0, correct: 0 });
    StatsDB.getOpenMistakes.mockResolvedValue([]);
    StatsDB.getMockStats.mockResolvedValue({ examsTaken: 0, examsPassed: 0, bestScore: 0, lastScore: 0, history: [] });
    StatsDB.getMockAccuracy.mockResolvedValue(null);
    StatsDB.getPaceStats.mockResolvedValue({ attempts14d: 0, firstAttemptAt: null });

    const forecast = await getReadinessForecast(1);

    expect(forecast.score).toBe(0);
    expect(forecast.label).toBe('needsWork');
    expect(forecast.pace).toBe(DEFAULT_PACE);
    expect(forecast.paceSource).toBe('default');
    expect(forecast.unseenCount).toBe(1500);
    expect(forecast.mistakesCount).toBe(0);
    expect(forecast.daysToReady).not.toBeNull();
    expect(forecast.examDate).toBeNull();
    expect(forecast.daysUntilExam).toBeNull();
    expect(forecast.requiredPace).toBeNull();
    expect(forecast.onTrackForExam).toBeNull();
  });

  it('does not let one wrong answer become the pace and accuracy', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    StatsDB.getQuestionsSeenCount.mockResolvedValue(1);
    StatsDB.getDailyStats.mockResolvedValue([{ date: 'd1', attempts: 1, correct: 0, wrong: 1 }]);
    StatsDB.getWindowStats.mockResolvedValue({ attempts: 0, correct: 0 });
    StatsDB.getOpenMistakes.mockResolvedValue([{ intervalDays: 0, nextReviewAt: null }]);
    StatsDB.getMockStats.mockResolvedValue({ examsTaken: 0, examsPassed: 0, bestScore: 0, lastScore: 0, history: [] });
    StatsDB.getMockAccuracy.mockResolvedValue(null);
    StatsDB.getPaceStats.mockResolvedValue({ attempts14d: 1, firstAttemptAt: nowSec - 60 });

    const forecast = await getReadinessForecast(1);

    expect(forecast.pace).toBe(DEFAULT_PACE);
    expect(forecast.paceSource).toBe('default');
    expect(forecast.accuracy7d).toBe(0);
    // The simulation must start from the default accuracy, not 0%.
    expect(forecast.daysToReady).not.toBeNull();
  });

  it('measures pace, trend, due mistakes, and exam-date fields', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    StatsDB.getQuestionsSeenCount.mockResolvedValue(900);
    StatsDB.getDailyStats.mockResolvedValue([
      { date: 'd1', attempts: 60, correct: 54, wrong: 6 },
      { date: 'd2', attempts: 60, correct: 54, wrong: 6 },
    ]);
    StatsDB.getWindowStats.mockResolvedValue({ attempts: 100, correct: 85 });
    StatsDB.getOpenMistakes.mockResolvedValue([
      { intervalDays: 0, nextReviewAt: null },
      { intervalDays: 3, nextReviewAt: nowSec + 2 * 86400 },
    ]);
    StatsDB.getMockStats.mockResolvedValue({
      examsTaken: 1,
      examsPassed: 1,
      bestScore: 95,
      lastScore: 95,
      history: [{ passed: true, completedAt: new Date() }],
    });
    StatsDB.getMockAccuracy.mockResolvedValue(93);
    StatsDB.getPaceStats.mockResolvedValue({ attempts14d: 280, firstAttemptAt: nowSec - 30 * 86400 });

    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 20);
    const forecast = await getReadinessForecast(1, { examDate });

    expect(forecast.pace).toBe(20);
    expect(forecast.paceSource).toBe('measured');
    expect(forecast.accuracy7d).toBe(90);
    expect(forecast.accuracyTrendPerWeek).toBe(5);
    expect(forecast.mistakesCount).toBe(2);
    expect(forecast.dueMistakesCount).toBe(1);
    expect(forecast.unseenCount).toBe(600);
    expect(forecast.daysUntilExam).toBe(20);
    expect(typeof forecast.onTrackForExam).toBe('boolean');
    expect(forecast.requiredPace === null || forecast.requiredPace >= 5).toBe(true);
    expect(forecast.components.overall).toBe(forecast.score);
    expect(StatsDB.getWindowStats).toHaveBeenCalledWith(1, 14, 7);
  });
});
