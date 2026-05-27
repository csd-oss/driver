import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePostHog } from 'posthog-react-native';

import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { getLanguage } from '@/src/lib/settings';
import { presentOnboardingPaywall } from '@/src/lib/superwall';
import { trackScreenView } from '@/src/lib/analytics';

export default function PaywallScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(1);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Paywall');
    }, [posthog])
  );

  useEffect(() => {
    getLanguage().then(setLang);
  }, []);

  useEffect(() => {
    presentOnboardingPaywall({
      onUnlock: () => router.replace('/home'),
    });
  }, [router]);

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
