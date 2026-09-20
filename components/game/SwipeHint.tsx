import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

interface Props {
  direction: SwipeDirection;
  /** Side of the square the gesture is drawn in. */
  size?: number;
  colour?: string;
  label?: string;
  testID?: string;
}

const TRAVEL_MS = 900;
const FADE_MS = 350;
const PAUSE_MS = 220;
// The one animated value runs 0..1; the hand travels over the first slice of it
// and fades out over the rest, so both come from the same interpolations.
const TRAVEL_END = TRAVEL_MS / (TRAVEL_MS + FADE_MS);
// How much of the square the hand crosses. The arrowhead sits past the end of
// that travel, so this leaves it room to stay inside the square.
const REACH = 0.46;
// Room under the gesture for a one-line caption.
const CAPTION_H = 22;
// Each trail dot lags the hand by this fraction of the travel, and tapers with it.
const TRAIL = [
  { lag: 0.1, scale: 0.8, opacity: 0.5 },
  { lag: 0.18, scale: 0.64, opacity: 0.34 },
  { lag: 0.26, scale: 0.48, opacity: 0.22 },
  { lag: 0.34, scale: 0.34, opacity: 0.12 },
];

const AXIS: Record<SwipeDirection, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

// The arrowhead is a square with two borders, so its corner points up once the
// square is turned -45 degrees, and a quarter turn from there for each side.
const ARROW_ROTATION: Record<SwipeDirection, string> = {
  up: '-45deg',
  right: '45deg',
  down: '135deg',
  left: '225deg',
};

/** Where the hand starts and ends, as offsets from the middle of the square. */
export const gestureVector = (direction: SwipeDirection, size: number) => {
  const reach = (size * REACH) / 2;
  const { dx, dy } = AXIS[direction];
  return {
    from: { x: -dx * reach, y: -dy * reach },
    to: { x: dx * reach, y: dy * reach },
  };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Looping demonstration of one swipe: a hand dot that travels, trails and repeats. */
export const SwipeHint = memo(function SwipeHint({ direction, size = 120, colour = '#ffffff', label, testID }: Props) {
  const progressRef = useRef(new Animated.Value(0));
  const progress = progressRef.current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const gesture = gestureVector(direction, size);
    // Nothing to demonstrate if the square leaves the hand nowhere to go.
    if (gesture.from.x === gesture.to.x && gesture.from.y === gesture.to.y) return;

    const value = progressRef.current;
    let loop: Animated.CompositeAnimation | undefined;
    let live = true;
    value.setValue(0);

    const motionAllowed = async () => {
      try {
        return !(await AccessibilityInfo.isReduceMotionEnabled());
      } catch {
        // No answer from the platform, so treat motion as allowed.
        return true;
      }
    };

    motionAllowed().then((allowed) => {
      if (!live) return;
      setReduced(!allowed);
      if (!allowed) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: TRAVEL_END,
            duration: TRAVEL_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 1,
            duration: FADE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          // Already at 1 and invisible: this step is just the gap before the repeat.
          Animated.timing(value, { toValue: 1, duration: PAUSE_MS, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });

    return () => {
      live = false;
      loop?.stop();
    };
  }, [direction, size]);

  const { from, to } = gestureVector(direction, size);
  const dotR = size / 12;
  const ringD = dotR * 3.6;
  const border = Math.max(1, size / 70);
  const arrow = size * 0.11;
  const { dx, dy } = AXIS[direction];
  // Clear of the ring, and near enough that its own half still fits the square.
  const reachPastDot = ringD / 2 + arrow / 2;
  const tip = { x: to.x + dx * reachPastDot, y: to.y + dy * reachPastDot };

  // One axis of the travel, held at the far end once the hand gets there. A
  // trail dot with a lag stays that fraction of the gesture behind the hand.
  const along = (a: number, b: number, lag: number) => {
    const end = lerp(a, b, 1 - lag);
    return progress.interpolate(
      lag > 0
        ? { inputRange: [0, lag * TRAVEL_END, TRAVEL_END, 1], outputRange: [a, a, end, end], extrapolate: 'clamp' }
        : { inputRange: [0, TRAVEL_END, 1], outputRange: [a, end, end], extrapolate: 'clamp' },
    );
  };

  // Fades in as the dot sets off, holds, then fades out over the tail of the value.
  const fade = (peak: number, lag: number) =>
    progress.interpolate({
      inputRange: [0, lag * TRAVEL_END + 0.05, TRAVEL_END, 1],
      outputRange: [0, peak, peak, 0],
      extrapolate: 'clamp',
    });

  return (
    <View
      testID={testID}
      accessible={false}
      style={{
        width: size,
        height: size + (label ? CAPTION_H : 0),
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <View style={{ width: size, height: size }}>
        {/* Static, so the direction reads even before the hand has moved. */}
        <View style={styles.layer}>
          <View
            style={{
              width: arrow,
              height: arrow,
              borderTopWidth: border * 1.6,
              borderRightWidth: border * 1.6,
              borderColor: colour,
              opacity: 0.75,
              transform: [
                { translateX: tip.x },
                { translateY: tip.y },
                { rotate: ARROW_ROTATION[direction] },
              ],
            }}
          />
        </View>
        {reduced
          ? null
          : TRAIL.map((t) => (
              <View key={t.lag} style={styles.layer}>
                <Animated.View
                  style={{
                    width: dotR * 2 * t.scale,
                    height: dotR * 2 * t.scale,
                    borderRadius: dotR * t.scale,
                    backgroundColor: colour,
                    opacity: fade(t.opacity, t.lag),
                    transform: [
                      { translateX: along(from.x, to.x, t.lag) },
                      { translateY: along(from.y, to.y, t.lag) },
                    ],
                  }}
                />
              </View>
            ))}
        <View style={styles.layer}>
          <Animated.View
            style={{
              width: ringD,
              height: ringD,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: reduced ? 1 : fade(1, 0),
              transform: reduced
                ? [{ translateX: to.x }, { translateY: to.y }]
                : [{ translateX: along(from.x, to.x, 0) }, { translateY: along(from.y, to.y, 0) }],
            }}
          >
            <View
              style={[
                styles.ring,
                { borderRadius: ringD / 2, borderWidth: border, borderColor: colour },
              ]}
            />
            <View
              style={{
                width: dotR * 2,
                height: dotR * 2,
                borderRadius: dotR,
                backgroundColor: colour,
                opacity: 0.9,
              }}
            />
          </Animated.View>
        </View>
      </View>
      {label ? (
        <Text
          numberOfLines={2}
          style={{
            marginTop: 4,
            width: size,
            textAlign: 'center',
            fontSize: 12,
            lineHeight: 15,
            color: colour,
            opacity: 0.85,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  // Every part of the gesture gets the whole square, centred, and moves by transform.
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ring: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
});
