import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

// Lookup key of the entitlement that gates the app. Matches the
// "Driver SK Pro" entitlement configured in the RevenueCat dashboard
// (Project Settings → Entitlements), which is attached to all three
// product tiers (yearly / weekly / lifetime).
export const PRO_ENTITLEMENT = 'Driver SK Pro';

let cachedActive = false;
let configurePromise: Promise<void> | null = null;

// App Store SDK key — shipped in production binaries, used against the real
// App Store. The "test_" Test Store key auto-crashes via RC's
// checkForSimulatedStoreAPIKeyInRelease assertion if it ever runs in a Release
// build, so it's only used in Debug.
const APPL_KEY = 'appl_svNneUZQGGxDtuPbXLcOAriHqEh';
const TEST_KEY = 'test_sTWtiZkHRlSHrBAZEPpqgnuufJh';

const getApiKey = (): string | undefined => {
  const fromExtra = (Constants.expoConfig?.extra as { revenueCatIosKey?: string } | undefined)
    ?.revenueCatIosKey;
  if (fromExtra) return fromExtra;
  if (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY) return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  // Default per build type: __DEV__ is set by Metro at bundle time and is true
  // for Debug builds, false for Release. Reliable across both expo run:ios and
  // xcodebuild archive.
  return __DEV__ ? TEST_KEY : APPL_KEY;
};

const updateFromCustomerInfo = (info: CustomerInfo) => {
  cachedActive = Boolean(info.entitlements.active[PRO_ENTITLEMENT]);
};

/**
 * True when the build was created with EXPO_PUBLIC_BYPASS_PAYWALL=true.
 * Used by the E2E suite (Maestro) so it can navigate through gated
 * features without a sandbox purchase. Never set in production.
 */
export const isPaywallBypassed = (): boolean =>
  Boolean((Constants.expoConfig?.extra as { bypassPaywall?: boolean } | undefined)?.bypassPaywall);

export const isPurchasesSupported = (): boolean =>
  Platform.OS === 'ios' && Boolean(getApiKey()) && !isPaywallBypassed();

export const configurePurchases = async (): Promise<void> => {
  if (!isPurchasesSupported()) return;
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    const apiKey = getApiKey()!;
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    Purchases.addCustomerInfoUpdateListener(updateFromCustomerInfo);
    try {
      const info = await Purchases.getCustomerInfo();
      updateFromCustomerInfo(info);
    } catch {
      cachedActive = false;
    }
  })();

  return configurePromise;
};

export const isSubscribed = (): boolean => isPaywallBypassed() || cachedActive;

/**
 * Re-fetch entitlement state from RevenueCat (and Apple via StoreKit).
 * Useful right after returning from a paywall so the routing layer has
 * the latest state before navigating.
 */
export const refreshEntitlement = async (): Promise<boolean> => {
  if (!isPurchasesSupported()) return cachedActive;
  try {
    const info = await Purchases.getCustomerInfo();
    updateFromCustomerInfo(info);
  } catch {
    /* keep previous cached value */
  }
  return cachedActive;
};

/**
 * Present RevenueCat's hosted paywall, but only if the user doesn't already
 * hold the `pro` entitlement. Skippable: the user can dismiss without paying.
 * The caller decides what to do with the result — onboarding lets them
 * through regardless; gated features only let them through on success.
 *
 * Note: `displayCloseButton` is only honoured by the legacy V1 paywall
 * template. For V2 paywalls the close button must be designed into the
 * paywall in the RC dashboard. We still pass `true` for V1 compatibility.
 */
export const presentPaywall = async (): Promise<PAYWALL_RESULT> => {
  if (!isPurchasesSupported()) return PAYWALL_RESULT.NOT_PRESENTED;
  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    displayCloseButton: true,
  });
};

/**
 * Convenience for feature-gated buttons: returns true if the user can access
 * the feature (already entitled OR just purchased/restored on the presented
 * paywall). Returns false on cancel/error so the caller can stay put.
 */
export const ensureProAccess = async (): Promise<boolean> => {
  if (isPaywallBypassed()) return true;
  if (!isPurchasesSupported()) return true; // non-iOS: no gating
  if (isSubscribed()) return true;

  // Present the paywall. We intentionally ignore the returned PAYWALL_RESULT —
  // sandbox / Apple's bottom sheet has too many edge cases where the result
  // code lies (e.g. dismissing the Apple sheet after a half-completed purchase
  // can return PURCHASED or NOT_PRESENTED). The only source of truth is the
  // entitlement state after RC re-queries the server, which we do via
  // refreshEntitlement below.
  await presentPaywall();
  return await refreshEntitlement();
};

/**
 * Present RevenueCat's Customer Center — the standard UI for subscription
 * management (cancel, change plan, refund request, restore).
 * Replaces the deep-link to App Store account settings.
 */
export const presentCustomerCenter = async (): Promise<void> => {
  if (!isPurchasesSupported()) return;
  await RevenueCatUI.presentCustomerCenter();
};

export { PAYWALL_RESULT };
