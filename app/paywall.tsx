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
  presentOnboardingPaywall,
  refreshEntitlement,
} from '@/src/lib/purchases';

export default function PaywallScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(1);
  const presentingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Paywall');
    }, [posthog])
  );

  useEffect(() => {
    getLanguage().then(setLang);
  }, []);

  useEffect(() => {
    if (!isPurchasesSupported()) {
      router.replace('/home');
      return;
    }

    let cancelled = false;

    const grant = (source: 'purchased' | 'restored' | 'not_presented') => {
      trackEvent(posthog, 'paywall_unlocked', { source });
      router.replace('/home');
    };

    const present = async () => {
      if (presentingRef.current) return;
      presentingRef.current = true;
      try {
        const result = await presentOnboardingPaywall();
        if (cancelled) return;
        switch (result) {
          case PAYWALL_RESULT.PURCHASED:
            grant('purchased');
            return;
          case PAYWALL_RESULT.RESTORED:
            grant('restored');
            return;
          case PAYWALL_RESULT.NOT_PRESENTED:
            // User already holds the entitlement.
            grant('not_presented');
            return;
          case PAYWALL_RESULT.CANCELLED:
          case PAYWALL_RESULT.ERROR:
          default: {
            // Hard gate: re-check entitlement (in case the SDK already knows),
            // then re-present. With displayCloseButton=false this should
            // rarely trigger but the loop keeps the screen impossible to skip.
            const active = await refreshEntitlement();
            if (cancelled) return;
            if (active) {
              grant('not_presented');
              return;
            }
            presentingRef.current = false;
            setTimeout(present, 250);
          }
        }
      } catch {
        presentingRef.current = false;
        if (!cancelled) setTimeout(present, 500);
      }
    };

    present();

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
