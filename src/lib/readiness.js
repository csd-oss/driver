import { buildQuestionIndex } from './bank';
import * as StatsDB from '../db/queries/stats';

/**
 * Exam readiness: the shared score formula, a deterministic forward
 * simulation that estimates how many days of study are left, and the
 * async gatherer that feeds both from the database.
 *
 * Blocker keys (returned in `blockers` by simulateDaysToReady and
 * getReadinessForecast). Each entry describes something that still stands
 * between the user and READY_THRESHOLD, measured from today's state:
 *
 *   { key: 'unseen',   count }              questions never answered yet
 *   { key: 'mistakes', count }              open mistakes still in review
 *   { key: 'accuracy', current, needed }    7-day accuracy below what the
 *                                           threshold needs; `current` is
 *                                           null when there is no data yet
 *   { key: 'mocks',    taken, needed }      passed mock exams still needed
 *                                           to lift the mock component
 *
 * The list is empty when the user is already ready.
 */

export const WEIGHTS = { mistakes: 0.30, performance: 0.25, mockExam: 0.30, coverage: 0.15 };
export const READY_THRESHOLD = 97;
export const DEFAULT_PACE = 30;
export const MAX_FORECAST_DAYS = 90;
export const LABEL_THRESHOLDS = { ready: 97, almostReady: 85, gettingThere: 60 };

// Rules shared with the historical formula in stats.js. Do not change
// without also changing the copy the user sees on the stats screen.
const MIN_QUESTIONS_FOR_MISTAKES = 50;
const MIN_COVERAGE_FOR_MISTAKES = 0.10;
const MIN_ATTEMPTS_FOR_PERFORMANCE = 10;

// Spaced repetition stages mirror src/db/queries/mistakes.ts: a mistake
// starts at interval 0, each correct review moves it 0 -> 1 -> 3 -> 7 days,
// a correct review at 7 removes it, a wrong review resets it to 0.
const REVIEW_INTERVALS = [0, 1, 3, 7];

// Simulation assumptions. See simulateDaysToReady for how they are used.
const DEFAULT_ACCURACY = 75;        // start accuracy when nothing is measured
const DEFAULT_TREND_PER_WEEK = 2;   // accuracy points gained per week of study
const MAX_TREND_PER_WEEK = 5;       // measured trends are clamped to this
const ACCURACY_CAP = 98;            // accuracy never simulated above this
const MOCK_PASS_ACCURACY = 92;      // predicted mock pass once accuracy is here
const ACCURACY_NEEDED = 90;         // 7-day accuracy the threshold needs, given
                                    // mocks 100, coverage 100, mistakes ~98
const MOCK_SCORE_NEEDED = 90;       // mock component the threshold needs
const MIN_PACE = 5;
const MAX_PACE = 300;
// A measured pace only replaces the default once there is a real sample:
// one afternoon of answers says nothing about a daily rhythm.
const MIN_PACE_DAYS = 3;
const MIN_PACE_ATTEMPTS = 30;
const EPS = 1e-6;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Map a 0-100 score to the label key used by the UI.
 */
export const getReadinessLabel = (score) => {
  if (score >= LABEL_THRESHOLDS.ready) return 'ready';
  if (score >= LABEL_THRESHOLDS.almostReady) return 'almostReady';
  if (score >= LABEL_THRESHOLDS.gettingThere) return 'gettingThere';
  return 'needsWork';
};

/**
 * Mock exam component: 60% lifetime pass rate, 40% pass rate of the last 3.
 * `history` is newest first.
 */
const mockScore = (history = []) => {
  const examsTaken = history.length;
  if (examsTaken === 0) return { score: 0, passRate: 0, recentPassRate: 0, examsTaken: 0 };
  const passed = history.filter((exam) => exam.passed).length;
  const passRate = (passed / examsTaken) * 100;
  const recent = history.slice(0, 3);
  const recentPassed = recent.filter((exam) => exam.passed).length;
  const recentPassRate = recent.length > 0 ? (recentPassed / recent.length) * 100 : passRate;
  return {
    score: passRate * 0.6 + recentPassRate * 0.4,
    passRate,
    recentPassRate,
    examsTaken,
  };
};

