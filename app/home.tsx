import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { getSettings, getLanguage } from '@/src/lib/settings';
import { loadProgress } from '@/src/lib/storage';
import { resetProgress } from '@/src/lib/storage';
import { t } from '@/src/i18n/i18n';

export default function HomeScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakeCount, setMistakeCount] = useState(0);

  useFocusEffect(() => {
    loadData();
  });

  const loadData = async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const progress = await loadProgress();
    if (progress && progress.mistakesByLang) {
      const langStr = String(currentLang);
      const mistakes = progress.mistakesByLang[langStr] || [];
      setMistakeCount(mistakes.length);
    }
  };

  const handleResetProgress = () => {
    Alert.alert(
      t('home.reset', lang),
      'Are you sure you want to reset your progress? This will clear all mistakes and streaks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetProgress();
            setMistakeCount(0);
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <View className="flex-1 gap-6">
        <View className="items-center mt-4">
          <UIText variant="title">{t('app.title', lang)}</UIText>
        </View>

        <Card>
          <View className="items-center">
            <UIText variant="subtitle">{t('home.mistakeCount', lang)}</UIText>
            <UIText variant="title" className="mt-2">{mistakeCount}</UIText>
          </View>
        </Card>

        <View className="gap-4">
          <Button
            onPress={() => router.push('/study')}
            variant="default"
            className="w-full"
          >
            {t('home.study', lang)}
          </Button>

          <Button
            onPress={() => router.push('/mistakes')}
            variant="default"
            className="w-full"
          >
            {t('home.mistakes', lang)}
          </Button>

          <Button
            onPress={() => router.push('/mock')}
            variant="default"
            className="w-full"
          >
            {t('home.mock', lang)}
          </Button>

          <Button
            onPress={() => router.push('/settings')}
            variant="outline"
            className="w-full"
          >
            {t('home.settings', lang)}
          </Button>
        </View>

        <Divider />

        <Button
          onPress={handleResetProgress}
          variant="secondary"
          className="w-full"
        >
          {t('home.reset', lang)}
        </Button>
      </View>
    </Screen>
  );
}
