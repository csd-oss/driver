import { getCategoryForQuestion } from '../src/lib/categories';

describe('categories.getCategoryForQuestion', () => {
  it('returns the correct category by question range', () => {
    const test = {
      pocet: 10,
      okruhy: {
        1: [{ txt: 'Rules', zacina: 1 }],
        2: [{ txt: 'Signs', zacina: 6 }],
      },
    };

    expect(getCategoryForQuestion(test, 1)).toBe('Rules');
    expect(getCategoryForQuestion(test, 5)).toBe('Rules');
    expect(getCategoryForQuestion(test, 6)).toBe('Signs');
    expect(getCategoryForQuestion(test, 10)).toBe('Signs');
  });

  it('returns null when question is outside ranges', () => {
    const test = {
      pocet: 5,
      okruhy: {
        1: [{ txt: 'Rules', zacina: 2 }],
      },
    };

    expect(getCategoryForQuestion(test, 1)).toBeNull();
  });
});
