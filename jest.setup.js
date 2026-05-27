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

// react-native-purchases pulls native modules at import. Stub the surface used
// by src/lib/purchases.ts so any test that transitively imports an app screen
// doesn't crash on load.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    addCustomerInfoUpdateListener: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({ current: null, all: {} }),
    purchasePackage: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: {} } } }),
    restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE', DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}));

jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: {
    presentPaywall: jest.fn().mockResolvedValue('NOT_PRESENTED'),
    presentPaywallIfNeeded: jest.fn().mockResolvedValue('NOT_PRESENTED'),
    presentCustomerCenter: jest.fn().mockResolvedValue(undefined),
  },
  PAYWALL_RESULT: {
    NOT_PRESENTED: 'NOT_PRESENTED',
    CANCELLED: 'CANCELLED',
    ERROR: 'ERROR',
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
  },
}));
