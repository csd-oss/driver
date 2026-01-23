import { useState, useCallback } from 'react';
import { View, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { getLanguage } from '@/src/lib/settings';
import { loadProgress, saveProgress } from '@/src/lib/storage';
import { findQuestionById } from '@/src/lib/bank';
import { applyAnswer } from '@/src/lib/engine';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';

export default function MistakesScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [mistakes, setMistakes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [progress, setProgress] = useState({ mistakesByLang: {}, streaksByLang: {} });

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const loadedProgress = await loadProgress();
    if (loadedProgress) {
      setProgress(loadedProgress);
      const langStr = String(currentLang);
      const mistakeList = loadedProgress.mistakesByLang?.[langStr] || [];
      setMistakes(mistakeList);
      
      if (mistakeList.length > 0) {
        loadQuestion(mistakeList[0], currentLang);
        setCurrentIndex(0);
      } else {
        setQuestion(null);
        setCurrentIndex(0);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const loadQuestion = (qid, currentLang) => {
    const q = findQuestionById(currentLang, qid);
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
    
    // Reload mistakes list (in case question was removed)
    const langStr = String(lang);
    const updatedMistakes = updatedProgress.mistakesByLang?.[langStr] || [];
    setMistakes(updatedMistakes);
  };

  const handleNext = () => {
    const updatedMistakes = progress.mistakesByLang?.[String(lang)] || [];
    
    if (updatedMistakes.length === 0) {
      setQuestion(null);
      setCurrentIndex(0);
      return;
    }
    
    // Find next available question
    let nextIndex = currentIndex;
    if (nextIndex >= updatedMistakes.length) {
      nextIndex = 0;
    }
    
    // Make sure the current question is still in the list
    if (question && updatedMistakes.includes(question.qid)) {
      const currentQidIndex = updatedMistakes.indexOf(question.qid);
      if (currentQidIndex !== -1) {
        nextIndex = (currentQidIndex + 1) % updatedMistakes.length;
      }
    }
    
    if (updatedMistakes[nextIndex]) {
      loadQuestion(updatedMistakes[nextIndex], lang);
      setCurrentIndex(nextIndex);
      setMistakes(updatedMistakes);
    } else {
      setQuestion(null);
    }
  };

  if (mistakes.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <UIText variant="title">{t('mistakes.empty', lang)}</UIText>
        </View>
      </Screen>
    );
  }

  if (!question) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <UIText variant="body">Question not found</UIText>
          <Button onPress={loadData} variant="default" className="mt-4">
            Reload
          </Button>
        </View>
      </Screen>
    );
  }

  const langStr = String(lang);
  const streak = progress.streaksByLang?.[langStr]?.[question.qid] || 0;
  const mastery = Math.floor(streak / 2);

  const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="gap-4">
        <Card>
          {mastery > 0 && (
            <View className="mb-4 p-2 bg-blue-100 dark:bg-blue-900 rounded">
              <UIText variant="caption">
                {t('mistakes.mastery', lang)}: {mastery}
              </UIText>
            </View>
          )}

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
            {t('mistakes.next', lang)}
          </Button>
        )}
      </ScrollView>
    </Screen>
  );
}
