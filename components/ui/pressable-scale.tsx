import { forwardRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cssInterop } from 'nativewind';

const SPRING_CONFIG = { damping: 18, stiffness: 320, mass: 0.4 } as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// NativeWind does not map className onto animated components on web by itself.
// Native already has the mapping; re-registering there strips the styles.
if (Platform.OS === 'web') {
  cssInterop(AnimatedPressable, { className: 'style' });
}

interface PressableScaleProps extends PressableProps {
  scaleTo?: number;
  haptic?: boolean;
  children: ReactNode;
}

export const PressableScale = forwardRef<View, PressableScaleProps>(
  (
    {
      scaleTo = 0.96,
      haptic = false,
      onPressIn,
      onPressOut,
      disabled,
      style,
      children,
      ...rest
    },
    ref,
  ) => {
    // Keep touch feedback on RN's native animation driver. Reanimated's fast
    // transform path is for the non-interactive road/car layers; it bypasses
    // Fabric hit-test bookkeeping and must not move our press targets.
    const [scale] = useState(() => new Animated.Value(1));
    const reducedMotion = useReducedMotion();

    const animatedStyle = { transform: [{ scale }] };

    const handlePressIn = (e: GestureResponderEvent) => {
      // Reduce Motion: keep the press feedback to colour only, no scale spring.
      if (!reducedMotion) Animated.spring(scale, { toValue: scaleTo, ...SPRING_CONFIG, useNativeDriver: Platform.OS !== 'web' }).start();
      if (haptic && !disabled) {
        Haptics.selectionAsync();
      }
      onPressIn?.(e);
    };

    const handlePressOut = (e: GestureResponderEvent) => {
      if (!reducedMotion) Animated.spring(scale, { toValue: 1, ...SPRING_CONFIG, useNativeDriver: Platform.OS !== 'web' }).start();
      onPressOut?.(e);
    };

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={typeof style === 'function' ? state => [style(state), animatedStyle] : [style, animatedStyle]}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  },
);

PressableScale.displayName = 'PressableScale';