/**
 * Pure readiness formula. Every component is 0-100; `overall` is the
 * weighted, rounded, clamped total.
 *
 * @param {object} input
 * @param {number} input.totalQuestions   size of the question bank
 * @param {number} input.seenCount        distinct questions answered at least once
 * @param {number} input.mistakesCount    open mistakes
 * @param {number|null} input.accuracy7d  0-100 accuracy over the last 7 days, null when unknown
 * @param {number} input.attempts7d       study attempts over the last 7 days
 * @param {Array<{passed:boolean}>} input.mockHistory  completed mocks, newest first
 * @param {boolean} input.useConservative give partial credit while data is thin
 */
export const scoreComponents = ({
  totalQuestions,
  seenCount,
  mistakesCount,
  accuracy7d,
  attempts7d,
  mockHistory = [],
  useConservative = false,
}) => {
  const total = Math.max(0, Number(totalQuestions) || 0);
  const seen = Math.max(0, Number(seenCount) || 0);
  const coverageRatio = total > 0 ? seen / total : 0;

  const hasEnoughMistakeData =
    seen >= MIN_QUESTIONS_FOR_MISTAKES || coverageRatio >= MIN_COVERAGE_FOR_MISTAKES;
  let mistakes;
  if (!hasEnoughMistakeData) {
    mistakes = useConservative ? Math.min(30, coverageRatio * 100) : 0;
  } else {
    const mistakeRatio = (Number(mistakesCount) || 0) / Math.max(seen, 1);
    mistakes = Math.max(0, 100 - mistakeRatio * 100);
  }

  const attempts = Math.max(0, Number(attempts7d) || 0);
  const hasEnoughPerformanceData =
    attempts >= MIN_ATTEMPTS_FOR_PERFORMANCE && accuracy7d !== null && accuracy7d !== undefined;
  let performance;
  if (!hasEnoughPerformanceData) {
    performance = useConservative ? Math.min(30, (attempts / MIN_ATTEMPTS_FOR_PERFORMANCE) * 30) : 0;
  } else {
    performance = accuracy7d;
  }

  const mock = mockScore(mockHistory);
  const coverage = total > 0 ? Math.round(coverageRatio * 100) : 0;

  const overall = total === 0
    ? 0
    : clamp(Math.round(
        mistakes * WEIGHTS.mistakes +
        performance * WEIGHTS.performance +
        mock.score * WEIGHTS.mockExam +
        coverage * WEIGHTS.coverage
      ), 0, 100);

  return {
    mistakes,
    performance,
    mockExam: mock.score,
    coverage,
    overall,
    hasEnoughMistakeData,
    hasEnoughPerformanceData,
    mockPassRate: mock.passRate,
    mockRecentPassRate: mock.recentPassRate,
    examsTaken: mock.examsTaken,
  };
};

/**
 * How many consecutive passed mocks would lift the mock component to
 * MOCK_SCORE_NEEDED, given the existing history (newest first).
 */
const passesNeededForMock = (history = []) => {
  let list = history;
  for (let n = 0; n <= 100; n++) {
    if (mockScore(list).score >= MOCK_SCORE_NEEDED) return n;
    list = [{ passed: true }, ...list];
  }
  return 100;
};

// ---- Mistake buckets -------------------------------------------------------
// Open mistakes are tracked as fractional counts keyed by (stage, due day) so
// the expected number evolves without random draws.

const bucketKey = (stage, due) => `${stage}:${due}`;

const addToBucket = (map, stage, due, count) => {
  if (count <= EPS) return;
  const key = bucketKey(stage, due);
  const existing = map.get(key);
  if (existing) existing.count += count;
  else map.set(key, { stage, due, count });
};

const stageForInterval = (intervalDays) => {
  const index = REVIEW_INTERVALS.indexOf(Number(intervalDays) || 0);
  return index >= 0 ? index : 0;
};

const bucketsFromMistakes = (mistakes = []) => {
  const map = new Map();
  for (const mistake of mistakes) {
    const stage = stageForInterval(mistake.intervalDays);
    const due = Math.max(0, Math.ceil(Number(mistake.dueInDays) || 0));
    addToBucket(map, stage, due, 1);
  }
  return map;
};

const countBuckets = (map) => {
  let total = 0;
  for (const bucket of map.values()) total += bucket.count;
  return total;
};

