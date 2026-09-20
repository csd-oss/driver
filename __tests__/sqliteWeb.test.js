import { eq } from 'drizzle-orm';
import { db, databaseReady } from '../src/db/index.web';
import { crossingLog } from '../src/db/schema/crossingLog';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({ prepareAsync: jest.fn() })),
}));

const body = 'Pozor – állj meg! '.repeat(8000);
let statement, result;
beforeEach(async () => {
  result = { getAllAsync: jest.fn(async () => [[body, 1789900000]]), getFirstAsync: jest.fn(async () => [body, 1789900000]), changes: 1, lastInsertRowId: 7 };
  statement = { executeForRawResultAsync: jest.fn(async () => result), finalizeAsync: jest.fn(async () => {}) };
  (await databaseReady).prepareAsync.mockResolvedValue(statement);
});

test('the web ORM maps large Unicode rows and timestamps through the async worker', async () => {
  const rows = await db.select({ record: crossingLog.record, createdAt: crossingLog.createdAt }).from(crossingLog);
  expect(rows).toEqual([{ record: body, createdAt: new Date(1789900000000) }]);
  expect(statement.finalizeAsync).toHaveBeenCalledTimes(1);
});

test('single-row queries preserve the positional mapping', async () => {
  const row = await db.select({ record: crossingLog.record, createdAt: crossingLog.createdAt }).from(crossingLog).get();
  expect(row.record).toBe(body);
  expect(row.createdAt).toEqual(new Date(1789900000000));
  expect(result.getAllAsync).not.toHaveBeenCalled();
});

test('writes bind the payload and ID, and return the SQLite result', async () => {
  const written = await db.update(crossingLog).set({ record: body }).where(eq(crossingLog.id, 'junction-1'));
  expect(statement.executeForRawResultAsync).toHaveBeenCalledWith([body, 'junction-1']);
  expect(written).toMatchObject({ changes: 1, lastInsertRowId: 7 });
  expect(result.getAllAsync).not.toHaveBeenCalled();
  expect(statement.finalizeAsync).toHaveBeenCalledTimes(1);
});

test('a failed database operation releases its statement and rejects', async () => {
  statement.executeForRawResultAsync.mockRejectedValue(new Error('storage unavailable'));
  await expect(db.select().from(crossingLog)).rejects.toThrow();
  expect(statement.finalizeAsync).toHaveBeenCalledTimes(1);
});
