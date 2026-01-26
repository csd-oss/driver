import { applyAnswer } from '../src/lib/engine';

describe('engine.applyAnswer', () => {
  it('adds mistake and resets streak on wrong answer', () => {
    const state = { mistakesByLang: {}, streaksByLang: {} };
    const next = applyAnswer(state, 1, 'q1', false);

    expect(next.mistakesByLang['1']).toEqual(['q1']);
    expect(next.streaksByLang['1'].q1).toBe(0);
  });

  it('removes mistake after two consecutive correct answers', () => {
    let state = { mistakesByLang: { '1': ['q1'] }, streaksByLang: { '1': {} } };

    state = applyAnswer(state, 1, 'q1', true);
    expect(state.mistakesByLang['1']).toEqual(['q1']);
    expect(state.streaksByLang['1'].q1).toBe(1);

    state = applyAnswer(state, 1, 'q1', true);
    expect(state.mistakesByLang['1']).toEqual([]);
    expect(state.streaksByLang['1'].q1).toBeUndefined();
  });
});