/**
 * One simulated day of Smart Practice: due mistake reviews first, then
 * unseen questions. Returns the new bucket map and mutates `state.seen`
 * and `state.unseen`. `a` is accuracy as a 0-1 fraction.
 */
const stepDay = (state, a, pace) => {
  let capacity = pace;
  const next = new Map();

  let due = 0;
  for (const bucket of state.buckets.values()) {
    if (bucket.due <= 0) due += bucket.count;
  }
  const reviews = Math.min(capacity, due);
  const reviewedFraction = due > 0 ? reviews / due : 0;
  capacity -= reviews;

  for (const bucket of state.buckets.values()) {
    if (bucket.due > 0) {
      addToBucket(next, bucket.stage, bucket.due, bucket.count);
      continue;
    }
    const reviewed = bucket.count * reviewedFraction;
    const kept = bucket.count - reviewed;
    // Not reached today: still due tomorrow.
    addToBucket(next, bucket.stage, 0, kept);
    const correct = reviewed * a;
    const wrong = reviewed - correct;
    const nextStage = bucket.stage + 1;
    if (nextStage < REVIEW_INTERVALS.length) {
      addToBucket(next, nextStage, REVIEW_INTERVALS[nextStage], correct);
    }
    // A correct review at the last stage removes the mistake. A wrong one
    // resets it to stage 0, due again tomorrow.
    addToBucket(next, 0, 1, wrong);
  }

  const fresh = Math.min(capacity, state.unseen);
  state.unseen -= fresh;
  state.seen += fresh;
  addToBucket(next, 0, 1, fresh * (1 - a));

  // Age every bucket by one day.
  const aged = new Map();
  for (const bucket of next.values()) {
    addToBucket(aged, bucket.stage, Math.max(0, bucket.due - 1), bucket.count);
  }
  return aged;
};

/**
 * Blockers measured from today's state. See the key list at the top.
 */
const computeBlockers = ({ totalQuestions, seenCount, mistakes, accuracy7d, mockHistory }) => {
  const blockers = [];
  const unseen = Math.max(0, totalQuestions - seenCount);
  if (unseen > 0) blockers.push({ key: 'unseen', count: Math.round(unseen) });
  if (mistakes.length > 0) blockers.push({ key: 'mistakes', count: mistakes.length });
  if (accuracy7d === null || accuracy7d === undefined || accuracy7d < ACCURACY_NEEDED) {
    blockers.push({
      key: 'accuracy',
      current: accuracy7d === null || accuracy7d === undefined ? null : Math.round(accuracy7d),
      needed: ACCURACY_NEEDED,
    });
  }
  const passesNeeded = passesNeededForMock(mockHistory);
  if (passesNeeded > 0) {
    blockers.push({ key: 'mocks', taken: mockHistory.length, needed: passesNeeded });
  }
  return blockers;
};

/**
 * Deterministic expected-value forecast of the days of study until the
 * readiness score reaches READY_THRESHOLD.
 *
 * Assumptions, in plain words:
 * - The user answers `pace` questions a day, every day, in Smart Practice
 *   order: due mistakes first, then unseen questions.
 * - A review is correct with probability equal to the current accuracy.
 *   Mistakes follow the real 0/1/3/7 day schedule in expectation.
 * - Accuracy keeps improving at the measured weekly trend (clamped to
 *   0..5 points a week), or by 2 points a week when there is no trend
 *   yet, while there is still something left to learn. It never goes
 *   above 98.
 * - Mock exams are taken once accuracy is high enough to pass (92%), at
 *   `mocksPerWeek` a week (default 1). Failed mocks are not simulated:
 *   the forecast assumes the user takes them when ready.
 *
 * @returns {{ days: number|null, finalScore: number, blockers: object[], trajectory: number[] }}
 */
