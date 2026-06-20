import { useState, useCallback, useRef, useEffect } from 'react';
import { ActivityIndicator, View, ScrollView } from 'react-native';
import { AspectImage } from '@/components/ui/aspect-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { getCachedLanguage, getLanguage, getSelectedCategory, setSelectedCategory } from '@/src/lib/settings';
import { findQuestionById, getTestForQuestion } from '@/src/lib/bank';
import { getCategoryForQuestion } from '@/src/lib/categories';
import { applyAnswer } from '@/src/lib/engine';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';
import { CategorySelector } from '@/components/CategorySelector';
import * as MistakesDB from '@/src/db/queries/mistakes';
import * as StudySessionDB from '@/src/db/queries/studySessions';
import * as AttemptsDB from '@/src/db/queries/attempts';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import * as Haptics from 'expo-haptics';
import { usePostHog } from 'posthog-react-native';

// Fisher-Yates shuffle algorithm
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export default function MistakesScreen() {
  const router = useRouter();
  const posthog = usePostHog();
  const scrollViewRef = useRef(null);
  const nextButtonRef = useRef(null);
  const questionCardRef = useRef(null);
  const hasRecordedAnswer = useRef(false);
  const sessionIdRef = useRef(null);
  const sessionStartTimeRef = useRef(null);
  const questionShownAtRef = useRef(null);
  const questionsAnsweredRef = useRef(0);
  const correctCountRef = useRef(0);
  const [lang, setLang] = useState(getCachedLanguage);
  const [selectedCategory, setSelectedCategoryState] = useState('all');
  const [mistakes, setMistakes] = useState([]);
  const [filteredMistakes, setFilteredMistakes] = useState([]);
  const [shuffledMistakes, setShuffledMistakes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [streak, setStreakState] = useState(0);

  // Filter mistakes by category
  const filterMistakesByCategory = useCallback((mistakeList, currentLang, category) => {
    if (category === 'all') {
      return mistakeList;
    }
    
    return mistakeList.filter(qid => {
      const test = getTestForQuestion(currentLang, qid);
      if (!test) return false;
      
      const question = findQuestionById(currentLang, qid);
      if (!question || !question.qNo) return false;
      
      const questionCategory = getCategoryForQuestion(test, question.qNo);
      return questionCategory === category;
    });
  }, []);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const category = await getSelectedCategory(currentLang);
    setSelectedCategoryState(category);
    
    // Create study session
    const sessionId = await StudySessionDB.createStudySession({
      lang: currentLang,
      mode: 'mistakes',
      categoryText: category === 'all' ? null : category,
    });
    sessionIdRef.current = sessionId;
    sessionStartTimeRef.current = new Date();
    questionsAnsweredRef.current = 0;
    correctCountRef.current = 0;
    
    // Load mistakes from database
    const mistakeList = await MistakesDB.getMistakes(currentLang);
    setMistakes(mistakeList);
    
    // Filter mistakes by category
    const filtered = filterMistakesByCategory(mistakeList, currentLang, category);
    setFilteredMistakes(filtered);
    
    if (filtered.length > 0) {
      // Shuffle the filtered mistakes list for random order
      const shuffled = shuffleArray(filtered);
      setShuffledMistakes(shuffled);
      await loadQuestion(shuffled[0], currentLang);
      setCurrentIndex(0);
    } else {
      setQuestion(null);
      setCurrentIndex(0);
      setShuffledMistakes([]);
    }
  }, [filterMistakesByCategory]);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Mistakes');
      
      loadData();
      
      // Cleanup: end session when leaving screen
      return () => {
        if (sessionIdRef.current && sessionStartTimeRef.current) {
          const durationSeconds = Math.round(
            (Date.now() - sessionStartTimeRef.current.getTime()) / 1000
          );
          
          trackEvent(posthog, 'study_session_ended', {
            session_id: sessionIdRef.current,
            mode: 'mistakes',
            duration_seconds: durationSeconds,
            questions_answered: questionsAnsweredRef.current,
            correct_count: correctCountRef.current,
            category: selectedCategory,
            language: lang,
          });
          
          StudySessionDB.endStudySession(
            sessionIdRef.current,
            questionsAnsweredRef.current,
            correctCountRef.current
          );
        }
      };
    }, [loadData, posthog])
  );

  const loadQuestion = async (qid, currentLang) => {
    const q = findQuestionById(currentLang, qid);
    
    // Reset flags for new question
    hasRecordedAnswer.current = false;
    questionShownAtRef.current = new Date();
    
    setQuestion(q);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setIsCorrect(false);
  };

  const handleAnswer = async (answerIndex) => {
    if (isAnswered || !question || hasRecordedAnswer.current) return;
    
    setSelectedAnswer(answerIndex);
    setIsAnswered(true);
    
    const correct = answerIndex === question.correct;
    setIsCorrect(correct);

    Haptics.notificationAsync(
      correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    // Track session metrics
    questionsAnsweredRef.current += 1;
    if (correct) {
      correctCountRef.current += 1;
    }
    
    const answerSubmittedAt = new Date();
    
    // Update mistakes using new DB functions
    await applyAnswer(null, lang, question.qid, correct);
    
    // Get category for the question
    let categoryText = null;
    if (selectedCategory !== 'all') {
      categoryText = selectedCategory;
    } else {
      const test = getTestForQuestion(lang, question.qid);
      if (test && question.qNo) {
        categoryText = getCategoryForQuestion(test, question.qNo);
      }
    }
    
    // Check if question was in mistakes
    const wasInMistakes = true; // Always true in mistakes screen
    
    // Log answer attempt with timing
    await AttemptsDB.logAnswerAttempt({
      lang,
      questionId: question.qid,
      mode: 'mistakes',
      sessionId: sessionIdRef.current,
      categoryText,
      selectedAnswerIndex: answerIndex,
      correctAnswerIndex: question.correct,
      isCorrect: correct,
      points: question.points,
      questionShownAt: questionShownAtRef.current,
      answerSubmittedAt,
      wasInMistakes,
    });
    
    hasRecordedAnswer.current = true;
    
    // Sync mistakes counts for header/category (same as Smart Study: stay on this question until "Next")
    const updatedMistakes = await MistakesDB.getMistakes(lang);
    setMistakes(updatedMistakes);
    const filtered = filterMistakesByCategory(updatedMistakes, lang, selectedCategory);
    setFilteredMistakes(filtered);
  };

  const handleNext = async () => {
    // Reload mistakes from DB
    const updatedMistakes = await MistakesDB.getMistakes(lang);
    
    // Filter by category
    const filtered = filterMistakesByCategory(updatedMistakes, lang, selectedCategory);
    setFilteredMistakes(filtered);
    
    if (filtered.length === 0) {
      setQuestion(null);
      setCurrentIndex(0);
      setShuffledMistakes([]);
      return;
    }
    
    // Use shuffled mistakes list, re-shuffle if needed
    let currentShuffled = shuffledMistakes;
    
    // If shuffled list is empty or doesn't match filtered mistakes, re-shuffle
    if (currentShuffled.length === 0 || 
        currentShuffled.length !== filtered.length ||
        !currentShuffled.every(qid => filtered.includes(qid))) {
      currentShuffled = shuffleArray(filtered);
      setShuffledMistakes(currentShuffled);
    }
    
    // Pick a random next question from the shuffled list
    let nextIndex;
    if (currentShuffled.length === 1) {
      nextIndex = 0;
    } else {
      // Pick a random index, but avoid the current one
      do {
        nextIndex = Math.floor(Math.random() * currentShuffled.length);
      } while (currentShuffled.length > 1 && 
               question && 
               currentShuffled[nextIndex] === question.qid);
    }
    
    if (currentShuffled[nextIndex]) {
      await loadQuestion(currentShuffled[nextIndex], lang);
      setCurrentIndex(nextIndex);
      setMistakes(updatedMistakes);
    } else {
      setQuestion(null);
    }
  };

  const handleCategoryChange = async (categoryTxt: string | 'all') => {
    await setSelectedCategory(lang, categoryTxt);
    setSelectedCategoryState(categoryTxt);
    
    // End current session and start new one
    if (sessionIdRef.current) {
      await StudySessionDB.endStudySession(sessionIdRef.current, 0, 0);
    }
    
    const newSessionId = await StudySessionDB.createStudySession({
      lang,
      mode: 'mistakes',
      categoryText: categoryTxt === 'all' ? null : categoryTxt,
    });
    sessionIdRef.current = newSessionId;
    
    // Re-filter mistakes
    const filtered = filterMistakesByCategory(mistakes, lang, categoryTxt);
    setFilteredMistakes(filtered);
    
    if (filtered.length > 0) {
      const shuffled = shuffleArray(filtered);
      setShuffledMistakes(shuffled);
      await loadQuestion(shuffled[0], lang);
      setCurrentIndex(0);
    } else {
      setQuestion(null);
      setCurrentIndex(0);
      setShuffledMistakes([]);
    }
  };

  // Auto-scroll to Next button when answer is submitted
  useEffect(() => {
    if (isAnswered && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isAnswered]);

  // Get streak from database
  useEffect(() => {
    if (question?.qid) {
      MistakesDB.getStreak(lang, question.qid).then(setStreakState);
    }
  }, [lang, question?.qid]);

  // Show empty state if no mistakes at all — celebrate and route the user
  // somewhere productive instead of dead-ending.
  if (mistakes.length === 0) {
    return (
      <Screen testID="screen.mistakes" header={<Header title={t('nav.mistakes', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1 px-2 gap-4">
          <UIText variant="title" className="text-center">{t('mistakes.empty', lang)}</UIText>
          <UIText variant="body" className="text-center text-slate-600 dark:text-slate-300">
            {t('mistakes.emptyHint', lang)}
          </UIText>
          <View className="w-full gap-3 mt-2">
            <Button
              onPress={() => router.replace('/study')}
              variant="default"
              className="w-full"
            >
              {t('home.smartStudyCta', lang)}
            </Button>
            <Button
              onPress={() => router.replace('/mock')}
              variant="outline"
              className="w-full"
            >
              {t('home.mock', lang)}
            </Button>
          </View>
        </View>
      </Screen>
    );
  }

  // Show empty state if mistakes exist but none in selected category
  if (filteredMistakes.length === 0 && mistakes.length > 0) {
    return (
      <Screen testID="screen.mistakes" header={<Header title={t('nav.mistakes', lang)} />}>
        <ScrollView 
          ref={scrollViewRef}
          className="flex-1 mt-1" 
          contentContainerClassName="gap-4 pb-2"
        >
          <CategorySelector
            lang={lang}
            selectedCategory={selectedCategory}
            onSelect={handleCategoryChange}
          />
          <Card className="gap-4 items-center py-8">
            <UIText variant="body" className="text-center mb-4">
              {t('mistakes.noInCategory', lang)}
            </UIText>
            <Button
              onPress={() => handleCategoryChange('all')}
              variant="default"
              className="w-full"
            >
              {t('mistakes.showAll', lang)}
            </Button>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  if (!question) {
    return (
      <Screen testID="screen.mistakes" header={<Header title={t('nav.mistakes', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <UIText variant="body">{t('mistakes.notFound', lang)}</UIText>
          <Button onPress={loadData} variant="default" className="mt-4">
            {t('mistakes.reload', lang)}
          </Button>
        </View>
      </Screen>
    );
  }

  const mastery = Math.floor(streak / 2);

  const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

  return (
    <Screen testID="screen.mistakes" header={<Header title={t('nav.mistakes', lang)} />}>
      <ScrollView 
        ref={scrollViewRef}
        className="flex-1 mt-1" 
        contentContainerClassName={`gap-4 ${isAnswered ? 'pb-8' : 'pb-2'}`}
      >
        <CategorySelector
          lang={lang}
          selectedCategory={selectedCategory}
          onSelect={handleCategoryChange}
        />
        
        <Card ref={questionCardRef} className="gap-4">
          <View className="flex-row items-center justify-between">
            <UIText variant="caption" className="uppercase tracking-[0.1em] text-amber-500">
              {t('nav.mistakes', lang)}
            </UIText>
            {mastery > 0 && (
              <View className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60">
                <UIText variant="caption">
                  {t('mistakes.mastery', lang)}: {mastery}
                </UIText>
              </View>
            )}
          </View>

          <UIText variant="body" className="mb-1">
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

          <View className="gap-3 mt-4">
            {question.answers.map((answer, index) => {
              const answerNum = index + 1;
              const isSelected = selectedAnswer === answerNum;
              const isCorrectAnswer = answerNum === question.correct;
              
              let buttonVariant = 'outline';
              let buttonClassName = 'w-full ';
              
              if (isAnswered) {
                if (isCorrectAnswer) {
                  // Keep the 'outline' variant: the 'default' variant's indigo bg
                  // was overriding emerald (correct answers showed purple).
                  // opacity-100 keeps the colour vivid despite the disabled state.
                  buttonClassName += 'bg-emerald-500 dark:bg-emerald-600 border border-emerald-400/60 opacity-100';
                } else if (isSelected && !isCorrect) {
                  buttonClassName += 'bg-rose-500 dark:bg-rose-600 border border-rose-400/60 opacity-100';
                }
              }

              // Non-color cue so correctness is clear without relying on
              // green/red alone (accessibility: Differentiate Without Color).
              const feedbackPrefix = isAnswered
                ? isCorrectAnswer
                  ? '✓  '
                  : isSelected && !isCorrect
                    ? '✗  '
                    : ''
                : '';

              return (
                <Button
                  key={index}
                  onPress={() => handleAnswer(answerNum)}
                  variant={buttonVariant}
                  disabled={isAnswered}
                  className={buttonClassName}
                  textClassName={isAnswered && (isCorrectAnswer || (isSelected && !isCorrect)) ? 'text-white dark:text-white' : ''}
                >
                  {`${feedbackPrefix}${answer}`}
                </Button>
              );
            })}
          </View>

          {isAnswered && (
            <View className="mt-4 p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70">
              <UIText
                variant="subtitle"
                className={isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
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
          <View ref={nextButtonRef}>
            <Button onPress={handleNext} variant="default" className="w-full">
              {t('mistakes.next', lang)}
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
