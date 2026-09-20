import { View } from 'react-native';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';

export function InstructorIdentity({ lang }: { lang: number }) {
  return <View className="flex-row items-center gap-3">
    <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950"><UIText className="font-semibold text-indigo-700 dark:text-indigo-200">A</UIText></View>
    <View><UIText variant="subtitle">Alex</UIText><UIText variant="caption" className="text-slate-500 dark:text-slate-400">{t('practice.instructorRole', lang)}</UIText></View>
  </View>;
}