export const simulateDaysToReady = (inputs) => {
  const {
    totalQuestions,
    seenCount,
    mistakes = [],
    accuracy7d = null,
    accuracyTrendPerWeek = null,
    attempts7d = 0,
    mockHistory = [],
    mockAccuracy = null,
    pace = DEFAULT_PACE,
    useConservative = false,
    mocksPerWeek = 1,
    maxDays = MAX_FORECAST_DAYS,
  } = inputs;

  const total = Math.max(0, Number(totalQuestions) || 0);
  const state = {
    seen: clamp(Number(seenCount) || 0, 0, total),
    unseen: 0,
    buckets: bucketsFromMistakes(mistakes),
  };
  state.unseen = total - state.seen;

  const blockers = computeBlockers({
    totalQuestions: total,
    seenCount: state.seen,
    mistakes,
    accuracy7d,
    mockHistory,
  });

  const startAccuracy = accuracy7d ?? mockAccuracy ?? DEFAULT_ACCURACY;
  const trendPerWeek = accuracyTrendPerWeek === null || accuracyTrendPerWeek === undefined
    ? DEFAULT_TREND_PER_WEEK
    : clamp(accuracyTrendPerWeek, 0, MAX_TREND_PER_WEEK);
  const trendPerDay = trendPerWeek / 7;
  const mockEvery = Math.max(1, Math.round(7 / Math.max(mocksPerWeek, 1 / 7)));
  const dailyPace = Math.max(1, Number(pace) || DEFAULT_PACE);

  let accuracy = clamp(startAccuracy, 0, ACCURACY_CAP);
  let history = [...mockHistory];
  const trajectory = [];

  const scoreFor = (day, accuracyForScore) => scoreComponents({
    totalQuestions: total,
    seenCount: state.seen,
    mistakesCount: countBuckets(state.buckets),
    accuracy7d: accuracyForScore,
    attempts7d: day === 0
      ? attempts7d
      : Math.min(7, day) * dailyPace + (Math.max(0, 7 - day) / 7) * (Number(attempts7d) || 0),
    mockHistory: history,
    useConservative,
  }).overall;

  // Day 0 is today: the real score, before any simulated study.
  const today = scoreFor(0, accuracy7d);
  trajectory.push(today);
  if (today >= READY_THRESHOLD) {
    return { days: 0, finalScore: today, blockers: [], trajectory };
  }

  let finalScore = today;
  for (let day = 1; day <= maxDays; day++) {
    const stillLearning = state.unseen > 0.5 || countBuckets(state.buckets) > 0.5;
    state.buckets = stepDay(state, accuracy / 100, dailyPace);
    if (stillLearning) accuracy = Math.min(ACCURACY_CAP, accuracy + trendPerDay);
    if (day % mockEvery === 0 && accuracy >= MOCK_PASS_ACCURACY) {
      history = [{ passed: true }, ...history];
    }
    finalScore = scoreFor(day, Math.round(accuracy));
    trajectory.push(finalScore);
    if (finalScore >= READY_THRESHOLD) {
      return { days: day, finalScore, blockers, trajectory };
    }
  }

  return { days: null, finalScore, blockers, trajectory };
};

/**
 * Smallest daily pace (5..300) that reaches the threshold within
 * `daysAvailable` days, or null when even 300 a day is not enough.
 */
export const requiredPaceForDate = (inputs, daysAvailable) => {
  const days = Math.floor(Number(daysAvailable) || 0);
  if (days <= 0) return null;
  const horizon = Math.min(days, 365);
  const reaches = (pace) => {
    const result = simulateDaysToReady({ ...inputs, pace, maxDays: horizon });
    return result.days !== null && result.days <= days;
  };
  if (!reaches(MAX_PACE)) return null;
  let low = MIN_PACE;
  let high = MAX_PACE;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (reaches(mid)) high = mid;
    else low = mid + 1;
  }
  return low;
};

// ---- Gatherer ---------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const sumDaily = (rows) => rows.reduce(
  (acc, day) => ({ attempts: acc.attempts + day.attempts, correct: acc.correct + day.correct }),
  { attempts: 0, correct: 0 }
);

const accuracyOf = ({ attempts, correct }) =>
  attempts > 0 ? Math.round((correct / attempts) * 100) : null;

/**
 * Read everything the forecast needs for one language and run it.
 *
 * @param {number} lang
 * @param {{ useConservative?: boolean, examDate?: Date|null }} options
 */
