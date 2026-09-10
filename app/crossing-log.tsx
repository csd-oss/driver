import { IntersectionScene } from '@/components/game/IntersectionScene';
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
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

const outcomeClass: Record<string, string> = {
  clean: 'bg-emerald-100 dark:bg-emerald-900/50',
  crash: 'bg-rose-100 dark:bg-rose-900/50',
  spoiled: 'bg-amber-100 dark:bg-amber-900/50',
};
const outcomeTextClass: Record<string, string> = {
  clean: 'text-emerald-700 dark:text-emerald-200',
  crash: 'text-rose-700 dark:text-rose-200',
  spoiled: 'text-amber-700 dark:text-amber-200',
};

/**
 * Drive log: every junction you drove through in the crossing minigame,
 * newest first, with the picture, what you did and why it was right or wrong.
 */
export default function CrossingLogScreen() {
  const posthog = usePostHog();
  const [lang, setLang] = useState(getCachedLanguage);
  const [entries, setEntries] = useState<CrossingLogDB.CrossingLogEntry[] | null>(null);
  const [stats, setStats] = useState({ total: 0, crashes: 0, spoiled: 0 });

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'CrossingLog');
      getLanguage().then(async (l) => {
        setLang(l);
        const [list, s] = await Promise.all([CrossingLogDB.getRecentCrossingLog(l, 100), CrossingLogDB.getCrossingLogStats(l)]);
        setEntries(list);
        setStats(s);
      });
    }, [posthog])
  );

  const locale = localeForLang(lang);
  const dateLabel = (d: Date) => `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

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
        {entries?.map((entry, i) => {
          const info = explainRecord(entry.record, lang);
          const newRun = i === 0 || entries[i - 1].runId !== entry.runId;
          const highlight = entry.record.outcome === 'crash' && entry.record.culprit ? [entry.record.culprit, 'you'] : [];
          return (
            <View key={entry.id} className="gap-3">
              {newRun && (
                <UIText variant="caption" className="uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 mt-2">
                  {dateLabel(entry.createdAt)}
                </UIText>
              )}
              <Card className="gap-3" testID={`crossing.log.entry.${i}`}>
                <View className="flex-row gap-3">
                  <View className="rounded-xl overflow-hidden">
                    <IntersectionScene scene={entry.record.scene} size={112} showPaths highlight={highlight} />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <View className="flex-row items-center gap-2 flex-wrap">
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
                    {info.lines.map((line, k) => (
                      <UIText key={k} variant="caption" className="text-slate-700 dark:text-slate-200">
                        • {line}
                      </UIText>
                    ))}
                  </View>
                )}
              </Card>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
