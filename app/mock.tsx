import { useEffect, useState, useCallback, useRef } from 'react';
import { View, ScrollView, Alert, Pressable, Modal } from 'react-native';
import { AspectImage } from '@/components/ui/aspect-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { Header } from '@/components/ui/header';
import { getLanguage } from '@/src/lib/settings';
import { loadProgress, saveProgress } from '@/src/lib/storage';
import { getRandomTest, getQuestionFromTest } from '@/src/lib/bank';
import { applyAnswer } from '@/src/lib/engine';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';

export default function MockScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
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
  const [selectedQuestionDetail, setSelectedQuestionDetail] = useState(null);
  const questionScrollRef = useRef(null);
  const contentScrollRef = useRef(null);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const loadedProgress = await loadProgress();
    if (loadedProgress) {
      setProgress(loadedProgress);
    }
    
    startNewTest(currentLang);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

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
    // Auto-scroll to navigation buttons after selecting an answer
    if (contentScrollRef.current) {
      setTimeout(() => {
        contentScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
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
    // Auto-scroll content to top when navigating to a new question
    if (contentScrollRef.current) {
      setTimeout(() => {
        contentScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
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

  const handleQuestionDetailPress = (qNoStr) => {
    const qNo = parseInt(qNoStr, 10);
    const question = getQuestionFromTest(test, qNo);
    if (!question) return;
    
    const userAnswer = answers[qNoStr];
    setSelectedQuestionDetail({ question, userAnswer, qNo });
  };

  if (!test) {
    return (
      <Screen header={<Header title={t('nav.mock', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <UIText variant="body">Loading...</UIText>
        </View>
      </Screen>
    );
  }

  if (isFinished) {
    return (
      <Screen header={<Header title={t('nav.mock', lang)} />}>
        <ScrollView className="flex-1 mt-1" contentContainerClassName="gap-4 pb-2">
          <Card className="gap-4">
            <View className="items-center gap-2">
              <View
                className={`px-4 py-2 rounded-full border ${
                  passed
                    ? 'bg-emerald-100 dark:bg-emerald-900/60 border-emerald-200 dark:border-emerald-700'
                    : 'bg-rose-100 dark:bg-rose-900/60 border-rose-200 dark:border-rose-700'
                }`}
              >
                <UIText
                  variant="subtitle"
                  className={`uppercase tracking-[0.12em] ${
                    passed ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'
                  }`}
                >
                  {passed ? t('mock.pass', lang) : t('mock.fail', lang)}
                </UIText>
              </View>

              <UIText variant="title" className="text-slate-900 dark:text-slate-50">
                {score} / {maxScore}
              </UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {t('mock.passingScore', lang)} {test.minbody} {t('study.points', lang)}
              </UIText>
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

          <Card className="gap-3">
            <View className="flex-row items-center justify-between">
              <UIText variant="subtitle">Results</UIText>
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
                {Object.keys(results).length} / {test.pocet}
              </UIText>
            </View>
            <View className="gap-3">
              {Object.keys(results).map((qNoStr) => {
                const qNo = parseInt(qNoStr, 10);
                const isCorrect = results[qNoStr];
                const Component = isCorrect ? View : Pressable;
                return (
                  <Component
                    key={qNoStr}
                    onPress={isCorrect ? undefined : () => handleQuestionDetailPress(qNoStr)}
                    className={`px-5 py-4 rounded-xl border flex-row items-center justify-between min-h-[56px] ${
                      isCorrect
                        ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 dark:bg-rose-900/40 border-rose-200 dark:border-rose-800 active:opacity-80'
                    }`}
                  >
                    <UIText variant="body" className="text-base font-semibold">Question {qNo}</UIText>
                    <View
                      className={`px-3 py-1 rounded-full ${
                        isCorrect ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                      }`}
                    >
                      <UIText
                        variant="caption"
                        className={`font-semibold ${isCorrect ? 'text-emerald-700 dark:text-emerald-200' : 'text-rose-700 dark:text-rose-200'}`}
                      >
                        {isCorrect ? 'Correct' : 'Wrong'}
                      </UIText>
                    </View>
                  </Component>
                );
              })}
            </View>
          </Card>
        </ScrollView>

        {/* Question Detail Modal */}
        <Modal
          visible={selectedQuestionDetail !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedQuestionDetail(null)}
        >
          <Pressable
            className="flex-1 bg-black/50 dark:bg-black/50"
            onPress={() => setSelectedQuestionDetail(null)}
            style={{ paddingTop: insets.top }}
          >
            <View
              onStartShouldSetResponder={() => true}
              className="flex-1 px-4"
              style={{ 
                paddingTop: 8,
                paddingBottom: Math.max(insets.bottom, 8)
              }}
            >
              {selectedQuestionDetail && (() => {
                const { question, userAnswer } = selectedQuestionDetail;
                const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;
                
                return (
                  <Card 
                    className="flex-1 bg-white dark:bg-slate-900" 
                    style={{ backgroundColor: colorScheme === 'dark' ? '#0f172a' : '#ffffff' }}
                  >
                    <View className="flex-1" style={{ minHeight: 0 }}>
                      <ScrollView 
                        style={{ flex: 1 }}
                        contentContainerStyle={{ flexGrow: 1 }}
                        showsVerticalScrollIndicator={true}
                        nestedScrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                        bounces={true}
                        scrollEnabled={true}
                      >
                        <View className="mb-4">
                          <UIText variant="subtitle" className="mb-2">
                            Question {selectedQuestionDetail.qNo}
                          </UIText>
                        </View>

                        <UIText variant="body" className="mb-4">
                          {question.text}
                        </UIText>

                        {imageSource ? (
                          <View className="my-4" style={{ marginLeft: -16, marginRight: -16, paddingHorizontal: 16 }}>
                            <AspectImage
                              source={imageSource}
                              maxHeight={300}
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
                            const isCorrectAnswer = answerNum === question.correct;
                            const isUserAnswer = answerNum === userAnswer;
                            
                            let buttonClassName = 'w-full ';
                            let textClassName = '';
                            
                            if (isCorrectAnswer) {
                              buttonClassName += 'bg-emerald-500 dark:bg-emerald-600 border border-emerald-400/60';
                              textClassName = 'text-white dark:text-white';
                            } else if (isUserAnswer) {
                              buttonClassName += 'bg-rose-500 dark:bg-rose-600 border border-rose-400/60';
                              textClassName = 'text-white dark:text-white';
                            } else {
                              buttonClassName += 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600';
                              textClassName = 'text-slate-700 dark:text-slate-300';
                            }

                            return (
                              <View key={index} className="gap-1">
                                {(isCorrectAnswer || isUserAnswer) && (
                                  <UIText 
                                    variant="caption" 
                                    className={isCorrectAnswer ? 'text-emerald-700 dark:text-emerald-200 font-semibold' : 'text-rose-700 dark:text-rose-200 font-semibold'}
                                  >
                                    {isCorrectAnswer ? '✓ Correct Answer' : '✗ Your Answer'}
                                  </UIText>
                                )}
                                <View className={buttonClassName + ' px-5 py-3 rounded-xl items-center justify-center min-h-[48px]'}>
                                  <UIText variant="body" className={textClassName + ' font-semibold'}>
                                    {answer}
                                  </UIText>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>

                      <View className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <Button
                          onPress={() => setSelectedQuestionDetail(null)}
                          variant="outline"
                          className="w-full"
                        >
                          Close
                        </Button>
                      </View>
                    </View>
                  </Card>
                );
              })()}
            </View>
          </Pressable>
        </Modal>
      </Screen>
    );
  }

  // Fixed header with time and question navigation
  const renderHeader = () => {
    const timerElement = timeRemaining > 0 ? (
      <View className="px-3 py-1.5 rounded-full bg-indigo-600 dark:bg-indigo-500 border border-indigo-400/40 shadow-sm items-center" style={{ minWidth: 60 }}>
        <UIText variant="body" className="text-white font-bold text-sm font-mono">
          {formatTime(timeRemaining)}
        </UIText>
      </View>
    ) : null;

    const counterElement = (
      <View className="px-3 py-1.5 rounded-full bg-white/90 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70 items-center" style={{ minWidth: 70 }}>
        <UIText variant="body" className="text-slate-900 dark:text-slate-100 font-semibold text-sm">
          {currentQuestion} / {test.pocet}
        </UIText>
      </View>
    );

    const rightElement = (
      <View className="flex-row items-center gap-2">
        {counterElement}
        {timerElement}
      </View>
    );

    return (
      <View className="bg-slate-50 dark:bg-slate-950 pb-2 border-b border-slate-200/70 dark:border-slate-800/70">
        <Header showBack={true} rightElement={rightElement} />
        {/* Question navigation bar */}
      <ScrollView
        ref={questionScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-2 mt-1"
        contentContainerStyle={{ paddingHorizontal: 8 }}
      >
        <View className="flex-row gap-1">
          {Array.from({ length: test.pocet }, (_, i) => i + 1).map((qNo) => {
            const qNoStr = String(qNo);
            const hasAnswer = answers[qNoStr] !== undefined;
            const isCurrent = qNo === currentQuestion;
            const isDark = colorScheme === 'dark';

            // Determine styles based on state and theme
            let backgroundColor, borderColor, shadowStyle, textColor;
            if (isCurrent) {
              backgroundColor = isDark ? '#6366f1' : '#4f46e5'; // indigo-500/600
              borderColor = isDark ? '#6366f1' : '#4338ca'; // indigo-500/700
              shadowStyle = { shadowColor: '#6366f1', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 2 };
              textColor = '#ffffff';
            } else if (hasAnswer) {
              backgroundColor = isDark ? 'rgba(67, 56, 202, 0.6)' : '#e0e7ff'; // indigo-900/60 or indigo-100
              borderColor = isDark ? '#4338ca' : '#818cf8'; // indigo-700 or indigo-300
              textColor = isDark ? '#c7d2fe' : '#4338ca'; // indigo-200 or indigo-700
            } else {
              backgroundColor = isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.8)'; // slate-900/70 or white/80
              borderColor = isDark ? '#334155' : '#e2e8f0'; // slate-700 or slate-200
              textColor = isDark ? '#cbd5e1' : '#334155'; // slate-300 or slate-700
            }

            return (
              <Pressable
                key={qNo}
                onPress={() => handleQuestionNavigation(qNo)}
                className="w-10 h-10 rounded-full items-center justify-center border"
                style={{
                  backgroundColor,
                  borderColor,
                  ...(isCurrent ? shadowStyle : {}),
                }}
              >
                <UIText
                  variant="body"
                  className="font-semibold text-sm"
                  style={{ color: textColor }}
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
  };

  // Current question display
  const renderCurrentQuestion = () => {
    const qNoStr = String(currentQuestion);
    const question = getQuestionFromTest(test, currentQuestion);
    if (!question) return null;

    const userAnswer = answers[qNoStr];
    const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

    return (
      <ScrollView 
        ref={contentScrollRef}
        className="flex-1" 
        contentContainerClassName="gap-4 pb-8"
      >
        <Card>
          <UIText variant="subtitle" className="mb-2">
            Question {currentQuestion} ({question.points} {t('study.points', lang)})
          </UIText>

          <UIText variant="body" className="mb-4">
            {question.text}
          </UIText>

          {imageSource ? (
            <View className="my-4">
              <AspectImage
                source={imageSource}
                maxHeight={300}
                maxWidth={400}
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
