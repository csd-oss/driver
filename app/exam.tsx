import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as ExamResultsDB from '@/src/db/queries/examResults';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { today } from '@/src/lib/dates';
import { alertDialog } from '@/src/lib/dialog';
import { syncNotificationsWithCurrentSettings } from '@/src/lib/notifications';
import { getReadinessForecast } from '@/src/lib/readiness';
import { getCachedLanguage, getLanguage, getReadinessMode, updateSettings } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

const MIN_TO_PASS = ExamResultsDB.DEFAULT_MIN_TO_PASS;
const MAX_POINTS = ExamResultsDB.DEFAULT_MAX_POINTS;

// Records the outcome of the real exam. One row per attempt: a retake is a
// second row, never an update. The readiness score at the moment of saving is
// stored next to the result so the estimate can be calibrated later.
export default function ExamResultScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [passed, setPassed] = useState<boolean | null>(null);
  const [points, setPoints] = useState('');
  const [takenAt, setTakenAt] = useState<Date>(today());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'ExamResult');
      getLanguage().then(setLang);
    }, [posthog])
  );

  const parsedPoints = /^\d{1,3}$/.test(points) ? Number(points) : null;
  const pointsValid = parsedPoints !== null && parsedPoints >= 0 && parsedPoints <= MAX_POINTS;

  // Typing the score picks the outcome for the user; they can still override.
  const handlePointsChange = (text: string) => {
    const digits = text.replace(/[^\d]/g, '').slice(0, 3);
    setPoints(digits);
    setError(null);
    if (/^\d+$/.test(digits)) setPassed(Number(digits) >= MIN_TO_PASS);
  };

  const handleSave = async () => {
    if (!pointsValid || passed === null) {
      setError(t('exam.invalidPoints', lang));
      return;
    }
    setSaving(true);
    try {
      const useConservative = await getReadinessMode();
      const forecast = await getReadinessForecast(lang, { useConservative });
      await ExamResultsDB.addExamResult({
        lang,
        passed,
        points: parsedPoints,
        readinessScore: forecast.score,
        takenAt,
      });
      trackEvent(posthog, 'exam_result_recorded', {
        passed,
        points: parsedPoints,
        readiness_score: forecast.score,
        days_to_ready: forecast.daysToReady,
        language: lang,
      });
      if (passed) {
        // Reminders make no sense once the licence is in hand.
        await updateSettings({
          notificationMorningEnabled: false,
          notificationLunchEnabled: false,
          notificationEveningEnabled: false,
          examDate: null,
        });
        await syncNotificationsWithCurrentSettings();
      }
      // Opened by URL (PWA deep link, reload): there is nothing to go back to.
      if (router.canGoBack()) router.back();
      else router.replace('/home');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      await alertDialog(t('exam.title', lang), message || t('exam.invalidPoints', lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="screen.exam" header={<Header title={t('exam.title', lang)} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 mt-1 pb-6" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Card className="gap-4">
          <UIText variant="body" className="text-slate-600 dark:text-slate-300">
            {t('exam.didYouTakeBody', lang)}
          </UIText>

          <View className="gap-2">
            <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t('exam.points', lang)}
            </UIText>
            <TextInput
              testID="exam.points"
              value={points}
              onChangeText={handlePointsChange}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={3}
              placeholder="0"
              placeholderTextColor="#94a3b8"
              accessibilityLabel={t('exam.points', lang)}
              className="rounded-xl border border-indigo-300 dark:border-indigo-500 bg-white/70 dark:bg-white/10 px-4 py-3 text-2xl font-semibold text-slate-900 dark:text-slate-50"
            />
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
              {t('exam.pointsHint', lang)}
            </UIText>
          </View>

          <View className="gap-2">
            <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t('exam.outcome', lang)}
            </UIText>
            <View className="flex-row gap-3">
              <Button
                onPress={() => setPassed(true)}
                variant={passed === true ? 'default' : 'outline'}
                className="flex-1"
                testID="exam.passed"
              >
                {t('exam.passed', lang)}
              </Button>
              <Button
                onPress={() => setPassed(false)}
                variant={passed === false ? 'default' : 'outline'}
                className="flex-1"
                testID="exam.failed"
              >
                {t('exam.failed', lang)}
              </Button>
            </View>
          </View>

          <View className="gap-2">
            <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              {t('exam.date', lang)}
            </UIText>
            <DateField
              value={takenAt}
              onChange={(date) => date && setTakenAt(date)}
              lang={lang}
              placeholder={t('exam.date', lang)}
              maximumDate={today()}
              testID="exam.date"
            />
          </View>

          {error && (
            <UIText variant="caption" className="text-rose-600 dark:text-rose-300">
              {error}
            </UIText>
          )}

          <Button
            onPress={handleSave}
            variant="default"
            className="w-full"
            disabled={saving || !pointsValid || passed === null}
            testID="exam.save"
          >
            {t('exam.save', lang)}
          </Button>
        </Card>
      </ScrollView>
    </Screen>
  );
}
