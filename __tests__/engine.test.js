// engine.applyAnswer is now async + DB-backed. It delegates wrong/correct
// handling to MistakesDB and returns the derived state for back-compat.
jest.mock('../src/db/queries/mistakes', () => ({
  addMistake: jest.fn().mockResolvedValue(undefined),
  recordCorrectAnswer: jest.fn().mockResolvedValue(undefined),
  getMistakes: jest.fn().mockResolvedValue([]),
  getStreak: jest.fn().mockResolvedValue(0),
}));

import { applyAnswer } from '../src/lib/engine';
import * as MistakesDB from '../src/db/queries/mistakes';

describe('engine.applyAnswer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('routes a wrong answer to MistakesDB.addMistake', async () => {
    MistakesDB.getMistakes.mockResolvedValueOnce(['q1']);

    const next = await applyAnswer({}, 1, 'q1', false);

    expect(MistakesDB.addMistake).toHaveBeenCalledWith(1, 'q1');
    expect(MistakesDB.recordCorrectAnswer).not.toHaveBeenCalled();
    expect(next.mistakesByLang['1']).toEqual(['q1']);
  });

  it('routes a correct answer to MistakesDB.recordCorrectAnswer', async () => {
    MistakesDB.getMistakes.mockResolvedValueOnce([]);

    const next = await applyAnswer({}, 1, 'q1', true);

    expect(MistakesDB.recordCorrectAnswer).toHaveBeenCalledWith(1, 'q1');
    expect(MistakesDB.addMistake).not.toHaveBeenCalled();
    expect(next.mistakesByLang['1']).toEqual([]);
  });
});
