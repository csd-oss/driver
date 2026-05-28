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

const getApiKey = (): string | undefined => {
  const fromExtra = (Constants.expoConfig?.extra as { revenueCatIosKey?: string } | undefined)
    ?.revenueCatIosKey;
  return fromExtra || process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
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
  if (isSubscribed()) return true;
  if (!isPurchasesSupported()) return true; // non-iOS: no gating
  const result = await presentPaywall();
  if (
    result === PAYWALL_RESULT.PURCHASED ||
    result === PAYWALL_RESULT.RESTORED ||
    result === PAYWALL_RESULT.NOT_PRESENTED
  ) {
    return true;
  }
  return false;
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
