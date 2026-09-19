import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { PressableScale } from '@/components/ui/pressable-scale';
import { t } from '@/src/i18n/i18n';

type Input = 'left' | 'brake' | 'go' | 'right';
interface Props {
  lang: number;
  intent?: string | null;
  braking?: boolean;
  disabled?: boolean;
  onInput: (input: Input) => void;
}

const ControlIcon = ({ input, color }: { input: Input; color: string }) => (
  <Svg width={28} height={28} viewBox="0 0 28 28">
    {input === 'left' || input === 'right' ? (
      <Path d={input === 'left' ? 'M17 6 L9 14 L17 22 M9 14 H24' : 'M11 6 L19 14 L11 22 M19 14 H4'} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <>
        <Rect x={input === 'go' ? 8 : 4} y={4} width={input === 'go' ? 12 : 20} height={20} rx={4} fill="none" stroke={color} strokeWidth={2} />
        {[9, 14, 19].map(y => <Line key={y} x1={input === 'go' ? 11 : 8} x2={input === 'go' ? 17 : 20} y1={y} y2={y} stroke={color} strokeWidth={1.5} strokeLinecap="round" />)}
      </>
    )}
  </Svg>
);

/** Explicit native dimensions keep the controls below the scene on every platform. */
export function DriveControls({ lang, intent, braking = false, disabled = false, onInput }: Props) {
  const button = (input: Input) => {
    const selected = input === 'brake' ? braking : input === intent;
    const accent = input === 'go';
    const color = selected || accent ? '#152f2b' : '#f3f3e9';
    return (
      <PressableScale key={input} onPress={() => onInput(input)} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={t(`crossing.control.${input}`, lang)}
        accessibilityState={{ disabled, selected }} testID={`crossing.control.${input}`}
        style={[styles.button, { backgroundColor: selected ? '#e6c998' : accent ? '#b9dbbc' : '#29423f', opacity: disabled ? 0.4 : 1 }]}>
        <ControlIcon input={input} color={color} />
        <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color }]}>{t(`crossing.control.${input}`, lang)}</Text>
      </PressableScale>
    );
  };
  return (
    <View style={styles.root} testID="crossing.controls">
      <View style={styles.steering}>
        <Text style={styles.groupLabel}>{t('crossing.control.direction', lang)}</Text>
        <View style={styles.row}>{button('left')}{button('right')}</View>
      </View>
      <View style={styles.pedals}>
        <Text style={styles.groupLabel}>{t('crossing.control.pedals', lang)}</Text>
        <View style={styles.row}>{button('brake')}{button('go')}</View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 20 },
  steering: { flex: 0.9, minWidth: 0 }, pedals: { flex: 1.1, minWidth: 0 },
  row: { flexDirection: 'row', width: '100%', gap: 8 },
  groupLabel: { color: '#a7bdb4', fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8, fontWeight: '600' },
  button: { flex: 1, minWidth: 0, minHeight: 78, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '600' },
});
