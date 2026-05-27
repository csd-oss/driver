import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { ensureNotificationPermission, syncNotificationsWithCurrentSettings } from '@/src/lib/notifications';
import { clearCache, getLanguage, getSettings, updateSettings } from '@/src/lib/settings';
import { isPurchasesSupported, isSubscribed } from '@/src/lib/purchases';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Pressable,
    ScrollView,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

interface OnboardingSlide {
  title: string;
  description: string;
  icon: string;
  color: string;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [lang, setLang] = useState(1);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const isCompactHeight = SCREEN_HEIGHT < 720;
  const hasTrackedStart = useRef(false);
  const lastTrackedSlide = useRef<number | null>(null);

  // Track screen view and onboarding start
  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Onboarding');
      
      if (!hasTrackedStart.current) {
        trackEvent(posthog, 'onboarding_started', {
          language: lang,
        });
        hasTrackedStart.current = true;
      }
    }, [posthog, lang])
  );

  // Load language
  useEffect(() => {
    getLanguage().then(setLang);
  }, []);

  // Track slide views
  useEffect(() => {
    if (lastTrackedSlide.current !== currentSlide && hasTrackedStart.current) {
      const slide = slides[currentSlide];
      trackEvent(posthog, 'onboarding_slide_viewed', {
        slide_index: currentSlide,
        slide_title: slide.title,
        slide_color: slide.color,
        total_slides: slides.length,
        language: lang,
      });
      lastTrackedSlide.current = currentSlide;
    }
  }, [currentSlide, posthog, lang]);

  const slides: OnboardingSlide[] = [
    {
      title: t('onboarding.welcome.title', lang),
      description: t('onboarding.welcome.description', lang),
      icon: '🪪',
      color: 'indigo',
    },
    {
      title: t('onboarding.smartStudy.title', lang),
      description: t('onboarding.smartStudy.description', lang),
      icon: '🎯',
      color: 'emerald',
    },
    {
      title: t('onboarding.mistakes.title', lang),
      description: t('onboarding.mistakes.description', lang),
      icon: '💪',
      color: 'rose',
    },
    {
      title: t('onboarding.mockExam.title', lang),
      description: t('onboarding.mockExam.description', lang),
      icon: '⏱️',
      color: 'amber',
    },
    {
      title: t('onboarding.progress.title', lang),
      description: t('onboarding.progress.description', lang),
      icon: '🏆',
      color: 'sky',
    },
    {
      title: t('onboarding.notifications.title', lang),
      description: t('onboarding.notifications.description', lang),
      icon: '🔔',
      color: 'indigo',
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      const nextSlide = currentSlide + 1;
      
      // Track navigation
      trackEvent(posthog, 'onboarding_next_clicked', {
        from_slide: currentSlide,
        to_slide: nextSlide,
        slide_title: slides[currentSlide].title,
        language: lang,
      });
      
      // Scroll first, then update state after animation completes
      scrollViewRef.current?.scrollTo({
        x: nextSlide * SCREEN_WIDTH,
        animated: true,
      });
      // Delay state update to sync with scroll animation
      setTimeout(() => setCurrentSlide(nextSlide), 250);
    } else {
      handleFinish();
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      const prevSlide = currentSlide - 1;
      
      // Track navigation
      trackEvent(posthog, 'onboarding_previous_clicked', {
        from_slide: currentSlide,
        to_slide: prevSlide,
        slide_title: slides[currentSlide].title,
        language: lang,
      });
      
      scrollViewRef.current?.scrollTo({
        x: prevSlide * SCREEN_WIDTH,
        animated: true,
      });
      setTimeout(() => setCurrentSlide(prevSlide), 250);
    }
  };

  const handleSkip = () => {
    trackEvent(posthog, 'onboarding_skipped', {
      current_slide: currentSlide,
      slide_title: slides[currentSlide].title,
      total_slides: slides.length,
      language: lang,
    });
    handleFinish();
  };

  const handleFinish = async () => {
    const wasSkipped = currentSlide < slides.length - 1;
    
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(async () => {
      // Mark onboarding as complete
      await updateSettings({ hasOnboarded: true });
      clearCache(); // Clear cache to ensure fresh settings are loaded

      let notificationsGranted: boolean | null = null;
      if (!wasSkipped) {
        trackEvent(posthog, 'onboarding_notifications_permission_requested', {
          language: lang,
        });
        notificationsGranted = await ensureNotificationPermission();
        trackEvent(posthog, 'onboarding_notifications_permission_result', {
          language: lang,
          granted: notificationsGranted,
        });
        if (notificationsGranted) {
          await syncNotificationsWithCurrentSettings();
        }
      }
      
      // Track completion
      trackEvent(posthog, 'onboarding_completed', {
        completed_slide: currentSlide,
        total_slides: slides.length,
        was_skipped: wasSkipped,
        language: lang,
        notifications_permission_granted: notificationsGranted,
      });
      
      const settings = await getSettings();
      // If user already selected language during onboarding, skip language screen
      if (settings && settings.hasChosenLanguage) {
        const needsPaywall = isPurchasesSupported() && !isSubscribed();
        router.replace(needsPaywall ? '/paywall' : '/home');
      } else {
        router.replace('/language');
      }
    });
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const slideIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (slideIndex !== currentSlide && slideIndex >= 0 && slideIndex < slides.length) {
      setCurrentSlide(slideIndex);
    }
  };

  const goToSlide = (index: number) => {
    // Track dot navigation
    if (index !== currentSlide) {
      trackEvent(posthog, 'onboarding_dot_clicked', {
        from_slide: currentSlide,
        to_slide: index,
        slide_title: slides[index].title,
        language: lang,
      });
    }
    
    scrollViewRef.current?.scrollTo({
      x: index * SCREEN_WIDTH,
      animated: true,
    });
    setTimeout(() => setCurrentSlide(index), 250);
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
  const languageFlag = lang === 1 ? '🇸🇰' : lang === 3 ? '🇭🇺' : '🇬🇧';

  // Animated dot indicator component
  const DotIndicator = ({ index }: { index: number }) => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const dotWidth = scrollX.interpolate({
      inputRange,
      outputRange: [8, 24, 8],
      extrapolate: 'clamp',
    });

    const dotOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.4, 1, 0.4],
      extrapolate: 'clamp',
    });

    return (
      <Pressable
        onPress={() => goToSlide(index)}
        hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Slide ${index + 1}`}
      >
        <Animated.View
          style={{
            width: dotWidth,
            opacity: dotOpacity,
            height: 8,
            borderRadius: 4,
            marginHorizontal: 4,
          }}
          className="bg-indigo-600 dark:bg-indigo-400"
        />
      </Pressable>
    );
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <SafeAreaView testID="screen.onboarding" className="flex-1 bg-slate-50 dark:bg-slate-950">
        <View className="flex-1">
          <View
            className="flex-row items-center justify-between px-5"
            style={{ paddingTop: Math.max(8, insets.top * 0.6) }}
          >
            <Pressable
              onPress={() => {
                trackEvent(posthog, 'onboarding_language_change_clicked', {
                  current_slide: currentSlide,
                  current_language: lang,
                });
                router.push({ pathname: '/language', params: { from: 'onboarding' } });
              }}
              className="px-4 py-3 -ml-2 rounded-lg active:bg-slate-200/50 dark:active:bg-slate-800/50"
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.changeLanguage', lang)}
            >
              <UIText variant="caption" className="text-slate-600 dark:text-slate-300">
                {languageFlag} {t('onboarding.changeLanguage', lang)}
              </UIText>
            </Pressable>
            <Pressable
              onPress={handleSkip}
              testID="onboarding.skip"
              className="px-4 py-3 -mr-2 rounded-lg active:bg-slate-200/50 dark:active:bg-slate-800/50"
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip', lang)}
            >
              <UIText variant="caption" className="text-slate-500 dark:text-slate-300 font-medium">
                {t('onboarding.skip', lang)}
              </UIText>
            </Pressable>
          </View>

          <Animated.ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { 
                useNativeDriver: false,
                listener: handleScroll,
              }
            )}
            scrollEventThrottle={16}
            contentContainerStyle={{ flexGrow: 1 }}
            className="flex-1"
          >
            {slides.map((slide, index) => {
              const colors = getColorClasses(slide.color);
              const isFirstSlide = index === 0;
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
                      {/* Slovakia badge on first slide */}
                      {isFirstSlide && (
                        <View className="flex-row items-center gap-2 bg-white/60 dark:bg-slate-800/60 rounded-full px-4 py-1.5 border border-slate-200/50 dark:border-slate-700/50">
                          <UIText variant="caption" style={{ fontSize: 14 }}>🇸🇰</UIText>
                          <UIText variant="caption" className="text-slate-600 dark:text-slate-300 font-medium">
                            Slovakia
                          </UIText>
                        </View>
                      )}
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
                        className="text-center text-slate-600 dark:text-slate-300 leading-relaxed"
                      >
                        {slide.description}
                      </UIText>
                    </View>
                  </Card>
                </View>
              );
            })}
          </Animated.ScrollView>

          {/* Dot indicators */}
          <View className="flex-row justify-center items-center py-6">
            {slides.map((_, index) => (
              <DotIndicator key={index} index={index} />
            ))}
          </View>

          <View
            className="px-5 gap-3"
            style={{ paddingBottom: Math.max(16, insets.bottom + 8) }}
          >
            <Button onPress={handleNext} variant="default" className="w-full" testID="onboarding.next">
              {currentSlide === slides.length - 1
                ? t('onboarding.getStarted', lang)
                : t('onboarding.next', lang)}
            </Button>
            {currentSlide > 0 && (
              <Button
                onPress={handlePrevious}
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
