import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePostHog } from 'posthog-react-native';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import { getLanguage } from '@/src/lib/settings';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import {
  PRODUCT_YEARLY,
  attachPurchaseListeners,
  fetchSubscriptions,
  hasActiveDriverEntitlement,
  initIap,
  isIapSupported,
  purchaseSubscription,
  restoreSubscriptions,
} from '@/src/lib/iap';
import type { ProductSubscription } from 'react-native-iap';

const HERO_ICON = '🪪';

export default function PaywallScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const [lang, setLang] = useState(1);
  const [product, setProduct] = useState<ProductSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const detachRef = useRef<(() => void) | null>(null);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Paywall');
    }, [posthog])
  );

  useEffect(() => {
    getLanguage().then(setLang);
  }, []);

  // On non-iOS, skip the paywall entirely.
  useEffect(() => {
    if (!isIapSupported()) {
      router.replace('/home');
    }
  }, [router]);

  useEffect(() => {
    if (!isIapSupported()) return;

    let cancelled = false;

    const grantAndExit = (source: 'purchase' | 'restore') => {
      trackEvent(posthog, 'paywall_unlocked', { source });
      router.replace('/home');
    };

    (async () => {
      try {
        await initIap();

        detachRef.current = attachPurchaseListeners({
          onSuccess: () => {
            if (cancelled) return;
            setPurchasing(false);
            grantAndExit('purchase');
          },
          onError: (message) => {
            if (cancelled) return;
            setPurchasing(false);
            // Apple returns a cancellation as an error; don't show that.
            if (/cancel|user did not/i.test(message)) return;
            Alert.alert(t('paywall.errorTitle', lang), message || t('paywall.errorBody', lang));
          },
        });

        // If a previous purchase exists, skip straight through.
        const already = await hasActiveDriverEntitlement();
        if (already) {
          if (!cancelled) grantAndExit('restore');
          return;
        }

        const subs = await fetchSubscriptions();
        const yearly = subs.find((p) => p.id === PRODUCT_YEARLY) ?? subs[0] ?? null;
        if (!cancelled) {
          setProduct(yearly);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      detachRef.current?.();
      detachRef.current = null;
    };
    // We intentionally don't include `lang` — initial language is loaded once and
    // re-renders pick up the new value without needing to reset IAP state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubscribe = async () => {
    if (purchasing || !product) return;
    setPurchasing(true);
    trackEvent(posthog, 'paywall_subscribe_tapped', { product: product.id });
    try {
      await purchaseSubscription(product.id);
      // success/error handled by listeners
    } catch (err) {
      setPurchasing(false);
      const message = err instanceof Error ? err.message : '';
      if (!/cancel|user did not/i.test(message)) {
        Alert.alert(t('paywall.errorTitle', lang), message || t('paywall.errorBody', lang));
      }
    }
  };

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    trackEvent(posthog, 'paywall_restore_tapped', {});
    try {
      const restored = await restoreSubscriptions();
      if (restored) {
        router.replace('/home');
      } else {
        Alert.alert(t('paywall.errorTitle', lang), t('paywall.restoredNone', lang));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      Alert.alert(t('paywall.errorTitle', lang), message || t('paywall.errorBody', lang));
    } finally {
      setRestoring(false);
    }
  };

  const priceLabel = product?.displayPrice
    ? t('paywall.pricePerYear', lang).replace('{price}', product.displayPrice)
    : null;

  // Detect whether this product has an introductory free trial. RNIap surfaces
  // it under different shapes depending on platform/version, so do a permissive
  // check — fall back to the generic "Subscribe" CTA when uncertain.
  const productWithIntro = product as (ProductSubscription & {
    introductoryOffer?: unknown;
    introductoryPriceNumberOfPeriodsIOS?: unknown;
    introductoryPricePaymentModeIOS?: string;
  }) | null;
  const hasTrial =
    !!productWithIntro?.introductoryOffer ||
    productWithIntro?.introductoryPricePaymentModeIOS === 'FREETRIAL' ||
    !!productWithIntro?.introductoryPriceNumberOfPeriodsIOS;

  const ctaLabel = purchasing
    ? t('paywall.purchasing', lang)
    : hasTrial
      ? t('paywall.ctaTrial', lang)
      : t('paywall.ctaSubscribe', lang);

  return (
    <SafeAreaView
      testID="screen.paywall"
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom + 16, 32),
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View className="items-center gap-4 pt-4">
          <View
            className="items-center justify-center rounded-full bg-indigo-500/15 dark:bg-indigo-500/25 border-2 border-indigo-200/60 dark:border-indigo-700/40"
            style={{ width: 96, height: 96 }}
          >
            <UIText variant="title" style={{ fontSize: 60 }}>
              {HERO_ICON}
            </UIText>
          </View>
          <UIText variant="title" className="text-center text-slate-900 dark:text-slate-50">
            {t('paywall.headline', lang)}
          </UIText>
          <UIText
            variant="body"
            className="text-center text-slate-600 dark:text-slate-300"
          >
            {t('paywall.subhead', lang)}
          </UIText>
        </View>

        {/* Benefits */}
        <Card className="gap-3">
          {[
            t('paywall.benefit1', lang),
            t('paywall.benefit2', lang),
            t('paywall.benefit3', lang),
            t('paywall.benefit4', lang),
          ].map((line, i) => (
            <View key={i} className="flex-row items-start gap-3">
              <View
                className="items-center justify-center rounded-full bg-emerald-500/15 dark:bg-emerald-500/25"
                style={{ width: 24, height: 24, marginTop: 2 }}
              >
                <UIText
                  variant="caption"
                  className="text-emerald-700 dark:text-emerald-300 font-bold"
                  style={{ fontSize: 13 }}
                >
                  ✓
                </UIText>
              </View>
              <UIText
                variant="body"
                className="flex-1 text-slate-800 dark:text-slate-200"
              >
                {line}
              </UIText>
            </View>
          ))}
        </Card>

        {/* Price card */}
        <View className="rounded-2xl overflow-hidden border-2 border-indigo-300/60 dark:border-indigo-600/50 bg-indigo-500/10 dark:bg-indigo-500/20 p-5 gap-2">
          {hasTrial && (
            <View className="self-start rounded-full bg-indigo-600 dark:bg-indigo-500 px-3 py-1">
              <UIText
                variant="caption"
                className="text-white font-semibold"
                style={{ fontSize: 12 }}
              >
                {t('paywall.trialBadge', lang)}
              </UIText>
            </View>
          )}
          {loading ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : priceLabel ? (
            <UIText
              variant="subtitle"
              className="text-indigo-900 dark:text-indigo-100"
            >
              {priceLabel}
            </UIText>
          ) : (
            <UIText
              variant="body"
              className="text-slate-600 dark:text-slate-300"
            >
              {t('paywall.noProduct', lang)}
            </UIText>
          )}
        </View>

        <View className="gap-3 mt-auto">
          <Button
            onPress={onSubscribe}
            disabled={loading || purchasing || !product}
            className="w-full"
            testID="paywall.subscribe"
            accessibilityLabel={ctaLabel}
          >
            {ctaLabel}
          </Button>

          <Pressable
            onPress={onRestore}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.restore', lang)}
            className="py-3 items-center active:opacity-60"
            testID="paywall.restore"
          >
            <UIText
              variant="caption"
              className="text-indigo-700 dark:text-indigo-300 font-medium"
            >
              {restoring ? t('paywall.restoring', lang) : t('paywall.restore', lang)}
            </UIText>
          </Pressable>

          <UIText
            variant="caption"
            className="text-center text-slate-500 dark:text-slate-400"
            style={{ lineHeight: 18 }}
          >
            {t('paywall.finePrint', lang)}
          </UIText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
