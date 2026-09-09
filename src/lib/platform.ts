import { Platform } from 'react-native';

/**
 * Web / PWA helpers. Everything here is safe to call on native: it returns
 * the "not a browser" answer instead of touching window.
 *
 * The `beforeinstallprompt` event fires early, often before React mounts, so
 * `public/index.html` captures it into `window.__driverInstallPrompt` and
 * `captureInstallPrompt()` only wires the listener again as a fallback.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __driverInstallPrompt?: InstallPromptEvent | null;
  }
}

export const isWeb = Platform.OS === 'web';

const hasWindow = (): boolean => isWeb && typeof window !== 'undefined';

/** True when the page runs as an installed PWA (home-screen icon). */
export const isStandalonePWA = (): boolean => {
  if (!hasWindow()) return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    // iOS Safari exposes navigator.standalone instead of display-mode.
    return Boolean((window.navigator as { standalone?: boolean }).standalone);
  } catch {
    return false;
  }
};

/** iOS Safari never fires beforeinstallprompt; users must add to Home Screen by hand. */
export const isIosSafari = (): boolean => {
  if (!hasWindow()) return false;
  const ua = window.navigator.userAgent || '';
  const isIosDevice =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac with touch support.
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIosDevice && isSafari;
};

let listenerAttached = false;

/** Start listening for the install prompt. Idempotent, no-op on native. */
export const captureInstallPrompt = (): void => {
  if (!hasWindow() || listenerAttached) return;
  listenerAttached = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__driverInstallPrompt = event as InstallPromptEvent;
  });
};

/** True when the browser handed us a deferred install prompt (Chrome, Edge, Android). */
export const canPromptInstall = (): boolean =>
  hasWindow() && Boolean(window.__driverInstallPrompt);

/** Show the browser install dialog. Resolves true when the user accepted. */
export const promptInstall = async (): Promise<boolean> => {
  if (!hasWindow()) return false;
  const deferred = window.__driverInstallPrompt;
  if (!deferred) return false;
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      window.__driverInstallPrompt = null;
      return true;
    }
    return false;
  } catch {
    return false;
  }
};
