import { useEffect, useRef } from 'react';
import { View, Text, Animated, Platform, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { getSettings } from '@/src/lib/settings';

export default function IntroAnimationScreen() {
  const router = useRouter();
  const text = 'Cool Auto School';
  const words = text.split(' ');
  const letters = text.split('');
  
  // Create animated values for each letter
  // One for fade/initial position, one for lift animation, one for scale
  const fadeAnims = useRef(
    letters.map(() => new Animated.Value(0))
  ).current;
  const jumpAnims = useRef(
    letters.map(() => new Animated.Value(0))
  ).current;
  const scaleAnims = useRef(
    letters.map(() => new Animated.Value(0.92))
  ).current;

  // Colors for each letter - cooler palette to match the app
  const colors = [
    '#818CF8', '#60A5FA', '#38BDF8', '#22D3EE',
    '#A78BFA', '#C4B5FD', '#5EEAD4', '#34D399',
    '#F472B6', '#FB7185', '#FBBF24', '#F59E0B',
    '#93C5FD', '#67E8F9', '#A7F3D0', '#E879F9', '#C7D2FE'
  ];

  useEffect(() => {
    // Create animations for each letter - longer animation
    const animations = letters.map((_, index) => {
      return Animated.sequence([
        Animated.delay(index * 150),
        Animated.parallel([
          // Fade in and slide up
          Animated.timing(fadeAnims[index], {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          // Lift animation - subtle and smooth
          Animated.sequence([
            Animated.timing(jumpAnims[index], {
              toValue: -18,
              duration: 280,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(jumpAnims[index], {
              toValue: 0,
              duration: 360,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
          // Scale in for a soft reveal
          Animated.sequence([
            Animated.timing(scaleAnims[index], {
              toValue: 1.03,
              duration: 260,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnims[index], {
              toValue: 1,
              duration: 320,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
    });

    // Start all animations
    Animated.parallel(animations).start();

    // Navigate after delay - longer to accommodate longer animation
    const timer = setTimeout(async () => {
      const settings = await getSettings();
      if (settings && settings.hasOnboarded) {
        router.replace('/home');
      } else {
        router.replace('/onboarding');
      }
    }, letters.length * 180 + 1500);

    return () => clearTimeout(timer);
  }, []);

  // Build word groups with letter indices
  let letterIndex = 0;
  const wordGroups = words.map((word) => {
    const wordLetters = word.split('');
    const indices = wordLetters.map(() => letterIndex++);
    return { word, letters: wordLetters, indices };
  });

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
        <View className="flex-row items-center justify-center" style={{ flexWrap: 'wrap', maxWidth: '100%' }}>
          {wordGroups.map((wordGroup, wordIndex) => (
            <View 
              key={wordIndex}
              className="flex-row items-center"
              style={{ flexShrink: 0 }}
            >
              {wordGroup.letters.map((letter, letterInWordIndex) => {
                const index = wordGroup.indices[letterInWordIndex];
                const translateY = fadeAnims[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                });

                const opacity = fadeAnims[index];

                return (
                  <Animated.Text
                    key={index}
                    style={{
                      fontSize: 50,
                      fontWeight: '800',
                      color: colors[index % colors.length],
                      opacity: opacity,
                      transform: [
                        { translateY: Animated.add(translateY, jumpAnims[index]) },
                        { scale: scaleAnims[index] },
                      ],
                      fontFamily: Platform.select({
                        ios: 'Avenir Next',
                        android: 'sans-serif-medium',
                        default: 'Helvetica Neue',
                      }),
                      textShadowColor: 'rgba(15, 23, 42, 0.35)',
                      textShadowOffset: { width: 2, height: 4 },
                      textShadowRadius: 8,
                      marginHorizontal: 2,
                      letterSpacing: 0.6,
                    }}
                  >
                    {letter}
                  </Animated.Text>
                );
              })}
              {wordIndex < wordGroups.length - 1 && (
                <View style={{ width: 16 }} />
              )}
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}
