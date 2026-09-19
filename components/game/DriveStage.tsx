import { useDrivePalette } from './drivePalette';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DriveControls } from './DriveControls';
import { t } from '@/src/i18n/i18n';

interface Props {
  lang: number;
  detail: string;
  instruction: string;
  direction?: string;
  status: string;
  paused?: boolean;
  onPause?: () => void;
  onBack: () => void;
  intent?: string | null;
  braking?: boolean;
  onInput: (input: 'left' | 'right' | 'brake' | 'go') => void;
  children: (width: number, height: number, occludedTop: number) => ReactNode;
  testID: string;
}

/** A full-height road and a fixed bottom console; no shared page gutters. */
export function DriveStage({ lang, detail, instruction, direction, status, paused, onPause, onBack, intent, braking, onInput, children, testID }: Props) {
  const palette = useDrivePalette();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [overlayHeight, setOverlayHeight] = useState(100);
  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'bottom']} testID={testID}>
        <View style={styles.scene} testID="crossing.viewport" onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setSize(prev => prev.width === width && prev.height === height ? prev : { width, height });
        }}>
          {size.width > 0 && size.height > 0 && children(size.width, size.height, overlayHeight + 14)}
          <View style={[styles.instructor, { backgroundColor: palette.background }]} testID="crossing.instruction" onLayout={e => setOverlayHeight(e.nativeEvent.layout.height)}>
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('a11y.goBack', lang)} style={styles.overlayButton} testID="nav.back">
              <Text style={[styles.backText, { color: palette.text }]}>‹</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: palette.secondary }]}>{direction === 'left' ? '←' : direction === 'right' ? '→' : '↑'}  {t('crossing.control.instructor', lang)}</Text>
              <Text style={[styles.instruction, { color: palette.text }]} maxFontSizeMultiplier={1.3}>{instruction}</Text>
            </View>
            {onPause && <Pressable onPress={onPause} accessibilityRole="button" accessibilityLabel={t(`crossing.control.${paused ? 'resume' : 'pause'}`, lang)} style={styles.overlayButton} testID="crossing.pause"><Text style={[styles.pauseText, { color: palette.text }]}>{paused ? '▶' : 'Ⅱ'}</Text></Pressable>}
          </View>
          {paused && <View pointerEvents="none" style={styles.paused}><Text style={styles.pausedText}>{t('crossing.control.paused', lang)}</Text></View>}
        </View>
        <View style={[styles.console, { backgroundColor: palette.background }]}>
          <Text style={[styles.detail, { color: palette.secondary }]} testID="crossing.summary">{detail}</Text>
          <View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: braking ? '#d97706' : palette.accent }]} /><Text style={[styles.status, { color: palette.text }]} maxFontSizeMultiplier={1.3} accessibilityLiveRegion="polite">{status}</Text></View>
          <DriveControls lang={lang} intent={intent} braking={braking} disabled={paused} onInput={onInput} />
        </View>
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center', backgroundColor: '#142d29' },
  safe: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 520 : undefined, backgroundColor: '#142d29' },
  overlayButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 34, color: '#29423f', lineHeight: 38 },
  detail: { color: '#a7bdb4', fontSize: 10, marginBottom: 4 },
  pauseText: { color: '#375c4d', fontSize: 22, fontWeight: '600' },
  scene: { flex: 1, width: '100%', minHeight: 160, overflow: 'hidden', backgroundColor: '#c6d5b7' },
  instructor: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 18, backgroundColor: '#faf9ef', shadowColor: '#19342a', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', color: '#73816c', marginBottom: 4 },
  instruction: { color: '#223b34', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  console: { flexShrink: 0, width: '100%', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, backgroundColor: '#142d29' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, marginBottom: 10 }, statusDot: { width: 6, height: 6, borderRadius: 3 }, status: { flex: 1, color: '#d1ddd0', fontSize: 12, lineHeight: 17 },
  paused: { ...StyleSheet.absoluteFillObject, backgroundColor: '#142d2970', justifyContent: 'center', alignItems: 'center' }, pausedText: { color: '#fffdf3', fontSize: 22, fontWeight: '600' },
});
