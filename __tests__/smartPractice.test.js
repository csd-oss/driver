jest.mock('../src/lib/storage', () => ({
  loadProgress: jest.fn(),
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

import { getSmartQuestion } from '../src/lib/smartPractice';
import { loadProgress } from '../src/lib/storage';
import { loadStats } from '../src/lib/stats';
import {
  buildQuestionIndex,
  findQuestionById,
  getTestForQuestion,
  getTests,
} from '../src/lib/bank';

const mockQuestion = (qid) => ({ qid, text: 'Q', qNo: 1, answers: ['a', 'b', 'c'] });

describe('smartPractice.getSmartQuestion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prioritizes mistakes over other sources', async () => {
    loadProgress.mockResolvedValue({ mistakesByLang: { '1': ['m1'] } });
    loadStats.mockResolvedValue({ statsByLang: { '1': { coverage: { questionsSeen: [] } } } });
    findQuestionById.mockImplementation((_, qid) => mockQuestion(qid));

    const result = await getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] });

    expect(result.reason.type).toBe('mistake');
    expect(result.question.qid).toBe('m1');
  });

  it('uses unseen questions when there are no mistakes', async () => {
    loadProgress.mockResolvedValue({ mistakesByLang: { '1': [] } });
    loadStats.mockResolvedValue({ statsByLang: { '1': { coverage: { questionsSeen: [] } } } });
    buildQuestionIndex.mockReturnValue({ u1: { testIndex: 0, qNo: 1 } });
    findQuestionById.mockImplementation((_, qid) => mockQuestion(qid));

    const result = await getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] });

    expect(result.reason.type).toBe('unseen');
    expect(result.question.qid).toBe('u1');
  });

  it('uses weakest category when all questions are seen', async () => {
    loadProgress.mockResolvedValue({ mistakesByLang: { '1': [] } });
    loadStats.mockResolvedValue({
      statsByLang: {
        '1': {
          coverage: { questionsSeen: ['w1'] },
          study: { byCategory: { Signs: { attempts: 10, correct: 5, wrong: 5 } } },
        },
      },
    });

    buildQuestionIndex.mockReturnValue({ w1: { testIndex: 0, qNo: 1 } });
    getTests.mockReturnValue([
      { pocet: 1, okruhy: { 1: [{ txt: 'Signs', zacina: 1 }] } },
    ]);
    getTestForQuestion.mockReturnValue({ pocet: 1, okruhy: { 1: [{ txt: 'Signs', zacina: 1 }] } });
    findQuestionById.mockImplementation((_, qid) => mockQuestion(qid));

    const result = await getSmartQuestion({ lang: 1, selectedCategory: 'all', recentIds: [] });

    expect(result.reason.type).toBe('weak');
    expect(result.reason.category).toBe('Signs');
    expect(result.question.qid).toBe('w1');
  });
});
