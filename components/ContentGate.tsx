import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { t } from '@/src/i18n/i18n';
import { downloadContent, type ContentProgress } from '@/src/lib/contentPack';
import { getCachedLanguage } from '@/src/lib/settings';

/**
 * First launch only: download the question bank before the app starts
 * (see src/lib/contentPack.ts). Shows progress, and a retry when offline.
 */
export function ContentGate({ onReady }: { onReady: () => void }) {
  const lang = getCachedLanguage();
  const [progress, setProgress] = useState<ContentProgress | null>(null);
  const [failed, setFailed] = useState(false);

  const start = useCallback(() => {
    setFailed(false);
    setProgress(null);
    downloadContent(setProgress).then(onReady).catch((error) => {
      console.warn('Content download failed:', error?.message);
      setFailed(true);
    });
  }, [onReady]);

  useEffect(() => { start(); }, [start]);

  const share = progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <View style={styles.stage} testID="screen.content">
      <View style={styles.card}>
        <Text style={styles.title}>{t('content.title', lang)}</Text>
        <Text style={styles.body}>{failed ? t('content.error', lang) : t('content.body', lang)}</Text>
        {failed ? (
          <Button onPress={start} testID="content.retry">{t('content.retry', lang)}</Button>
        ) : progress ? (
          <View style={styles.progress}>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} /></View>
            <Text style={styles.percent}>{Math.round(share * 100)} %</Text>
          </View>
        ) : (
          <ActivityIndicator color="#a5b4fc" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 420, gap: 18 },
  title: { color: '#f8fafc', fontSize: 26, fontWeight: '700', textAlign: 'center' },
  body: { color: '#cbd5e1', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  progress: { gap: 8, alignItems: 'center' },
  track: { width: '100%', height: 8, borderRadius: 4, backgroundColor: '#1e293b', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: '#6366f1' },
  percent: { color: '#94a3b8', fontSize: 14, fontVariant: ['tabular-nums'] },
});
