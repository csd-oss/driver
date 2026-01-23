import { useEffect, useState, useCallback } from 'react';
import { View, Image, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { getLanguage } from '@/src/lib/settings';
import { loadProgress, saveProgress } from '@/src/lib/storage';
import { getRandomTest, getQuestionFromTest } from '@/src/lib/bank';
import { applyAnswer } from '@/src/lib/engine';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';

export default function MockScreen() {
  const router = useRouter();
  const [lang, setLang] = useState(1);
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [isFinished, setIsFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [passed, setPassed] = useState(false);
  const [results, setResults] = useState({});
  const [progress, setProgress] = useState({ mistakesByLang: {}, streaksByLang: {} });
  const [timeRemaining, setTimeRemaining] = useState(0);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const loadedProgress = await loadProgress();
    if (loadedProgress) {
      setProgress(loadedProgress);
    }
    
    startNewTest(currentLang);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const startNewTest = (currentLang) => {
    const newTest = getRandomTest(currentLang);
    setTest(newTest);
    setAnswers({});
    setIsFinished(false);
    setScore(0);
    setMaxScore(newTest?.maxbody || 0);
    setPassed(false);
    setResults({});
    
    if (newTest && newTest.cas > 0) {
      setTimeRemaining(newTest.cas);
    }
  };

  useEffect(() => {
    if (timeRemaining > 0 && !isFinished) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [timeRemaining, isFinished]);

  const handleAnswer = (qNo, answerIndex) => {
    if (isFinished) return;
    setAnswers((prev) => ({
      ...prev,
      [qNo]: answerIndex,
    }));
  };

  const handleFinish = () => {
    if (!test) return;
    
    let totalScore = 0;
    let totalMax = 0;
    const questionResults = {};
    
    for (let qNo = 1; qNo <= test.pocet; qNo++) {
      const qNoStr = String(qNo);
      const questionData = test.otazky[qNoStr];
      if (!questionData || !questionData[0]) continue;
      
      const q = questionData[0];
      totalMax += q.body;
      
      const userAnswer = answers[qNoStr];
      if (userAnswer === q.platna) {
        totalScore += q.body;
        questionResults[qNoStr] = true;
      } else {
        questionResults[qNoStr] = false;
      }
    }
    
    setScore(totalScore);
    setMaxScore(totalMax);
    setPassed(totalScore >= test.minbody);
    setResults(questionResults);
    setIsFinished(true);
  };

  const handleAddWrongToMistakes = async () => {
    if (!test) return;
    
    let updatedProgress = { ...progress };
    
    for (let qNo = 1; qNo <= test.pocet; qNo++) {
      const qNoStr = String(qNo);
      const questionData = test.otazky[qNoStr];
      if (!questionData || !questionData[0]) continue;
      
      const q = questionData[0];
      const userAnswer = answers[qNoStr];
      
      if (userAnswer !== q.platna) {
        updatedProgress = applyAnswer(updatedProgress, lang, String(q.id), false);
      }
    }
    
    setProgress(updatedProgress);
    await saveProgress(updatedProgress);
    
    Alert.alert('Success', 'Wrong answers added to mistakes');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!test) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <UIText variant="body">Loading...</UIText>
        </View>
      </Screen>
    );
  }

  if (isFinished) {
    return (
      <Screen>
        <ScrollView className="flex-1" contentContainerClassName="gap-4">
          <Card>
            <View className="items-center mb-4">
              <UIText variant="title">{t('mock.score', lang)}</UIText>
              <UIText variant="subtitle" className="mt-2">
                {score} / {maxScore}
              </UIText>
              <UIText
                variant="subtitle"
                className={`mt-2 ${passed ? 'text-green-600' : 'text-red-600'}`}
              >
                {passed ? t('mock.pass', lang) : t('mock.fail', lang)}
              </UIText>
              <UIText variant="caption" className="mt-2">
                {t('mock.pass', lang)}: {test.minbody} {t('study.points', lang)}
              </UIText>
            </View>
          </Card>

          <Card>
            <UIText variant="subtitle" className="mb-4">
              Results
            </UIText>
            <View className="gap-2">
              {Object.keys(results).map((qNoStr) => {
                const qNo = parseInt(qNoStr, 10);
                const isCorrect = results[qNoStr];
                return (
                  <View
                    key={qNoStr}
                    className={`p-2 rounded ${
                      isCorrect ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'
                    }`}
                  >
                    <UIText variant="body">
                      Question {qNo}: {isCorrect ? 'Correct' : 'Wrong'}
                    </UIText>
                  </View>
                );
              })}
            </View>
          </Card>

          <Button
            onPress={handleAddWrongToMistakes}
            variant="outline"
            className="w-full"
          >
            {t('mock.addWrong', lang)}
          </Button>

          <Button
            onPress={() => startNewTest(lang)}
            variant="default"
            className="w-full"
          >
            {t('mock.new', lang)}
          </Button>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="gap-4">
        {timeRemaining > 0 && (
          <Card>
            <UIText variant="subtitle">
              {t('mock.timer', lang)}: {formatTime(timeRemaining)}
            </UIText>
          </Card>
        )}

        {Array.from({ length: test.pocet }, (_, i) => i + 1).map((qNo) => {
          const qNoStr = String(qNo);
          const question = getQuestionFromTest(test, qNo);
          if (!question) return null;

          const userAnswer = answers[qNoStr];
          const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

          return (
            <Card key={qNoStr}>
              <UIText variant="subtitle" className="mb-2">
                Question {qNo} ({question.points} {t('study.points', lang)})
              </UIText>

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

              <View className="gap-2">
                {question.answers.map((answer, index) => {
                  const answerNum = index + 1;
                  const isSelected = userAnswer === answerNum;

                  return (
                    <Button
                      key={index}
                      onPress={() => handleAnswer(qNoStr, answerNum)}
                      variant={isSelected ? 'default' : 'outline'}
                      className="w-full"
                    >
                      {answer}
                    </Button>
                  );
                })}
              </View>
            </Card>
          );
        })}

        <Button onPress={handleFinish} variant="default" className="w-full">
          {t('mock.finish', lang)}
        </Button>
      </ScrollView>
    </Screen>
  );
}
