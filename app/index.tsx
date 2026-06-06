import { useEffect, useRef } from 'react';
import { View, Text, Animated, Platform, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { getSettings } from '@/src/lib/settings';
import { trackScreenView } from '@/src/lib/analytics';
import { usePostHog } from 'posthog-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

export default function IntroAnimationScreen() {
  const router = useRouter();
  const posthog = usePostHog();

  // Track screen view
  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Intro Animation');
    }, [posthog])
  );

  // One cohesive wordmark motion: fade up as a single word, hold, dissolve.
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      // In — fade + subtle rise, no bounce, no overshoot
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Hold
      Animated.delay(200),
      // Out — dissolve into the destination screen
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(async ({ finished }) => {
      if (!finished) return;
      const settings = await getSettings();
      if (!settings?.hasOnboarded) {
        router.replace('/onboarding');
      } else {
        // Cold launch always goes to /home. The post-onboarding paywall is a
        // one-shot shown from the onboarding/language completion flow; gated
        // features (Smart Study, Mistakes) present it on tap via ensureProAccess().
        router.replace('/home');
      }
    });

    return () => animation.stop();
  }, [opacity, translateY, scale, router]);

  return (
    <Screen className="items-center justify-center" style={{ backgroundColor: '#0f172a' }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Per-letter Texts in a row: a single multi-char Text collapses to one
            glyph in this RN/Yoga version. One Animated.View drives the whole
            wordmark so it still fades/rises as a single cohesive unit. */}
        <Animated.View
          style={{
            flexDirection: 'row',
            opacity,
            transform: [{ translateY }, { scale }],
          }}
        >
          {'Driver SK'.split('').map((ch, i) => (
            <Text
              key={i}
              allowFontScaling={false}
              style={{
                fontSize: 52,
                fontWeight: '700',
                color: '#F8FAFC',
                letterSpacing: 2,
                fontFamily: Platform.select({
                  ios: 'Avenir Next',
                  android: 'sans-serif-medium',
                  default: 'Helvetica Neue',
                }),
              }}
            >
              {ch === ' ' ? ' ' : ch}
            </Text>
          ))}
        </Animated.View>
      </View>
    </Screen>
  );
}
