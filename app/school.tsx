import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { t, tf } from '@/src/i18n/i18n';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { formatDate } from '@/src/lib/dates';
import { confirmDialog } from '@/src/lib/dialog';
import {
  getSchoolLink,
  isPlausibleJoinCode,
  joinSchool,
  leaveSchool,
  normalizeJoinCode,
  SchoolApiError,
  syncWithSchool,
  type SchoolLink,
} from '@/src/lib/school';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { SCHOOLS_ENABLED } from '@/src/lib/flags';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, TextInput, View, useColorScheme } from 'react-native';

/**
 * "Autoškola": link the app to a driving school with the code the school gives out, see what
 * is shared, sync by hand, or leave. Reached from Settings when SCHOOLS_ENABLED.
 */
export default function SchoolScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const dark = useColorScheme() === 'dark';
  const [lang, setLang] = useState(getCachedLanguage);
  const [link, setLink] = useState<SchoolLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The route exists in every build; without the flag it only shows the way back.
  useFocusEffect(
    useCallback(() => {
      if (!SCHOOLS_ENABLED) router.replace('/settings');
    }, [router])
  );

  const load = useCallback(async () => {
    setLang(await getLanguage());
    setLink(await getSchoolLink().catch(() => null));
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'School');
      load();
    }, [load, posthog])
  );

  const errorText = (err: unknown): string => {
    if (err instanceof SchoolApiError) {
      if (err.code === 'bad_code') return t('school.errorBadCode', lang);
      if (err.code === 'name_required') return t('school.errorNameRequired', lang);
      if (err.status === 0) return t('school.errorOffline', lang);
    }
    return t('school.errorGeneric', lang);
  };

  const handleJoin = async () => {
    setError(null);
    setNotice(null);
    if (!isPlausibleJoinCode(code)) {
      setError(t('school.errorBadCode', lang));
      return;
    }
    if (needsName && (!firstName.trim() || !lastName.trim())) {
      setError(t('school.errorNameRequired', lang));
      return;
    }
    setBusy(true);
    try {
      const result = await joinSchool(code, needsName ? { firstName: firstName.trim(), lastName: lastName.trim() } : undefined);
      trackEvent(posthog, 'school_joined', { language: lang, has_group: Boolean(result.groupName) });
      setCode('');
      setNeedsName(false);
      await load();
      // First sync right away, so the school sees the history as soon as the link exists.
      const outcome = await syncWithSchool({ force: true });
      if (outcome.status === 'synced') setNotice(t('school.syncedNow', lang));
      await load();
    } catch (err) {
      if (err instanceof SchoolApiError && err.code === 'name_required') setNeedsName(true);
      setError(errorText(err));
      trackEvent(posthog, 'school_join_failed', { language: lang, code: err instanceof SchoolApiError ? err.code : 'unknown' });
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const outcome = await syncWithSchool({ force: true });
    setBusy(false);
    trackEvent(posthog, 'school_sync', { language: lang, outcome: outcome.status, attempts: outcome.attempts ?? 0 });
    if (outcome.status === 'synced') setNotice(t('school.syncedNow', lang));
    else if (outcome.status === 'offline') setError(t('school.errorOffline', lang));
    else if (outcome.status === 'unauthorized') setError(t('school.errorRevoked', lang));
    else if (outcome.status !== 'skipped') setError(t('school.errorGeneric', lang));
    await load();
  };

  const handleLeave = async () => {
    const confirmed = await confirmDialog({
      title: t('school.leave', lang),
      message: t('school.leaveConfirm', lang),
      confirmText: t('school.leave', lang),
      cancelText: t('common.cancel', lang),
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    await leaveSchool();
    trackEvent(posthog, 'school_left', { language: lang });
    setBusy(false);
    await load();
  };

  const inputClass =
    'rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-50';
  const placeholderColor = dark ? '#64748b' : '#94a3b8';

  return (
    <Screen testID="screen.school" header={<Header title={t('school.title', lang)} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-6 mt-1" keyboardShouldPersistTaps="handled">
        {!loaded ? null : link ? (
          <>
            <Card className="gap-2">
              <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {t('school.linkedTitle', lang)}
              </UIText>
              <UIText variant="subtitle">{link.schoolName}</UIText>
              {link.groupName && (
                <UIText variant="body" className="text-slate-600 dark:text-slate-300">
                  {tf('school.group', lang, { group: link.groupName })}
                </UIText>
              )}
              <UIText variant="body" className="text-slate-600 dark:text-slate-300">
                {tf('school.asStudent', lang, { name: link.studentName })}
              </UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400 mt-1">
                {link.lastSyncAt
                  ? tf('school.lastSync', lang, { date: formatDate(link.lastSyncAt, lang) })
                  : t('school.neverSynced', lang)}
              </UIText>
              {notice && (
                <UIText variant="caption" className="text-emerald-700 dark:text-emerald-300">
                  {notice}
                </UIText>
              )}
              {error && (
                <UIText variant="caption" className="text-rose-700 dark:text-rose-300">
                  {error}
                </UIText>
              )}
              <Button onPress={handleSync} disabled={busy} className="w-full mt-2" testID="school.syncNow">
                {t('school.syncNow', lang)}
              </Button>
            </Card>

            <Card className="gap-2">
              <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
                {t('school.sharedTitle', lang)}
              </UIText>
              <UIText variant="body" className="text-slate-600 dark:text-slate-300">
                {t('school.sharedBody', lang)}
              </UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('school.notSharedBody', lang)}
              </UIText>
            </Card>

            <Button onPress={handleLeave} disabled={busy} variant="secondary" className="w-full" testID="school.leave">
              {t('school.leave', lang)}
            </Button>
          </>
        ) : (
          <>
            <Card className="gap-3">
              <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
                {t('school.join', lang)}
              </UIText>
              <UIText variant="body" className="text-slate-600 dark:text-slate-300">
                {t('school.joinBody', lang)}
              </UIText>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(normalizeJoinCode(v).slice(0, 8))}
                placeholder={t('school.codePlaceholder', lang)}
                placeholderTextColor={placeholderColor}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={9}
                className={`${inputClass} text-center font-semibold tracking-[0.3em]`}
                accessibilityLabel={t('school.codeLabel', lang)}
                testID="school.code"
              />
              {needsName && (
                <View className="gap-2">
                  <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                    {t('school.nameHint', lang)}
                  </UIText>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder={t('school.firstName', lang)}
                    placeholderTextColor={placeholderColor}
                    autoComplete="given-name"
                    className={inputClass}
                    testID="school.firstName"
                  />
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder={t('school.lastName', lang)}
                    placeholderTextColor={placeholderColor}
                    autoComplete="family-name"
                    className={inputClass}
                    testID="school.lastName"
                  />
                </View>
              )}
              {error && (
                <UIText variant="caption" className="text-rose-700 dark:text-rose-300">
                  {error}
                </UIText>
              )}
              <Button onPress={handleJoin} disabled={busy || code.length < 8} className="w-full" testID="school.joinButton">
                {t('school.joinButton', lang)}
              </Button>
            </Card>

            <Card className="gap-2">
              <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
                {t('school.sharedTitle', lang)}
              </UIText>
              <UIText variant="body" className="text-slate-600 dark:text-slate-300">
                {t('school.sharedBody', lang)}
              </UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('school.consentNote', lang)}
              </UIText>
            </Card>
          </>
        )}
        <Button onPress={() => router.back()} variant="outline" className="w-full" testID="nav.done">
          {t('common.done', lang)}
        </Button>
      </ScrollView>
    </Screen>
  );
}
