import { IntersectionScene } from '@/components/game/IntersectionScene';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { explainRecord } from '@/src/lib/crossingLog';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

export const outcomeClass: Record<string, string> = {
  clean: 'bg-emerald-100 dark:bg-emerald-900/50',
  crash: 'bg-rose-100 dark:bg-rose-900/50',
  spoiled: 'bg-amber-100 dark:bg-amber-900/50',
};
export const outcomeTextClass: Record<string, string> = {
  clean: 'text-emerald-700 dark:text-emerald-200',
  crash: 'text-rose-700 dark:text-rose-200',
  spoiled: 'text-amber-700 dark:text-amber-200',
};

interface Props {
  record: any | null;
  lang: number;
  onClose: () => void;
}

/** One junction of the drive log, full size: the picture with every path, and why it went the way it did. */
export const RecordModal = ({ record, lang, onClose }: Props) => {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 56, 420);
  if (!record) return null;
  const info = explainRecord(record, lang);
  const highlight = record.outcome === 'crash' && record.culprit ? [record.culprit, 'you'] : [];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60 justify-center px-4" onPress={onClose} testID="crossing.record.backdrop">
        <Pressable onPress={() => {}} className="rounded-3xl bg-white dark:bg-slate-900 p-4 gap-3 max-h-[90%]" testID="crossing.record.modal">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3">
            <View className="rounded-2xl overflow-hidden self-center">
              <IntersectionScene scene={record.scene} size={size} showPaths highlight={highlight} />
            </View>
            <View className="flex-row items-center gap-2 flex-wrap">
              <View className={`rounded-full px-2.5 py-1 ${outcomeClass[info.outcome]}`}>
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
            {info.lines.map((line: string, k: number) => (
              <UIText key={k} variant="body" className="text-slate-700 dark:text-slate-200">
                • {line}
              </UIText>
            ))}
            <Button onPress={onClose} variant="outline" className="w-full" testID="crossing.record.close">
              {t('common.ok', lang)}
            </Button>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
