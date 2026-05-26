import { calculateAccuracy, capHistory, pruneDaily } from '../src/lib/stats';

describe('stats helpers', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-26T12:00:00'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('calculateAccuracy returns dash when attempts are zero', () => {
    expect(calculateAccuracy(0, 0)).toBe('—');
  });

  it('calculateAccuracy returns rounded percentage', () => {
    expect(calculateAccuracy(10, 7)).toBe(70);
  });

  it('capHistory trims to max length', () => {
    const history = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const capped = capHistory(history, 2);
    expect(capped.length).toBe(2);
    expect(capped[0].id).toBe(0);
  });

  it('pruneDaily is a no-op (daily stats are now computed from the database)', () => {
    const stats = {
      study: {
        daily: {
          '20260126': { attempts: 1, correct: 1, wrong: 0 },
          '20260110': { attempts: 1, correct: 0, wrong: 1 },
        },
      },
    };

    expect(() => pruneDaily(stats, 7)).not.toThrow();
    // pruneDaily used to trim in-memory; it now intentionally does nothing
    // because stats.study.daily is derived from `v_daily_stats` in SQLite.
    expect(stats.study.daily['20260126']).toBeDefined();
    expect(stats.study.daily['20260110']).toBeDefined();
  });
});
