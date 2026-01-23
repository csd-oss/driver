import { useEffect, useRef } from 'react';
import { View, Text, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { getSettings } from '@/src/lib/settings';

export default function IntroAnimationScreen() {
  const router = useRouter();
  const text = 'Cool Auto School';
  const words = text.split(' ');
  const letters = text.split('');
  
  // Create animated values for each letter
  // One for fade/initial position, one for jump animation
  const fadeAnims = useRef(
    letters.map(() => new Animated.Value(0))
  ).current;
  const jumpAnims = useRef(
    letters.map(() => new Animated.Value(0))
  ).current;

  // Colors for each letter - vibrant and playful
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', // Cool
    '#98D8C8', '#FFD700', '#FF6B9D', '#C44569', // Auto
    '#6C5CE7', '#A29BFE', '#FD79A8', '#FDCB6E', // School
    '#00B894', '#00CEC9', '#E17055', '#F39C12', '#E84393'
  ];

  useEffect(() => {
    // Create animations for each letter - longer animation
    const animations = letters.map((_, index) => {
      return Animated.sequence([
        Animated.delay(index * 180), // Longer stagger between letters
        Animated.parallel([
          // Fade in and slide up - longer duration
          Animated.timing(fadeAnims[index], {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          // Jump animation - longer and more bouncy
          Animated.sequence([
            Animated.timing(jumpAnims[index], {
              toValue: -30,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(jumpAnims[index], {
              toValue: 0,
              duration: 400,
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
        router.replace('/language');
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
    <Screen className="items-center justify-center" style={{ backgroundColor: '#6366f1' }}>
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
                      fontSize: 52,
                      fontWeight: '900',
                      color: colors[index % colors.length],
                      opacity: opacity,
                      transform: [
                        { translateY: Animated.add(translateY, jumpAnims[index]) },
                      ],
                      fontFamily: Platform.select({
                        ios: 'Marker Felt',
                        android: 'sans-serif-condensed',
                        default: 'Arial Rounded MT Bold',
                      }),
                      textShadowColor: 'rgba(0, 0, 0, 0.4)',
                      textShadowOffset: { width: 3, height: 3 },
                      textShadowRadius: 5,
                      marginHorizontal: 3,
                      letterSpacing: 1,
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
