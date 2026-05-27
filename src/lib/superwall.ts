import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Superwall, { type SubscriptionStatus } from '@superwall/react-native-superwall';

export type Status = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

const PLACEMENT_ONBOARDING = 'onboarding_complete';

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

export const presentOnboardingPaywall = (opts: { onUnlock: () => void }): void => {
  if (!isSuperwallSupported()) {
    opts.onUnlock();
    return;
  }
  // Client-side hard gate: even if the dashboard paywall is non_gated and the
  // feature callback fires on dismiss, we only unlock when the subscription
  // status is actually ACTIVE. Otherwise we re-present the paywall, making
  // it impossible to skip past /paywall without purchasing or restoring.
  const safeUnlock = () => {
    if (cachedStatus === 'ACTIVE') {
      opts.onUnlock();
    } else {
      setTimeout(() => presentOnboardingPaywall(opts), 250);
    }
  };
  Superwall.shared.register({
    placement: PLACEMENT_ONBOARDING,
    feature: safeUnlock,
  });
};

export const triggerRestoreOrPurchase = (onUnlock: () => void): void => {
  if (!isSuperwallSupported()) {
    onUnlock();
    return;
  }
  Superwall.shared.register({
    placement: PLACEMENT_ONBOARDING,
    feature: onUnlock,
  });
};
