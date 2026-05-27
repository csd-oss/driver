import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePostHog } from 'posthog-react-native';

import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { getLanguage } from '@/src/lib/settings';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import {
  PAYWALL_RESULT,
  isPurchasesSupported,
  presentPaywall,
} from '@/src/lib/purchases';

export default function PaywallScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(1);
  const presentedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Paywall');
    }, [posthog])
  );

  useEffect(() => {
    getLanguage().then(setLang);
  }, []);

  useEffect(() => {
    if (presentedRef.current) return;
    presentedRef.current = true;

    if (!isPurchasesSupported()) {
      router.replace('/home');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await presentPaywall();
        if (cancelled) return;
        const outcome =
          result === PAYWALL_RESULT.PURCHASED
            ? 'purchased'
            : result === PAYWALL_RESULT.RESTORED
              ? 'restored'
              : result === PAYWALL_RESULT.NOT_PRESENTED
                ? 'not_presented'
                : 'skipped';
        trackEvent(posthog, 'onboarding_paywall_closed', { outcome });
      } catch {
        // Swallow — we route to /home either way so the user is never trapped.
      } finally {
        if (!cancelled) router.replace('/home');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, posthog]);

  return (
    <Screen
      testID="screen.paywall"
      className="items-center justify-center"
      style={{ backgroundColor: '#0f172a' }}
    >
      <View className="flex-1 items-center justify-center gap-4">
        <ActivityIndicator size="large" color="#818CF8" />
        <UIText variant="body" className="text-slate-300">
          {t('paywall.loading', lang)}
        </UIText>
      </View>
    </Screen>
  );
}
