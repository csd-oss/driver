import { IntersectionScene } from '@/components/game/IntersectionScene';
import { RecordModal, outcomeClass, outcomeTextClass } from '@/components/game/RecordModal';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import * as CrossingLogDB from '@/src/db/queries/crossingLog';
import { t, tf } from '@/src/i18n/i18n';
import { trackScreenView } from '@/src/lib/analytics';
import { explainRecord } from '@/src/lib/crossingLog';
import { localeForLang } from '@/src/lib/dates';
import { getCachedLanguage, getLanguage } from '@/src/lib/settings';
import { useFocusEffect } from '@react-navigation/native';
import { usePostHog } from 'posthog-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

interface Session {
  runId: string;
  startedAt: Date;
  entries: CrossingLogDB.CrossingLogEntry[];
  crashes: number;
  mistakes: number;
  points: number;
}

/**
 * Drive log: every junction you drove through in the crossing minigame,
 * grouped by run (newest first) with the picture, what you did and why it
 * was right or wrong. Tap a junction for the full-size picture.
 */
export default function CrossingLogScreen() {
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [entries, setEntries] = useState<CrossingLogDB.CrossingLogEntry[] | null>(null);
  const [stats, setStats] = useState({ total: 0, crashes: 0, spoiled: 0 });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openRecord, setOpenRecord] = useState<any | null>(null);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'CrossingLog');
      getLanguage().then(async (l) => {
        setLang(l);
        const [list, s] = await Promise.all([CrossingLogDB.getRecentCrossingLog(l, 200), CrossingLogDB.getCrossingLogStats(l)]);
        setEntries(list);
        setStats(s);
      });
    }, [posthog])
  );

  // Rows come newest first; a run reads best in driving order, so each session's entries are reversed.
  const sessions = useMemo<Session[]>(() => {
    if (!entries) return [];
    const byRun = new Map<string, Session>();
    for (const e of entries) {
      let s = byRun.get(e.runId);
      if (!s) {
        s = { runId: e.runId, startedAt: e.createdAt, entries: [], crashes: 0, mistakes: 0, points: 0 };
        byRun.set(e.runId, s);
      }
      s.entries.push(e);
      if (e.createdAt < s.startedAt) s.startedAt = e.createdAt;
      if (e.outcome === 'crash') s.crashes += 1;
      if (e.outcome === 'spoiled') s.mistakes += 1;
      s.points += e.points;
    }
    return [...byRun.values()].map((s) => ({ ...s, entries: [...s.entries].reverse() }));
  }, [entries]);

  const locale = localeForLang(lang);
  const dateLabel = (d: Date) => `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
  const isOpen = (s: Session, i: number) => expanded[s.runId] ?? i === 0;

  return (
    <Screen testID="screen.crossingLog" header={<Header title={t('crossing.log.title', lang)} />}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 mt-1 pb-6" showsVerticalScrollIndicator={false}>
        {entries !== null && entries.length === 0 && (
          <Card testID="crossing.log.emptyState">
            <UIText variant="body" className="text-slate-600 dark:text-slate-300">
              {t('crossing.log.empty', lang)}
            </UIText>
          </Card>
        )}
        {entries !== null && entries.length > 0 && (
          <UIText variant="caption" className="text-slate-500 dark:text-slate-400" testID="crossing.log.summary">
            {tf('crossing.log.summary', lang, { n: stats.total, crashes: stats.crashes, spoiled: stats.spoiled })}
          </UIText>
        )}
        {sessions.map((session, i) => {
          const open = isOpen(session, i);
          return (
            <View key={session.runId} className="gap-3">
              <Pressable
                onPress={() => setExpanded((prev) => ({ ...prev, [session.runId]: !open }))}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/80 px-4 py-3 flex-row items-center gap-3"
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                testID={`crossing.log.session.${i}`}
              >
                <View className="flex-1 gap-0.5">
                  <UIText variant="body" className="font-semibold text-slate-900 dark:text-slate-50">
                    {t('crossing.log.session', lang)} · {dateLabel(session.startedAt)}
                  </UIText>
                  <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                    {tf('crossing.log.sessionSummary', lang, { n: session.entries.length, crashes: session.crashes, spoiled: session.mistakes, points: session.points })}
                  </UIText>
                </View>
                <UIText variant="subtitle" className="text-slate-400 dark:text-slate-500">{open ? '▾' : '▸'}</UIText>
              </Pressable>
              {open &&
                session.entries.map((entry, k) => {
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
                            <UIText variant="caption" className="text-slate-400 dark:text-slate-500">#{k + 1}</UIText>
                            <View className={`rounded-full px-2 py-0.5 ${outcomeClass[info.outcome]}`}>
                              <UIText variant="caption" className={`font-semibold ${outcomeTextClass[info.outcome]}`}>
                                {info.outcomeLabel}
                              </UIText>
                            </View>
                            {info.points > 0 && (
                              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                                +{info.points}
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
