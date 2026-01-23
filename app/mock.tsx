import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Image, ScrollView, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const questionScrollRef = useRef(null);

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
    setCurrentQuestion(1);
    
    if (newTest && newTest.cas > 0) {
      setTimeRemaining(newTest.cas);
    }
  };

  const handleFinish = useCallback(() => {
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
  }, [test, answers]);

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
  }, [timeRemaining, isFinished, handleFinish]);

  const handleAnswer = (qNo, answerIndex) => {
    if (isFinished) return;
    setAnswers((prev) => ({
      ...prev,
      [qNo]: answerIndex,
    }));
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

  const handleQuestionNavigation = (qNo) => {
    setCurrentQuestion(qNo);
    // Scroll to the question button in the navigation bar
    if (questionScrollRef.current) {
      const buttonWidth = 44; // Approximate width of each button
      const scrollPosition = Math.max(0, (qNo - 1) * buttonWidth - 100);
      questionScrollRef.current.scrollTo({ x: scrollPosition, animated: true });
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 1) {
      handleQuestionNavigation(currentQuestion - 1);
    }
  };

  const handleNext = () => {
    if (test && currentQuestion < test.pocet) {
      handleQuestionNavigation(currentQuestion + 1);
    }
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

  // Fixed header with time and question navigation
  const renderHeader = () => (
    <View className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pb-2">
      {/* Time display */}
      {timeRemaining > 0 && (
        <View className="flex-row items-center justify-center px-4 py-2">
          <View className="bg-blue-600 dark:bg-blue-500 px-4 py-2 rounded">
            <UIText variant="subtitle" className="text-white font-bold">
              {t('mock.remainingTime', lang)} {formatTime(timeRemaining)}
            </UIText>
          </View>
        </View>
      )}

      {/* Question navigation bar */}
      <ScrollView
        ref={questionScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-2"
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        <View className="flex-row gap-1">
          {Array.from({ length: test.pocet }, (_, i) => i + 1).map((qNo) => {
            const qNoStr = String(qNo);
            const hasAnswer = answers[qNoStr] !== undefined;
            const isCurrent = qNo === currentQuestion;

            return (
              <Pressable
                key={qNo}
                onPress={() => handleQuestionNavigation(qNo)}
                className={`
                  w-10 h-10 rounded items-center justify-center border-2
                  ${isCurrent 
                    ? 'bg-blue-600 dark:bg-blue-500 border-blue-700 dark:border-blue-600' 
                    : hasAnswer 
                      ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700' 
                      : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                  }
                `}
              >
                <UIText
                  variant="body"
                  className={`
                    font-semibold
                    ${isCurrent 
                      ? 'text-white' 
                      : hasAnswer 
                        ? 'text-blue-700 dark:text-blue-300' 
                        : 'text-gray-700 dark:text-gray-300'
                    }
                  `}
                >
                  {qNo}
                </UIText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  // Current question display
  const renderCurrentQuestion = () => {
    const qNoStr = String(currentQuestion);
    const question = getQuestionFromTest(test, currentQuestion);
    if (!question) return null;

    const userAnswer = answers[qNoStr];
    const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

    return (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4">
        <Card>
          <UIText variant="subtitle" className="mb-2">
            Question {currentQuestion} ({question.points} {t('study.points', lang)})
          </UIText>

          <UIText variant="body" className="mb-4">
            {question.text}
          </UIText>

          {imageSource ? (
            <View className="my-4 items-center">
              <Image
                source={imageSource}
                style={{ width: '100%', maxWidth: 400, height: 300, resizeMode: 'contain' }}
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

        {/* Navigation buttons */}
        <View className="flex-row gap-3">
          <Button
            onPress={handlePrevious}
            variant="outline"
            disabled={currentQuestion === 1}
            className="flex-1"
          >
            {t('mock.previous', lang)}
          </Button>
          <Button
            onPress={handleNext}
            variant="outline"
            disabled={currentQuestion >= test.pocet}
            className="flex-1"
          >
            {t('mock.next', lang)}
          </Button>
        </View>

        <Button onPress={handleFinish} variant="default" className="w-full">
          {t('mock.finish', lang)}
        </Button>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900" edges={['top']}>
      {renderHeader()}
      <View className="flex-1 px-4 py-6">
        {renderCurrentQuestion()}
      </View>
    </SafeAreaView>
  );
}
