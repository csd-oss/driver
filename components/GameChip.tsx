import { Pressable, View } from 'react-native';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';

// Chip colours by vehicle key. Inline so they render the same on web and native.
const VEHICLE_COLORS: Record<string, { bg: string; fg: string }> = {
  you: { bg: '#4f46e5', fg: '#ffffff' },
  tram: { bg: '#475569', fg: '#ffffff' },
  red: { bg: '#dc2626', fg: '#ffffff' },
  blue: { bg: '#2563eb', fg: '#ffffff' },
  green: { bg: '#16a34a', fg: '#ffffff' },
  yellow: { bg: '#eab308', fg: '#1f2937' },
};

const ORDINAL_STYLE = { bg: '#e0e7ff', fg: '#3730a3' };

const VEHICLE_EMOJI: Record<string, string> = { you: '🚗', tram: '🚋' };

export const chipLabel = (keys: string[], lang: number): string =>
  keys
    .map((key) => (key in VEHICLE_COLORS ? t(`game.vehicle.${key}`, lang) : t(`game.ordinal.${key}`, lang)))
    .join(' + ');

interface GameChipProps {
  keys: string[];
  lang: number;
  onPress?: () => void;
  disabled?: boolean;
  badge?: number | string;
  state?: 'idle' | 'correct' | 'wrong' | 'muted';
  testID?: string;
}

/**
 * One tappable vehicle (or ordinal) in the game. Paired chips ("Red + Blue")
 * split their background between the two colours.
 */
export const GameChip = ({ keys, lang, onPress, disabled, badge, state = 'idle', testID }: GameChipProps) => {
  const styles = keys.map((key) => VEHICLE_COLORS[key] ?? ORDINAL_STYLE);
  const primary = styles[0];
  const secondary = styles[1];
  const label = chipLabel(keys, lang);
  const emoji = keys.length === 1 ? VEHICLE_EMOJI[keys[0]] : undefined;
  const ring =
    state === 'correct' ? '#22c55e' : state === 'wrong' ? '#ef4444' : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      style={({ pressed }) => ({
        opacity: state === 'muted' ? 0.35 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 16,
          borderWidth: 3,
          borderColor: ring,
          backgroundColor: primary.bg,
          overflow: 'hidden',
        }}
      >
        {secondary && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%', backgroundColor: secondary.bg }}
          />
        )}
        {badge !== undefined && (
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UIText variant="caption" className="font-bold" style={{ color: '#1e1b4b' }}>
              {String(badge)}
            </UIText>
          </View>
        )}
        {emoji && (
          <UIText variant="body" style={{ color: primary.fg }}>
            {emoji}
          </UIText>
        )}
        <UIText
          variant="body"
          className="font-semibold"
          style={{ color: primary.fg, textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 2 }}
        >
          {label}
        </UIText>
      </View>
    </Pressable>
  );
};
