const mockInsertValues = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/db/index', () => ({
  database: { getAllAsync: jest.fn() },
  db: { insert: jest.fn(() => ({ values: mockInsertValues })) },
}));

jest.mock('../src/db/device', () => ({
  getDeviceId: jest.fn().mockResolvedValue('device-1'),
}));

jest.mock('../src/db/utils', () => ({
  generateId: jest.fn(() => 'id-1'),
}));

import { addExamResult } from '../src/db/queries/examResults';

describe('examResults.addExamResult', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts a row with defaults and returns the id', async () => {
    const takenAt = new Date('2026-09-01T00:00:00Z');
    const id = await addExamResult({ lang: 1, passed: false, points: 89, takenAt });

    expect(id).toBe('id-1');
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    const row = mockInsertValues.mock.calls[0][0];
    expect(row).toMatchObject({
      id: 'id-1',
      deviceId: 'device-1',
      lang: 1,
      passed: false,
      points: 89,
      maxPoints: 100,
      minToPass: 90,
      readinessScore: null,
      takenAt,
      syncedAt: null,
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('stores the readiness score when given', async () => {
    await addExamResult({ lang: 2, passed: true, points: 96, readinessScore: 91, takenAt: new Date() });
    expect(mockInsertValues.mock.calls[0][0].readinessScore).toBe(91);
  });

  it.each([-1, 101, 89.5, NaN])('rejects invalid points %p', async (points) => {
    await expect(
      addExamResult({ lang: 1, passed: true, points, takenAt: new Date() })
    ).rejects.toThrow(/points/);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it('rejects an invalid date', async () => {
    await expect(
      addExamResult({ lang: 1, passed: true, points: 95, takenAt: new Date('nope') })
    ).rejects.toThrow(/takenAt/);
  });
});
