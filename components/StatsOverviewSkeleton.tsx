import { View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const StatsOverviewSkeleton = () => {
  return (
    <Card className="gap-4 overflow-hidden bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-emerald-500/10 border-indigo-200/60 dark:border-indigo-700/40">
      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </View>

        <View className="flex-row items-end justify-between">
          <View className="gap-1">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </View>
          <View className="items-end gap-1">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-6 w-14 rounded-md" />
          </View>
        </View>

        <View className="mt-1 gap-2">
          <View className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </View>

        <View className="gap-3">
          <View className="flex-row gap-3">
            <Skeleton className="flex-1 h-16 rounded-2xl" />
            <Skeleton className="flex-1 h-16 rounded-2xl" />
          </View>
          <View className="flex-row gap-3">
            <Skeleton className="flex-1 h-16 rounded-2xl" />
            <Skeleton className="flex-1 h-16 rounded-2xl" />
          </View>
        </View>
      </View>
    </Card>
  );
};
