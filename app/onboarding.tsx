import { useState, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  Animated,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { t } from '@/src/i18n/i18n';
import { getLanguage, getSettings, updateSettings } from '@/src/lib/settings';

interface OnboardingSlide {
  title: string;
  description: string;
  icon: string;
  color: string;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [lang, setLang] = useState(1);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isCompactHeight = SCREEN_HEIGHT < 720;

  // Load language
  useEffect(() => {
    getLanguage().then(setLang);
  }, []);

  const slides: OnboardingSlide[] = [
    {
      title: t('onboarding.welcome.title', lang),
      description: t('onboarding.welcome.description', lang),
      icon: '🚗',
      color: 'indigo',
    },
    {
      title: t('onboarding.smartStudy.title', lang),
      description: t('onboarding.smartStudy.description', lang),
      icon: '🧠',
      color: 'emerald',
    },
    {
      title: t('onboarding.mistakes.title', lang),
      description: t('onboarding.mistakes.description', lang),
      icon: '📝',
      color: 'rose',
    },
    {
      title: t('onboarding.mockExam.title', lang),
      description: t('onboarding.mockExam.description', lang),
      icon: '📊',
      color: 'amber',
    },
    {
      title: t('onboarding.progress.title', lang),
      description: t('onboarding.progress.description', lang),
      icon: '📈',
      color: 'sky',
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      scrollViewRef.current?.scrollTo({
        x: nextSlide * SCREEN_WIDTH,
        animated: true,
      });
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = async () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(async () => {
      // Mark onboarding as complete
      await updateSettings({ hasOnboarded: true });
      
      const settings = await getSettings();
      // If user already selected language during onboarding, skip language screen
      if (settings && settings.hasChosenLanguage) {
        router.replace('/home');
      } else {
        router.replace('/language');
      }
    });
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const slideIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (slideIndex !== currentSlide) {
      setCurrentSlide(slideIndex);
    }
  };

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; text: string; border: string }> = {
      indigo: {
        bg: 'bg-indigo-500/15 dark:bg-indigo-500/20',
        text: 'text-indigo-700 dark:text-indigo-200',
        border: 'border-indigo-200/60 dark:border-indigo-700/40',
      },
      emerald: {
        bg: 'bg-emerald-500/15 dark:bg-emerald-500/20',
        text: 'text-emerald-700 dark:text-emerald-200',
        border: 'border-emerald-200/60 dark:border-emerald-700/40',
      },
      rose: {
        bg: 'bg-rose-500/15 dark:bg-rose-500/20',
        text: 'text-rose-700 dark:text-rose-200',
        border: 'border-rose-200/60 dark:border-rose-700/40',
      },
      amber: {
        bg: 'bg-amber-500/15 dark:bg-amber-500/20',
        text: 'text-amber-700 dark:text-amber-200',
        border: 'border-amber-200/60 dark:border-amber-700/40',
      },
      sky: {
        bg: 'bg-sky-500/15 dark:bg-sky-500/20',
        text: 'text-sky-700 dark:text-sky-200',
        border: 'border-sky-200/60 dark:border-sky-700/40',
      },
    };
    const base = colorMap[color] || colorMap.indigo;
    const extendedMap: Record<
      string,
      {
        blob: string;
        blobAlt: string;
        progress: string;
        pillBg: string;
        pillBorder: string;
      }
    > = {
      indigo: {
        blob: 'bg-indigo-400/20 dark:bg-indigo-500/25',
        blobAlt: 'bg-indigo-300/30 dark:bg-indigo-600/20',
        progress: 'bg-indigo-600 dark:bg-indigo-400',
        pillBg: 'bg-indigo-500/15 dark:bg-indigo-500/25',
        pillBorder: 'border-indigo-200/60 dark:border-indigo-700/40',
      },
      emerald: {
        blob: 'bg-emerald-400/20 dark:bg-emerald-500/25',
        blobAlt: 'bg-emerald-300/30 dark:bg-emerald-600/20',
        progress: 'bg-emerald-600 dark:bg-emerald-400',
        pillBg: 'bg-emerald-500/15 dark:bg-emerald-500/25',
        pillBorder: 'border-emerald-200/60 dark:border-emerald-700/40',
      },
      rose: {
        blob: 'bg-rose-400/20 dark:bg-rose-500/25',
        blobAlt: 'bg-rose-300/30 dark:bg-rose-600/20',
        progress: 'bg-rose-600 dark:bg-rose-400',
        pillBg: 'bg-rose-500/15 dark:bg-rose-500/25',
        pillBorder: 'border-rose-200/60 dark:border-rose-700/40',
      },
      amber: {
        blob: 'bg-amber-400/20 dark:bg-amber-500/25',
        blobAlt: 'bg-amber-300/30 dark:bg-amber-600/20',
        progress: 'bg-amber-600 dark:bg-amber-400',
        pillBg: 'bg-amber-500/15 dark:bg-amber-500/25',
        pillBorder: 'border-amber-200/60 dark:border-amber-700/40',
      },
      sky: {
        blob: 'bg-sky-400/20 dark:bg-sky-500/25',
        blobAlt: 'bg-sky-300/30 dark:bg-sky-600/20',
        progress: 'bg-sky-600 dark:bg-sky-400',
        pillBg: 'bg-sky-500/15 dark:bg-sky-500/25',
        pillBorder: 'border-sky-200/60 dark:border-sky-700/40',
      },
    };
    return {
      ...base,
      ...(extendedMap[color] || extendedMap.indigo),
    };
  };

  const accent = getColorClasses(slides[currentSlide]?.color || 'indigo');
  const heroSize = isCompactHeight ? 76 : 96;
  const heroFontSize = isCompactHeight ? 54 : 64;
  const cardWidth = Math.min(SCREEN_WIDTH - 48, 420);
  const progressWidth = Math.round(((currentSlide + 1) / slides.length) * 100);
  const languageFlag = lang === 1 ? '🇸🇰' : lang === 3 ? '🇭🇺' : '🇬🇧';

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
        <View className="flex-1">
          <View
            className="flex-row items-center justify-between px-5"
            style={{ paddingTop: Math.max(8, insets.top * 0.6) }}
          >
            <Pressable
              onPress={() =>
                router.push({ pathname: '/language', params: { from: 'onboarding' } })
              }
              className="px-2 py-2 -ml-2"
            >
              <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                {languageFlag} {t('onboarding.changeLanguage', lang)}
              </UIText>
            </Pressable>
            <View className={`rounded-full border px-3 py-1 ${accent.pillBg} ${accent.pillBorder}`}>
              <UIText variant="caption" className={`${accent.text} font-semibold`}>
                {`Step ${currentSlide + 1} of ${slides.length}`}
              </UIText>
            </View>
            <Button
              onPress={handleSkip}
              variant="secondary"
              className="px-4 py-2"
            >
              <UIText variant="caption">{t('onboarding.skip', lang)}</UIText>
            </Button>
          </View>

          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ flexGrow: 1 }}
            className="flex-1"
          >
            {slides.map((slide, index) => {
              const colors = getColorClasses(slide.color);
              return (
                <View
                  key={index}
                  style={{ width: SCREEN_WIDTH }}
                  className="flex-1 items-center justify-center px-6"
                >
                  <Card
                    className={`${colors.bg} ${colors.border} border-2 items-center gap-5 px-6 py-7`}
                    style={{ width: cardWidth }}
                  >
                    <View className="items-center gap-4">
                      <View
                        className={`items-center justify-center rounded-full border-2 border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/80`}
                        style={{ width: heroSize, height: heroSize }}
                      >
                        <UIText
                          variant="title"
                          style={{ fontSize: heroFontSize }}
                        >
                          {slide.icon}
                        </UIText>
                      </View>
                      <UIText
                        variant="title"
                        className={`text-center ${colors.text}`}
                      >
                        {slide.title}
                      </UIText>
                      <UIText
                        variant="body"
                        className="text-center text-slate-600 dark:text-slate-300"
                      >
                        {slide.description}
                      </UIText>
                    </View>
                  </Card>
                </View>
              );
            })}
          </ScrollView>

          <View className="px-6 pb-4">
            <View className="h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800/80 overflow-hidden">
              <View
                className={`h-full rounded-full ${accent.progress}`}
                style={{ width: `${progressWidth}%` }}
              />
            </View>
          </View>

          <View
            className="px-5 gap-3"
            style={{ paddingBottom: Math.max(16, insets.bottom + 8) }}
          >
            <Button onPress={handleNext} variant="default" className="w-full">
              {currentSlide === slides.length - 1
                ? t('onboarding.getStarted', lang)
                : t('onboarding.next', lang)}
            </Button>
            {currentSlide > 0 && (
              <Button
                onPress={() => {
                  const prevSlide = currentSlide - 1;
                  setCurrentSlide(prevSlide);
                  scrollViewRef.current?.scrollTo({
                    x: prevSlide * SCREEN_WIDTH,
                    animated: true,
                  });
                }}
                variant="outline"
                className="w-full"
              >
                {t('onboarding.previous', lang)}
              </Button>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}
