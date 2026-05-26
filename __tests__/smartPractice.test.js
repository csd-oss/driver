// Mocks must be declared before importing the code under test.
// The DB index module is the natural injection point — smartPractice.js
// imports `database` from it directly, and so do the query modules.
jest.mock('../src/db/index', () => ({
  database: { getAllAsync: jest.fn() },
  db: {},
}));

jest.mock('../src/db/queries/mistakes', () => ({
  getMistakes: jest.fn(),
}));

jest.mock('../src/db/queries/attempts', () => ({
  getQuestionPerformanceStats: jest.fn(),
}));

jest.mock('../src/lib/stats', () => ({
  loadStats: jest.fn(),
}));

jest.mock('../src/lib/bank', () => ({
  buildQuestionIndex: jest.fn(),
  findQuestionById: jest.fn(),
  flattenRandomQuestion: jest.fn(),
  getTestForQuestion: jest.fn(),
  getTests: jest.fn(),
}));

jest.mock('../src/lib/categories', () => ({
  getCategoryForQuestion: jest.fn(),
}));

import { getSmartQuestion } from '../src/lib/smartPractice';
import { database } from '../src/db/index';
import { getMistakes } from '../src/db/queries/mistakes';
import { getQuestionPerformanceStats } from '../src/db/queries/attempts';
import { loadStats } from '../src/lib/stats';
import {
  buildQuestionIndex,
  findQuestionById,
  getTestForQuestion,
  getTests,
} from '../src/lib/bank';
import { getCategoryForQuestion } from '../src/lib/categories';

const mockQuestion = (qid) => ({ qid, text: 'Q', qNo: 1, answers: ['a', 'b', 'c'] });
const SIGNS_TEST = { pocet: 1, okruhy: { 1: [{ txt: 'Signs', zacina: 1 }] } };

describe('smartPractice.getSmartQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Defaults: empty world. Each test overrides what it needs.
    getMistakes.mockResolvedValue([]);
    getQuestionPerformanceStats.mockResolvedValue([]);
    database.getAllAsync.mockResolvedValue([]);
    loadStats.mockResolvedValue({ statsByLang: { '1': { study: { byCategory: {} } } } });
    findQuestionById.mockImplementation((_, qid) => mockQuestion(qid));
  });

  it('prioritizes mistakes over other sources', async () => {
    getMistakes.mockResolvedValue(['m1']);

    const result = await getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] });

    expect(result.reason.type).toBe('mistake');
    expect(result.question.qid).toBe('m1');
  });

  it('uses unseen questions when there are no mistakes', async () => {
    buildQuestionIndex.mockReturnValue({ u1: { testIndex: 0, qNo: 1 } });

    const result = await getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] });

    expect(result.reason.type).toBe('unseen');
    expect(result.question.qid).toBe('u1');
  });

  it('uses weakest category when all questions are seen', async () => {
    database.getAllAsync.mockResolvedValue([{ question_id: 'w1' }]);
    loadStats.mockResolvedValue({
      statsByLang: {
        '1': { study: { byCategory: { Signs: { attempts: 10, correct: 5, wrong: 5 } } } },
      },
    });
    buildQuestionIndex.mockReturnValue({ w1: { testIndex: 0, qNo: 1 } });
    getTests.mockReturnValue([SIGNS_TEST]);
    getTestForQuestion.mockReturnValue(SIGNS_TEST);
    getCategoryForQuestion.mockReturnValue('Signs');

    const result = await getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] });

    expect(result.reason.type).toBe('weak');
    expect(result.reason.category).toBe('Signs');
    expect(result.question.qid).toBe('w1');
  });

  // Regression: pickFromWeakCategory used to call StatsDB.getTimeWeightedCategoryStats,
  // but StatsDB is not imported in smartPractice.js and the function doesn't exist
  // anywhere in src/db/queries/. Any user who exhausted unseen questions would hit
  // a ReferenceError. The assertion here is that the Priority-3 path resolves cleanly
  // rather than throwing.
  it('reaches Priority 3 (weak category) without throwing — regression for StatsDB ReferenceError', async () => {
    database.getAllAsync.mockResolvedValue([{ question_id: 'w1' }]);
    loadStats.mockResolvedValue({
      statsByLang: {
        '1': { study: { byCategory: { Signs: { attempts: 10, correct: 5, wrong: 5 } } } },
      },
    });
    buildQuestionIndex.mockReturnValue({ w1: { testIndex: 0, qNo: 1 } });
    getTests.mockReturnValue([SIGNS_TEST]);
    getTestForQuestion.mockReturnValue(SIGNS_TEST);
    getCategoryForQuestion.mockReturnValue('Signs');

    await expect(
      getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] })
    ).resolves.toMatchObject({
      reason: { type: 'weak', category: 'Signs' },
      question: { qid: 'w1' },
    });
  });
});
