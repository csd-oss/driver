import { IntersectionScene } from '@/components/game/IntersectionScene';
import { RecordModal, outcomeClass, outcomeTextClass } from '@/components/game/RecordModal';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as CrossingLogDB from '@/src/db/queries/crossingLog';
import { t, tf } from '@/src/i18n/i18n';
import { trackScreenView } from '@/src/lib/analytics';
import { explainRecord } from '@/src/lib/crossingLog';
import { groupDrives } from '@/src/lib/driveSession';
import { InstructorIdentity } from '@/components/game/InstructorIdentity';
import { localeForLang } from '@/src/lib/dates';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

type Session = ReturnType<typeof groupDrives>[number];

/**
 * Drive log: completed junctions and recorded faults from each drive,
 * grouped by run (newest first) with the picture, what you did and why it
 * was right or wrong. Tap a junction for the full-size picture.
 */
export default function CrossingLogScreen() {
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [entries, setEntries] = useState<CrossingLogDB.CrossingLogEntry[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openRecord, setOpenRecord] = useState<any | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoadFailed(false);
      trackScreenView(posthog, 'CrossingLog');
      getLanguage().then(async (l) => {
        const list = await CrossingLogDB.getRecentCrossingLog(l, CrossingLogDB.LOG_KEEP);
        if (active) { setLang(l); setEntries(list); }
      }).catch(error => {
        console.warn('Drive log read failed:', error?.cause?.message || error?.message);
        if (active) setLoadFailed(true);
      });
      return () => { active = false; };
    }, [posthog, reload])
  );

  const sessions = useMemo<Session[]>(() => groupDrives(entries || []), [entries]);
  const totals = sessions.reduce((sum, session) => ({ total: sum.total + session.total, clean: sum.clean + session.clean, faults: sum.faults + session.faults }), { total: 0, clean: 0, faults: 0 });

  const locale = localeForLang(lang);
  const dateLabel = (d: Date) => `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  const isOpen = (s: Session, i: number) => expanded[s.runId] ?? i === 0;

  return (
    <Screen testID="screen.crossingLog" header={<Header title={t('crossing.log.title', lang)} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 mt-1 pb-6" showsVerticalScrollIndicator={false}>
        <InstructorIdentity lang={lang} />
        {loadFailed && <View className="gap-3"><UIText>{t('practice.logLoadError', lang)}</UIText><Button variant="outline" onPress={() => setReload(value => value + 1)}>{t('practice.retry', lang)}</Button></View>}
        {entries === null && !loadFailed && <UIText>{t('common.loading', lang)}</UIText>}
        {entries !== null && entries.length === 0 && (
          <Card testID="crossing.log.emptyState">
            <UIText variant="body" className="text-slate-600 dark:text-slate-300">
              {t('crossing.log.empty', lang)}
            </UIText>
          </Card>
        )}
        {entries !== null && entries.length > 0 && (
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400" testID="crossing.log.summary">
            {tf('practice.reviewSummary', lang, { n: totals.total, clean: totals.clean, faults: totals.faults })}
          </UIText>
        )}
        {sessions.map((session, i) => {
          const open = isOpen(session, i);
          return (
            <View key={session.runId} className="gap-3">
              <Pressable
                onPress={() => setExpanded((prev) => ({ ...prev, [session.runId]: !open }))}
                className="border-t border-slate-200 dark:border-slate-800 py-4 flex-row items-center gap-3"
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                testID={`crossing.log.session.${i}`}
              >
                <View className="flex-1 gap-0.5">
                  <UIText variant="body" className="font-semibold text-slate-900 dark:text-slate-50">
                    {t('crossing.log.session', lang)} · {dateLabel(session.startedAt)}
                  </UIText>
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    {tf('practice.reviewSummary', lang, { n: session.total, clean: session.clean, faults: session.faults })}
                  </UIText>
                </View>
                <UIText variant="subtitle" className="text-slate-400 dark:text-slate-500">{open ? '▾' : '▸'}</UIText>
              </Pressable>
              {open &&
                session.entries.map((entry: CrossingLogDB.CrossingLogEntry, k: number) => {
                  const info = explainRecord(entry.record, lang);
                  const highlight = entry.record.outcome === 'crash' && entry.record.culprit ? [entry.record.culprit, 'you'] : [];
                  return (
                    <Card key={entry.id} className="gap-3" onPress={() => setOpenRecord(entry.record)} testID={`crossing.log.entry.${i}.${k}`}>
                      <View className="flex-row gap-3">
                        <View className="rounded-xl overflow-hidden">
                          <IntersectionScene scene={entry.record.scene} size={132} showPaths highlight={highlight} />
                        </View>
                        <View className="flex-1 gap-1.5">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <UIText variant="caption" className="text-slate-400 dark:text-slate-500">#{entry.record.index + 1} · {t(info.guided ? 'practice.guide' : 'practice.title', lang)}</UIText>
                            <View className={`rounded-full px-2 py-0.5 ${outcomeClass[info.outcome]}`}>
                              <UIText variant="caption" className={`font-semibold ${outcomeTextClass[info.outcome]}`}>
                                {info.outcomeLabel}
                              </UIText>
                            </View>
                            {info.lifeLost && (
                              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                                {t('practice.lifeLost', lang)}
                              </UIText>
                            )}
                          </View>
                          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                            {t('crossing.log.instruction', lang)}: {info.instruction}
                          </UIText>
                          <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                            {t('crossing.log.you', lang)}: {info.yourMove}
                          </UIText>
                          <UIText variant="body" className="font-semibold text-slate-800 dark:text-slate-100">
                            {info.headline}
                          </UIText>
                        </View>
                      </View>
                      {info.lines.length > 0 && (
                        <View className="gap-1 border-t border-slate-200/70 dark:border-slate-800/70 pt-2">
                          {info.lines.map((line, m) => (
                            <UIText key={m} variant="caption" className="text-slate-700 dark:text-slate-200">
                              • {line}
                            </UIText>
                          ))}
                        </View>
                      )}
                      <UIText variant="caption" className="text-indigo-600 dark:text-indigo-300">
                        {t('crossing.log.tapToOpen', lang)}
                      </UIText>
                    </Card>
                  );
                })}
            </View>
          );
        })}
      </ScrollView>
      {openRecord && <RecordModal record={openRecord} lang={lang} onClose={() => setOpenRecord(null)} />}
    </Screen>
  );
}
