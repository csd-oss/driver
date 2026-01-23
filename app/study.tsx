import { useEffect, useState } from 'react';
import { View, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { getLanguage } from '@/src/lib/settings';
import { loadProgress, saveProgress } from '@/src/lib/storage';
import { flattenRandomQuestion } from '@/src/lib/bank';
import { applyAnswer } from '@/src/lib/engine';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';

export default function StudyScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [question, setQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [progress, setProgress] = useState({ mistakesByLang: {}, streaksByLang: {} });

  useFocusEffect(() => {
    loadData();
  });

  const loadData = async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const loadedProgress = await loadProgress();
    if (loadedProgress) {
      setProgress(loadedProgress);
    }
    
    loadNewQuestion(currentLang);
  };

  const loadNewQuestion = (currentLang) => {
    const q = flattenRandomQuestion(currentLang);
    setQuestion(q);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setIsCorrect(false);
  };

  const handleAnswer = async (answerIndex) => {
    if (isAnswered || !question) return;
    
    setSelectedAnswer(answerIndex);
    setIsAnswered(true);
    
    const correct = answerIndex === question.correct;
    setIsCorrect(correct);
    
    // Update progress
    const updatedProgress = applyAnswer(
      progress,
      lang,
      question.qid,
      correct
    );
    setProgress(updatedProgress);
    await saveProgress(updatedProgress);
  };

  const handleNext = () => {
    loadNewQuestion(lang);
  };

  if (!question) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <UIText variant="body">Loading...</UIText>
        </View>
      </Screen>
    );
  }

  const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="gap-4">
        <Card>
          <UIText variant="body" className="mb-4">
            {question.text}
          </UIText>

          {imageSource ? (
            <View className="my-4 items-center">
              <Image
                source={imageSource}
                style={{ width: 300, height: 300, resizeMode: 'contain' }}
                className="rounded-lg"
              />
            </View>
          ) : question.image ? (
            <View className="my-4 p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <UIText variant="caption">
                Image missing: {question.image}
              </UIText>
            </View>
          ) : null}

          <View className="gap-3 mt-4">
            {question.answers.map((answer, index) => {
              const answerNum = index + 1;
              const isSelected = selectedAnswer === answerNum;
              const isCorrectAnswer = answerNum === question.correct;
              
              let buttonVariant = 'outline';
              if (isAnswered) {
                if (isCorrectAnswer) {
                  buttonVariant = 'default';
                } else if (isSelected && !isCorrect) {
                  buttonVariant = 'secondary';
                }
              }

              return (
                <Button
                  key={index}
                  onPress={() => handleAnswer(answerNum)}
                  variant={buttonVariant}
                  disabled={isAnswered}
                  className={`w-full ${
                    isAnswered && isCorrectAnswer ? 'bg-green-500' : ''
                  }`}
                >
                  {answer}
                </Button>
              );
            })}
          </View>

          {isAnswered && (
            <View className="mt-4 p-4 rounded-lg bg-gray-100 dark:bg-gray-800">
              <UIText
                variant="subtitle"
                className={isCorrect ? 'text-green-600' : 'text-red-600'}
              >
                {isCorrect ? t('study.correct', lang) : t('study.wrong', lang)}
              </UIText>
              <UIText variant="body" className="mt-2">
                {t('study.points', lang)}: {question.points}
              </UIText>
            </View>
          )}
        </Card>

        {isAnswered && (
          <Button onPress={handleNext} variant="default" className="w-full">
            {t('study.next', lang)}
          </Button>
        )}
      </ScrollView>
    </Screen>
  );
}
