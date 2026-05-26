import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

// src/db/index.ts calls openDatabaseSync at module top level; provide a stub so
// any test that imports the DB chain can load.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 0 }),
    prepareAsync: jest.fn(),
    withTransactionAsync: jest.fn(async (cb) => cb && cb()),
  })),
}));

// drizzle(database, { schema }) is called at module load; return an empty stub.
jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({})),
}));
