import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Superwall, { type SubscriptionStatus } from '@superwall/react-native-superwall';

export type Status = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

// Paywall presentation is now handled by app/paywall.tsx using react-native-iap
// directly. Superwall stays for entitlement caching: it observes StoreKit
// transactions and keeps `cachedStatus` in sync so the routing logic in
// app/index.tsx can decide /home vs /paywall instantly on cold launch.

let cachedStatus: Status = 'UNKNOWN';
let configurePromise: Promise<void> | null = null;

const getApiKey = (): string | undefined => {
  const fromExtra = (Constants.expoConfig?.extra as { superwallIosKey?: string } | undefined)
    ?.superwallIosKey;
  return fromExtra || process.env.EXPO_PUBLIC_SUPERWALL_IOS_KEY;
};

const statusFromSdk = (status: SubscriptionStatus): Status => status.status;

export const isSuperwallSupported = (): boolean => Platform.OS === 'ios' && Boolean(getApiKey());

export const configureSuperwall = async (): Promise<void> => {
  if (!isSuperwallSupported()) return;
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    const apiKey = getApiKey()!;
    await Superwall.configure({ apiKey });

    Superwall.shared.subscriptionStatusEmitter.on('change', (next: SubscriptionStatus) => {
      cachedStatus = statusFromSdk(next);
    });

    try {
      const initial = await Superwall.shared.getSubscriptionStatus();
      cachedStatus = statusFromSdk(initial);
    } catch {
      cachedStatus = 'UNKNOWN';
    }
  })();

  return configurePromise;
};

export const getSubscriptionStatus = (): Status => cachedStatus;

export const isSubscribed = (): boolean => cachedStatus === 'ACTIVE';
