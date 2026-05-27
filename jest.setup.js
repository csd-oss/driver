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

// react-native-iap also pulls native modules at import. Stub the bits used by
// src/lib/iap.ts and the paywall screen so test files that transitively import
// them don't crash on load.
jest.mock('react-native-iap', () => ({
  __esModule: true,
  initConnection: jest.fn().mockResolvedValue(undefined),
  endConnection: jest.fn().mockResolvedValue(undefined),
  fetchProducts: jest.fn().mockResolvedValue([]),
  requestPurchase: jest.fn().mockResolvedValue(undefined),
  restorePurchases: jest.fn().mockResolvedValue(undefined),
  getAvailablePurchases: jest.fn().mockResolvedValue([]),
  finishTransaction: jest.fn().mockResolvedValue(undefined),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Superwall RN SDK reaches into native modules at import time. Stub the entire
// surface used by src/lib/superwall.ts so DB-adjacent tests can transitively
// load app screens without crashing.
jest.mock('@superwall/react-native-superwall', () => {
  const subscriptionStatusEmitter = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
  const sharedInstance = {
    subscriptionStatusEmitter,
    register: jest.fn().mockResolvedValue(undefined),
    getSubscriptionStatus: jest.fn().mockResolvedValue({ status: 'UNKNOWN' }),
  };
  return {
    __esModule: true,
    default: {
      configure: jest.fn().mockResolvedValue(sharedInstance),
      shared: sharedInstance,
    },
  };
});
