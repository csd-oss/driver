import { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/screen';
import { getSettings } from '@/src/lib/settings';

export default function IntroAnimationScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Start animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate after delay
    const timer = setTimeout(async () => {
      const settings = await getSettings();
      if (settings && settings.hasOnboarded) {
        router.replace('/home');
      } else {
        router.replace('/language');
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Screen className="items-center justify-center" style={{ backgroundColor: '#6366f1' }}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <View className="items-center">
          <Text
            style={{
              fontSize: 36,
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            <Text style={{ color: '#FFD700' }}>COOL </Text>
            <Text style={{ color: '#FF6B6B' }}>AUTO </Text>
            <Text style={{ color: '#4ECDC4' }}>SCHOOL</Text>
          </Text>
        </View>
      </Animated.View>
    </Screen>
  );
}
