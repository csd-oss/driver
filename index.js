/**
 * App entry. Native goes straight to expo-router.
 *
 * On web, expo-sqlite runs SQLite in a Worker and implements the sync API
 * (openDatabaseSync in src/db/index.ts) with SharedArrayBuffer + Atomics.
 * The sync call gives up after a very short spin, far less than a cold
 * worker needs to fetch and compile the wasm and set up OPFS. Warming the
 * worker with one async open first makes the sync open that follows instant.
 * The worker reuses the same database entity for the same path, so nothing
 * is opened twice.
 */
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  const SQLite = require('expo-sqlite');
  // The worker can miss its 6 s reply window on a cold start, or while the
  // previous document of the same origin is still releasing its OPFS
  // handles (a full-page navigation). Retry a few times before giving up.
  const WARM_UP_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 1500;
  const warmUp = (attempt) =>
    SQLite.openDatabaseAsync('driver.db').then(
      () => true,
      (error) => {
        if (attempt >= WARM_UP_ATTEMPTS) {
          console.warn('[web] sqlite warm-up failed', error);
          return false;
        }
        return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)).then(() => warmUp(attempt + 1));
      }
    );
  warmUp(1).then((ok) => {
    if (!ok) {
      // Storage is unavailable (private browsing, blocked site data, a
      // browser without OPFS). Loading the router would only throw at
      // openDatabaseSync and leave the wordmark on screen, so tell the user
      // instead; public/index.html renders the message.
      window.dispatchEvent(new CustomEvent('driver:db-unavailable'));
      return;
    }
    window.dispatchEvent(new CustomEvent('driver:db-ready'));
    require('expo-router/entry');
  });
} else {
  require('expo-router/entry');
}
