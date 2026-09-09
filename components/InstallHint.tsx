import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { t } from '@/src/i18n/i18n';
import {
  canPromptInstall,
  captureInstallPrompt,
  isIosSafari,
  isStandalonePWA,
  isWeb,
  promptInstall,
} from '@/src/lib/platform';

const DISMISS_KEY = 'driver.installHintDismissed';

const readDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (): void => {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode or blocked storage: the hint simply shows again next visit.
  }
};

interface InstallHintProps {
  lang: number;
  /**
   * `home`: a bold, dismissible nudge between the progress card and the actions.
   * `settings`: always shown on web, never dismissed, reports "installed" when
   * the page already runs from the home screen.
   */
  placement?: 'home' | 'settings';
}

/**
 * "Add to Home Screen" for the web build. Renders nothing on native.
 * Chrome / Edge / Android get the real install button; iOS Safari gets the
 * two-tap instructions because it never fires beforeinstallprompt.
 */
export const InstallHint = ({ lang, placement = 'home' }: InstallHintProps) => {
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [promptReady, setPromptReady] = useState(false);

  useEffect(() => {
    if (!isWeb) return;
    const standalone = isStandalonePWA();
    setInstalled(standalone);
    if (placement === 'home' && (standalone || readDismissed())) return;
    captureInstallPrompt();
    setVisible(true);
    setPromptReady(canPromptInstall());
    // The prompt can arrive after mount; poll briefly so the button appears.
    const timer = setInterval(() => {
      if (canPromptInstall()) {
        setPromptReady(true);
        clearInterval(timer);
      }
    }, 1000);
    const stop = setTimeout(() => clearInterval(timer), 15000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [placement]);

  const dismiss = useCallback(() => {
    writeDismissed();
    setVisible(false);
  }, []);

  const install = useCallback(async () => {
    const accepted = await promptInstall();
    if (accepted) {
      writeDismissed();
      setInstalled(true);
      if (placement === 'home') setVisible(false);
    }
  }, [placement]);

  if (!visible) return null;

  const showSafariSteps = isIosSafari() || !promptReady;

  if (placement === 'settings') {
    return (
      <Card className="gap-3" testID="pwa.installHint">
        <UIText variant="subtitle" className="text-indigo-600 dark:text-indigo-200">
          {t('pwa.installTitle', lang)}
        </UIText>
        {installed ? (
          <UIText variant="body" className="text-emerald-700 dark:text-emerald-200">
            {t('pwa.installed', lang)}
          </UIText>
        ) : (
          <>
            <UIText variant="body" className="text-slate-600 dark:text-slate-300">
              {t('pwa.installBody', lang)}
            </UIText>
            {showSafariSteps ? (
              <UIText variant="body" className="text-slate-900 dark:text-slate-50">
                {t('pwa.installSafariSteps', lang)}
              </UIText>
            ) : (
              <Button onPress={install} testID="pwa.installButton" className="w-full">
                {t('pwa.installButton', lang)}
              </Button>
            )}
          </>
        )}
      </Card>
    );
  }

  // Home: solid indigo so it reads as a call to action, not another list card.
  // Inline colours on purpose: on web the Card's dark: background rule would
  // otherwise beat a className override.
  return (
    <Card
      testID="pwa.installHint"
      className="gap-2"
      style={{ backgroundColor: '#4f46e5', borderColor: 'rgba(129,140,248,0.5)' }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <UIText variant="subtitle" className="text-white">
            📲
          </UIText>
          <UIText variant="subtitle" className="flex-1 font-semibold text-white">
            {t('pwa.installTitle', lang)}
          </UIText>
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('pwa.dismiss', lang)}
          testID="pwa.dismiss"
          className="rounded-full bg-white/15 px-2.5 py-1"
        >
          <UIText variant="caption" className="text-indigo-50">
            {t('pwa.dismiss', lang)}
          </UIText>
        </Pressable>
      </View>
      <UIText variant="body" className="text-indigo-50">
        {t('pwa.installBody', lang)}
      </UIText>
      {showSafariSteps ? (
        <UIText variant="body" className="font-semibold text-white">
          {t('pwa.installSafariSteps', lang)}
        </UIText>
      ) : (
        <Button
          onPress={install}
          testID="pwa.installButton"
          className="mt-1"
          style={{ backgroundColor: '#ffffff', borderColor: '#ffffff' }}
          textStyle={{ color: '#4338ca' }}
        >
          {t('pwa.installButton', lang)}
        </Button>
      )}
    </Card>
  );
};
