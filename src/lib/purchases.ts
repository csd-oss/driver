import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

// Identifier of the entitlement that gates the app. Configured in the
// RevenueCat dashboard as "Driver SK Pro" (display name) → 'pro' (identifier),
// attached to the yearly / weekly / lifetime products you set up under
// Project Settings → Entitlements.
export const PRO_ENTITLEMENT = 'pro';

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

export const isPurchasesSupported = (): boolean =>
  Platform.OS === 'ios' && Boolean(getApiKey());

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

export const isSubscribed = (): boolean => cachedActive;

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
 * hold the `pro` entitlement. With `displayCloseButton: false` and our gate
 * screen looping on non-success, this enforces a hard paywall after onboarding.
 */
export const presentOnboardingPaywall = async (): Promise<PAYWALL_RESULT> => {
  if (!isPurchasesSupported()) return PAYWALL_RESULT.NOT_PRESENTED;
  return RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PRO_ENTITLEMENT,
    displayCloseButton: false,
  });
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