export const getReadinessForecast = async (lang, { useConservative = false, examDate = null } = {}) => {
  const totalQuestions = Object.keys(buildQuestionIndex(lang)).length;
  const seenCount = await StatsDB.getQuestionsSeenCount(lang);

  const last7 = sumDaily(await StatsDB.getDailyStats(lang, 7));
  const previous7 = await StatsDB.getWindowStats(lang, 14, 7);
  const accuracy7d = accuracyOf(last7);
  const previousAccuracy = accuracyOf(previous7);
  const accuracyTrendPerWeek =
    last7.attempts >= MIN_ATTEMPTS_FOR_PERFORMANCE &&
    previous7.attempts >= MIN_ATTEMPTS_FOR_PERFORMANCE &&
    accuracy7d !== null &&
    previousAccuracy !== null
      ? accuracy7d - previousAccuracy
      : null;

  const now = Date.now();
  const openMistakes = await StatsDB.getOpenMistakes(lang);
  const mistakes = openMistakes.map((row) => ({
    intervalDays: row.intervalDays,
    dueInDays: row.nextReviewAt === null
      ? 0
      : Math.max(0, Math.ceil((row.nextReviewAt * 1000 - now) / DAY_MS)),
  }));
  const dueMistakesCount = mistakes.filter((m) => m.dueInDays <= 0).length;

  const mockStats = await StatsDB.getMockStats(lang);
  const mockHistory = mockStats.history.map((exam) => ({
    passed: Boolean(exam.passed),
    completedAt: exam.completedAt,
  }));
  const recentMocks = mockHistory.filter((exam) => {
    const at = exam.completedAt instanceof Date ? exam.completedAt.getTime() : null;
    return at !== null && now - at <= 14 * DAY_MS;
  }).length;
  const mocksPerWeek = Math.max(1, recentMocks / 2);
  const mockAccuracy = await StatsDB.getMockAccuracy(lang);

  const paceStats = await StatsDB.getPaceStats(lang);
  let pace = DEFAULT_PACE;
  let paceSource = 'default';
  if (paceStats.attempts14d > 0 && paceStats.firstAttemptAt !== null) {
    const daysSinceFirst = Math.floor((now - paceStats.firstAttemptAt * 1000) / DAY_MS) + 1;
    const window = clamp(daysSinceFirst, 1, 14);
    const measured = Math.max(1, Math.round(paceStats.attempts14d / window));
    if (window >= MIN_PACE_DAYS && paceStats.attempts14d >= MIN_PACE_ATTEMPTS) {
      pace = measured;
      paceSource = 'measured';
    } else {
      // Thin history: never let a first session drag the estimate below the default.
      pace = Math.max(measured, DEFAULT_PACE);
    }
  }

  // The simulation starts from the user's accuracy only once the sample is
  // meaningful; below that it falls back to mock accuracy or the default.
  const accuracyForSimulation = last7.attempts >= MIN_ATTEMPTS_FOR_PERFORMANCE ? accuracy7d : null;

  const inputs = {
    totalQuestions,
    seenCount,
    mistakes,
    accuracy7d: accuracyForSimulation,
    accuracyTrendPerWeek,
    attempts7d: last7.attempts,
    mockHistory,
    mockAccuracy,
    pace,
    useConservative,
    mocksPerWeek,
  };

  const components = scoreComponents({
    totalQuestions,
    seenCount,
    mistakesCount: mistakes.length,
    accuracy7d,
    attempts7d: last7.attempts,
    mockHistory,
    useConservative,
  });
  const simulation = simulateDaysToReady(inputs);

  let daysUntilExam = null;
  let requiredPace = null;
  let onTrackForExam = null;
  if (examDate instanceof Date && !Number.isNaN(examDate.getTime())) {
    daysUntilExam = Math.round((startOfDay(examDate) - startOfDay(new Date(now))) / DAY_MS);
    requiredPace = simulation.days === 0 ? 0 : requiredPaceForDate(inputs, daysUntilExam);
    onTrackForExam = simulation.days !== null && simulation.days <= daysUntilExam;
  }

  return {
    score: components.overall,
    label: getReadinessLabel(components.overall),
    components,
    daysToReady: simulation.days,
    pace,
    paceSource,
    accuracy7d,
    accuracyTrendPerWeek,
    unseenCount: Math.max(0, totalQuestions - seenCount),
    mistakesCount: mistakes.length,
    dueMistakesCount,
    mockHistory,
    blockers: simulation.blockers,
    examDate,
    daysUntilExam,
    requiredPace,
    onTrackForExam,
  };
};
