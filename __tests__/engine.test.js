// engine.applyAnswer is async + DB-backed. It delegates wrong/correct
// handling to MistakesDB; callers ignore the return value.
jest.mock('../src/db/queries/mistakes', () => ({
  addMistake: jest.fn().mockResolvedValue(undefined),
  recordCorrectAnswer: jest.fn().mockResolvedValue(undefined),
}));

import { applyAnswer } from '../src/lib/engine';
import * as MistakesDB from '../src/db/queries/mistakes';

describe('engine.applyAnswer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('routes a wrong answer to MistakesDB.addMistake', async () => {
    await applyAnswer({}, 1, 'q1', false);

    expect(MistakesDB.addMistake).toHaveBeenCalledWith(1, 'q1');
    expect(MistakesDB.recordCorrectAnswer).not.toHaveBeenCalled();
  });

  it('routes a correct answer to MistakesDB.recordCorrectAnswer', async () => {
    await applyAnswer({}, 1, 'q1', true);

    expect(MistakesDB.recordCorrectAnswer).toHaveBeenCalledWith(1, 'q1');
    expect(MistakesDB.addMistake).not.toHaveBeenCalled();
  });
});
