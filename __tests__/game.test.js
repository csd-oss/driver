jest.mock('../src/db/index', () => ({ database: { getAllAsync: jest.fn() }, db: {} }));

import {
  LIVES,
  ROUND_SIZE,
  TIME_LIMIT_MS,
  answerIndexForSequence,
  classifyQuestion,
  createRound,
  getGameItems,
  parseOrdinal,
  parseSequence,
  parseVehicle,
  parseVehicleGroup,
  scoreAnswer,
} from '../src/lib/game';

describe('game parsers', () => {
  it('reads whole-answer vehicles in three languages', () => {
    expect(parseVehicle('zelené vozidlo.', 1)).toBe('green');
    expect(parseVehicle('vaše vozidlo.', 1)).toBe('you');
    expect(parseVehicle('the red vehicle.', 2)).toBe('red');
    expect(parseVehicle('the tram.', 2)).toBe('tram');
    expect(parseVehicle('a kék jármű.', 3)).toBe('blue');
    expect(parseVehicle('az Ön járműve.', 3)).toBe('you');
    expect(parseVehicle('má pred vodičom červeného vozidla prednosť.', 1)).toBeNull();
  });

  it('reads paired answers', () => {
    expect(parseVehicleGroup('the red vehicle.', 2)).toEqual(['red']);
    expect(parseVehicleGroup('your vehicle at the same time as the blue vehicle.', 2)).toEqual(['you', 'blue']);
    expect(parseVehicleGroup('the green vehicle at the same time as the red.', 2)).toEqual(['green', 'red']);
    expect(parseVehicleGroup('červené vozidlo súčasne s modrým.', 1)).toEqual(['red', 'blue']);
    expect(parseVehicleGroup('vaše vozidlo súčasne so žltým vozidlom.', 1)).toEqual(['you', 'yellow']);
    expect(parseVehicleGroup('a piros jármű a kékkel egyszerre.', 3)).toEqual(['red', 'blue']);
    expect(parseVehicleGroup('az Ön járműve a zölddel egyszerre.', 3)).toEqual(['you', 'green']);
    expect(parseVehicleGroup('modré vozidlo súčasne s obidvoma električkami.', 1)).toBeNull();
  });

  it('reads ordinals', () => {
    expect(parseOrdinal('druhé.', 1)).toBe('second');
    expect(parseOrdinal('the last one.', 2)).toBe('last');
    expect(parseOrdinal('Harmadikként.', 3)).toBe('third');
    expect(parseOrdinal('the green vehicle.', 2)).toBeNull();
  });

  it('reads crossing sequences and rejects simultaneous steps', () => {
    expect(parseSequence('1. modré, 2. zelené, 3. žlté, 4. vaše vozidlo, 5. električka.', 1))
      .toEqual(['blue', 'green', 'yellow', 'you', 'tram']);
    expect(parseSequence('1. red, 2. your vehicle, 3. the tram.', 2)).toEqual(['red', 'you', 'tram']);
    expect(parseSequence('1. a piros, 2. az Ön járműve, 3. a zöld.', 3)).toEqual(['red', 'you', 'green']);
    expect(parseSequence('1. červené súčasne so zeleným, 2. modré.', 1)).toBeNull();
    expect(parseSequence('the green vehicle.', 2)).toBeNull();
  });
});

describe('classifyQuestion', () => {
  const q = (overrides) => ({
    qid: 'q1', text: 't', points: 3, image: 'obr3/ds/18.png', correct: 2, answers: [], ...overrides,
  });

  it('builds an order item with canonical chips', () => {
    const item = classifyQuestion(q({
      answers: ['1. blue, 2. green, 3. your vehicle.', '1. your vehicle, 2. blue, 3. green.', '1. green, 2. your vehicle, 3. blue.'],
    }), 2);
    expect(item.type).toBe('order');
    expect(item.sequence).toEqual(['you', 'blue', 'green']);
    expect(item.chips.map((c) => c.key)).toEqual(['you', 'blue', 'green']);
    expect(answerIndexForSequence(item, ['green', 'you', 'blue'])).toBe(3);
    expect(answerIndexForSequence(item, ['blue', 'you', 'green'])).toBe(-1);
  });

  it('builds pick and ordinal items from the answers', () => {
    const pick = classifyQuestion(q({ answers: ['the green vehicle.', 'the red vehicle.', 'your vehicle.'] }), 2);
    expect(pick.type).toBe('pick');
    expect(pick.chips).toEqual([
      { key: 'green', keys: ['green'], answerIndex: 1 },
      { key: 'red', keys: ['red'], answerIndex: 2 },
      { key: 'you', keys: ['you'], answerIndex: 3 },
    ]);
    const ordinal = classifyQuestion(q({ answers: ['prvé.', 'druhé.', 'posledné.'] }), 1);
    expect(ordinal.type).toBe('ordinal');
    expect(ordinal.chips.map((c) => c.key)).toEqual(['first', 'second', 'last']);
  });

  it('falls back to choice for reasons and ignores non-situation images', () => {
    expect(classifyQuestion(q({ answers: ['has the right of way over the driver of the red vehicle.', 'b', 'c'] }), 2).type).toBe('choice');
    expect(classifyQuestion(q({ image: 'obr3/dz/01.png' }), 2)).toBeNull();
  });
});

describe('bank integration', () => {
  it('finds the intersection situations in every language with mostly chip items', () => {
    for (const lang of [1, 2, 3]) {
      const items = getGameItems(lang);
      expect(items.length).toBeGreaterThanOrEqual(85);
      const chipItems = items.filter((i) => i.type !== 'choice').length;
      expect(chipItems).toBeGreaterThanOrEqual(55);
      for (const item of items) {
        if (item.type === 'order') expect(item.sequence.length).toBeGreaterThanOrEqual(2);
        if (item.type === 'pick' || item.type === 'ordinal') expect(item.chips.length).toBe(item.answers.length);
      }
    }
  });

  it('creates a round of distinct situations', () => {
    let seed = 7;
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const round = createRound(2, { random });
    expect(round).toHaveLength(ROUND_SIZE);
    expect(new Set(round.map((i) => i.qid)).size).toBe(ROUND_SIZE);
    expect(LIVES).toBe(3);
  });
});

describe('scoreAnswer', () => {
  it('rewards speed and streaks, nothing for a miss', () => {
    expect(scoreAnswer({ correct: false, elapsedMs: 100, streak: 5 })).toBe(0);
    expect(scoreAnswer({ correct: true, elapsedMs: 0, streak: 0 })).toBe(200);
    expect(scoreAnswer({ correct: true, elapsedMs: TIME_LIMIT_MS, streak: 0 })).toBe(100);
    expect(scoreAnswer({ correct: true, elapsedMs: TIME_LIMIT_MS / 2, streak: 5 })).toBe(225);
    expect(scoreAnswer({ correct: true, elapsedMs: 0, streak: 50 })).toBe(400);
  });
});
