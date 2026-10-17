import Constants from 'expo-constants';

/**
 * Build-time feature flags (app.config.js `extra`, from EXPO_PUBLIC_* variables).
 *
 * `schoolsEnabled` turns on "Autoškola" in Settings: joining a driving school with a code and
 * syncing practice progress to it (src/lib/school.ts). Off by default, so the released app is
 * unchanged: fully offline, no account, nothing leaves the device.
 */
interface Extra {
  schoolsEnabled?: boolean;
  schoolsApiUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const SCHOOLS_ENABLED = extra.schoolsEnabled === true;

/** Base URL of the schools server (no trailing slash). */
export const SCHOOLS_API_URL = (extra.schoolsApiUrl || 'http://localhost:8090').replace(/\/+$/, '');
