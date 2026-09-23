import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { InstructorIdentity } from '@/components/game/InstructorIdentity';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { getCachedLanguage, getGuideFinished, getLanguage } from '@/src/lib/settings';
import { t } from '@/src/i18n/i18n';
import { trackScreenView } from '@/src/lib/analytics';

export default function DrivingPracticeHub() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [guideDone, setGuideDone] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([getLanguage(), getGuideFinished()]).then(([language, finished]) => {
      if (!active) return;
      setLang(language); setGuideDone(finished);
      trackScreenView(posthog, 'GameHub', { language, guide_finished: finished });
    }).catch(() => { if (active) setGuideDone(false); });
    return () => { active = false; };
  }, [posthog]));
  return <Screen testID="screen.game" header={<Header title={t('practice.title', lang)} />}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32, gap: 28 }}>
      <InstructorIdentity lang={lang} />
      <View style={{ gap: 12 }}>
        <UIText variant="title">{t(guideDone ? 'practice.readyTitle' : 'practice.firstTitle', lang)}</UIText>
        <UIText className="text-slate-600 dark:text-slate-300">{t(guideDone ? 'practice.readyBody' : 'practice.firstBody', lang)}</UIText>
        <UIText className="text-slate-600 dark:text-slate-300">{t('practice.routePromise', lang)}</UIText>
      </View>
      <View style={{ gap: 12 }}>
        <Button disabled={guideDone === null} onPress={() => router.push('/crossing')} testID="game.playCrossing">{t(guideDone ? 'practice.start' : 'practice.firstStart', lang)}</Button>
        {guideDone && <Button onPress={() => router.push('/crossing-guide')} variant="outline" testID="game.replayGuide">{t('practice.withGuide', lang)}</Button>}
        <UIText variant="caption" className="text-slate-500 dark:text-slate-400">{t('practice.rules', lang)}</UIText>
      </View>
      <Pressable onPress={() => router.push('/crossing-log')} accessibilityRole="button" className="border-t border-slate-200 dark:border-slate-800 pt-6 flex-row items-center gap-3" testID="game.crossingLog">
        <View className="flex-1 gap-1"><UIText variant="subtitle">{t('crossing.log.title', lang)}</UIText><UIText className="text-slate-500 dark:text-slate-400">{t('practice.logBody', lang)}</UIText></View><UIText>→</UIText>
      </Pressable>
    </ScrollView>
  </Screen>;
}
