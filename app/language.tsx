import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { syncNotificationsWithCurrentSettings } from '@/src/lib/notifications';
import { clearCache, getCachedLanguage, getLanguage, updateSettings } from '@/src/lib/settings';
import { isPurchasesSupported, isSubscribed } from '@/src/lib/purchases';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { usePostHog } from 'posthog-react-native';

export default function LanguageSelectScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const params = useLocalSearchParams();
  const fromOnboarding = params?.from === 'onboarding';
  const [currentLang, setCurrentLang] = useState(getCachedLanguage);

  const loadLanguage = useCallback(async () => {
    const lang = await getLanguage();
    setCurrentLang(lang);
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Language Selection');
      loadLanguage();
    }, [loadLanguage, posthog])
  );

  // Tapping a flag selects it (highlight + localize the UI instantly) but does
  // not commit — the user confirms with the Continue button, matching the
  // Next/Continue pattern used on every onboarding slide.
  const handleLanguagePick = (lang: number) => {
    setCurrentLang(lang);
    trackEvent(posthog, 'language_picked', {
      picked_language: lang,
      from_onboarding: fromOnboarding,
    });
  };

  const handleContinue = async () => {
    const lang = currentLang;
    trackEvent(posthog, 'language_selected', {
      selected_language: lang,
      from_onboarding: fromOnboarding,
    });

    clearCache();
    await updateSettings({
      lang,
      hasChosenLanguage: true,
      // Only set hasOnboarded if not coming from onboarding (i.e., selecting after onboarding completion)
      ...(fromOnboarding ? {} : { hasOnboarded: true }),
    });
    await syncNotificationsWithCurrentSettings();
    // If coming from onboarding (via change language link), go back to onboarding.
    // Otherwise, this is the normal flow after onboarding completion — go to home,
    // or to the paywall first on iOS when not yet subscribed.
    if (fromOnboarding) {
      router.replace('/onboarding');
    } else {
      const needsPaywall = isPurchasesSupported() && !isSubscribed();
      router.replace(needsPaywall ? '/paywall' : '/home');
    }
  };

  const handleBack = () => {
    if (fromOnboarding) {
      router.back();
    } else {
      // If came from onboarding completion/skip, go back to onboarding
      router.replace('/onboarding');
    }
  };

  return (
    <Screen
      testID="screen.language"
      header={<Header title={t('language.selectTitle', currentLang)} showBack onBackPress={handleBack} />}
    >
      <View className="flex-1 w-full items-center justify-center">
        <View className="w-full max-w-md gap-5 px-5">
          <Card className="gap-5">
            {/* Language description */}
            <UIText variant="body" className="text-slate-600 dark:text-slate-300 text-center">
              {t('language.description', currentLang)}
            </UIText>
            
            {/* Highlighted note about questions */}
            <View className="flex-row items-center justify-center gap-2 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-300/40 dark:border-amber-600/40 rounded-xl px-4 py-3">
              <UIText variant="body" style={{ fontSize: 18 }}>📝</UIText>
              <UIText variant="caption" className="text-amber-700 dark:text-amber-300 font-medium">
                {t('language.questionsNote', currentLang)}
              </UIText>
            </View>

            {/* Language buttons */}
            <View className="gap-3">
              <Button
                onPress={() => handleLanguagePick(1)}
                variant={currentLang === 1 ? 'default' : 'outline'}
                className="w-full"
                testID="language.lang1"
              >
                🇸🇰 {t('language.lang1', 1)} / {t('language.lang1', 2)} / {t('language.lang1', 3)}
              </Button>

              <Button
                onPress={() => handleLanguagePick(2)}
                variant={currentLang === 2 ? 'default' : 'outline'}
                className="w-full"
                testID="language.lang2"
              >
                🇬🇧 {t('language.lang2', 1)} / {t('language.lang2', 2)} / {t('language.lang2', 3)}
              </Button>

              <Button
                onPress={() => handleLanguagePick(3)}
                variant={currentLang === 3 ? 'default' : 'outline'}
                className="w-full"
                testID="language.lang3"
              >
                🇭🇺 {t('language.lang3', 1)} / {t('language.lang3', 2)} / {t('language.lang3', 3)}
              </Button>
            </View>
          </Card>

          {/* Continue — confirms the selection, matching the onboarding pattern */}
          <Button
            onPress={handleContinue}
            variant="default"
            className="w-full"
            testID="language.continue"
          >
            {t('onboarding.next', currentLang)}
          </Button>
        </View>
      </View>
    </Screen>
  );
}
