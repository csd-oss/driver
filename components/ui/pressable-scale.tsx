import { forwardRef, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
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
    const scale = useSharedValue(1);
    const reducedMotion = useReducedMotion();

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    const handlePressIn = (e: GestureResponderEvent) => {
      // Reduce Motion: keep the press feedback to colour only, no scale spring.
      if (!reducedMotion) scale.value = withSpring(scaleTo, SPRING_CONFIG);
      if (haptic && !disabled) {
        Haptics.selectionAsync();
      }
      onPressIn?.(e);
    };

    const handlePressOut = (e: GestureResponderEvent) => {
      if (!reducedMotion) scale.value = withSpring(1, SPRING_CONFIG);
      onPressOut?.(e);
    };

    return (
      <AnimatedPressable
        ref={ref}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[style, animatedStyle]}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  },
);

PressableScale.displayName = 'PressableScale';
