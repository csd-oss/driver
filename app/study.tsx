import { CategorySelector } from '@/components/CategorySelector';
import { AspectImage } from '@/components/ui/aspect-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { Screen } from '@/components/ui/screen';
import { UIText } from '@/components/ui/text';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import * as AttemptsDB from '@/src/db/queries/attempts';
import * as MistakesDB from '@/src/db/queries/mistakes';
import * as StudySessionDB from '@/src/db/queries/studySessions';
import { t } from '@/src/i18n/i18n';
import { getTests } from '@/src/lib/bank';
import { getCategoryForQuestion } from '@/src/lib/categories';
import { applyAnswer } from '@/src/lib/engine';
import { getCachedLanguage, getLanguage, getSelectedCategory, setSelectedCategory } from '@/src/lib/settings';
import { getSmartQuestion, pushRecent } from '@/src/lib/smartPractice';
import { trackEvent, trackScreenView } from '@/src/lib/analytics';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { usePostHog } from 'posthog-react-native';

/**
 * Get user-facing label for a reason
 */
const getReasonLabel = (reason: any, lang: number) => {
  if (!reason || !reason.type) return '';
  
  switch (reason.type) {
    case 'mistake':
      return t('study.reason.mistake', lang);
    case 'shaky':
      return t('study.reason.shaky', lang);
    case 'unseen':
      return t('study.reason.unseen', lang);
    case 'weak':
      const category = reason.category || '';
      const template = t('study.reason.weak', lang);
      return template.replace('{category}', category);
    case 'random':
      return t('study.reason.random', lang);
    default:
      return '';
  }
};

export default function StudyScreen() {
  const posthog = usePostHog();
  const scrollViewRef = useRef(null);
  const nextButtonRef = useRef(null);
  const questionCardRef = useRef(null);
  const hasRecordedAnswer = useRef(false);
  const recentQuestionIds = useRef<string[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const questionShownAtRef = useRef<Date | null>(null);
  const questionsAnsweredRef = useRef<number>(0);
  const correctCountRef = useRef<number>(0);
  const [lang, setLang] = useState(getCachedLanguage);
  const [selectedCategory, setSelectedCategoryState] = useState('all');
  const [question, setQuestion] = useState<any>(null);
  const [reason, setReason] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const category = await getSelectedCategory(currentLang);
    setSelectedCategoryState(category);
    
    // Initialize recent questions from DB to preserve window across app exits
    const recentFromDb = await AttemptsDB.getRecentQuestionIds(currentLang, 20);
    recentQuestionIds.current = recentFromDb;
    
    // Create study session
    const sessionId = await StudySessionDB.createStudySession({
      lang: currentLang,
      mode: 'study',
      categoryText: category === 'all' ? undefined : category,
    });
    sessionIdRef.current = sessionId;
    sessionStartTimeRef.current = new Date();
    questionsAnsweredRef.current = 0;
    correctCountRef.current = 0;
    
    loadNewQuestion(currentLang, category);
  }, []);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(posthog, 'Study');
      
      loadData();
      
      // Cleanup: end session when leaving screen
      return () => {
        if (sessionIdRef.current && sessionStartTimeRef.current) {
          const durationSeconds = Math.round(
            (Date.now() - sessionStartTimeRef.current.getTime()) / 1000
          );
          
          trackEvent(posthog, 'study_session_ended', {
            session_id: sessionIdRef.current,
            mode: 'study',
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

  const loadNewQuestion = async (currentLang: number, category: string = selectedCategory) => {
    // Use Smart Practice algorithm
    const result: any = await getSmartQuestion({
      lang: currentLang,
      selectedCategory: category,
      recentIds: recentQuestionIds.current,
    });
    
    // Reset flags for new question
    hasRecordedAnswer.current = false;
    questionShownAtRef.current = new Date();
    
    if (!result || !result.question) {
      setQuestion(null);
      setReason(null);
      return;
    }
    
    const q = result.question;
    const r = result.reason;
    
    // Add to recent list
    if (q && q.qid) {
      recentQuestionIds.current = pushRecent(q.qid, recentQuestionIds.current, 20);
    }
    
    setQuestion(q);
    setReason(r);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setIsCorrect(false);
  };

  const handleAnswer = async (answerIndex: number) => {
    if (isAnswered || !question || hasRecordedAnswer.current) return;
    
    setSelectedAnswer(answerIndex);
    setIsAnswered(true);
    
    const correct = answerIndex === question.correct;
    setIsCorrect(correct);
    
    // Track session metrics
    questionsAnsweredRef.current += 1;
    if (correct) {
      correctCountRef.current += 1;
    }
    
    const answerSubmittedAt = new Date();
    const timeToAnswer = questionShownAtRef.current 
      ? answerSubmittedAt.getTime() - questionShownAtRef.current.getTime()
      : 0;
    
    // Update mistakes using new DB functions
    await applyAnswer(null, lang, question.qid, correct);
    
    // Get category for the question
    let categoryText = null;
    if (selectedCategory !== 'all') {
      categoryText = selectedCategory;
    } else {
      // Try to determine category from question
      const tests = getTests(lang);
      for (const test of tests) {
        const qNo = Object.keys(test.otazky || {}).find(
          qNo => String(test.otazky[qNo]?.[0]?.id) === question.qid
        );
        if (qNo) {
          categoryText = getCategoryForQuestion(test, parseInt(qNo));
          break;
        }
      }
    }
    
    // Check if question was in mistakes
    const wasInMistakes = await MistakesDB.isMistake(lang, question.qid);
    
    // Track answer event
    trackEvent(posthog, 'study_question_answered', {
      question_id: question.qid,
      correct: correct,
      selected_answer: answerIndex,
      correct_answer: question.correct,
      time_ms: timeToAnswer,
      category: categoryText || 'unknown',
      was_in_mistakes: wasInMistakes,
      reason_type: reason?.type || 'unknown',
      language: lang,
    });
    
    // Log answer attempt with timing
    await AttemptsDB.logAnswerAttempt({
      lang,
      questionId: question.qid,
      mode: 'study',
      sessionId: sessionIdRef.current || undefined,
      categoryText: categoryText || undefined,
      selectedAnswerIndex: answerIndex,
      correctAnswerIndex: question.correct,
      isCorrect: correct,
      points: question.points,
      questionShownAt: questionShownAtRef.current!,
      answerSubmittedAt,
      wasInMistakes,
    });
    
    hasRecordedAnswer.current = true;
  };

  const handleNext = () => {
    loadNewQuestion(lang, selectedCategory);
    // Auto-scroll to top of question after loading new question
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
    }
  };

  const handleCategoryChange = async (categoryTxt: string | 'all') => {
    trackEvent(posthog, 'study_category_changed', {
      from_category: selectedCategory,
      to_category: categoryTxt,
      language: lang,
    });
    
    await setSelectedCategory(lang, categoryTxt);
    setSelectedCategoryState(categoryTxt);
    
    // End current session and start new one
    if (sessionIdRef.current) {
      await StudySessionDB.endStudySession(sessionIdRef.current, 0, 0);
    }
    
    const newSessionId = await StudySessionDB.createStudySession({
      lang,
      mode: 'study',
      categoryText: categoryTxt === 'all' ? undefined : categoryTxt,
    });
    sessionIdRef.current = newSessionId;
    
    loadNewQuestion(lang, categoryTxt);
  };

  // Auto-scroll to Next button when answer is submitted
  useEffect(() => {
    if (isAnswered && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isAnswered]);

  if (!question) {
    return (
      <Screen header={<Header title={t('nav.study', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      </Screen>
    );
  }

  const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

  return (
    <Screen testID="screen.study" header={<Header title={t('study.smartTitle', lang)} />}>
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
        
        <View className="px-1 flex-row items-center justify-between">
          {reason && (
            <View className="px-3 py-1 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50">
              <UIText variant="caption" className="text-slate-700 dark:text-slate-300 text-sm">
                {getReasonLabel(reason, lang)}
              </UIText>
            </View>
          )}
          <View className="px-3 py-1 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50">
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400 text-sm">
              {t('study.points', lang)}: {question.points}
            </UIText>
          </View>
        </View>
        
        <Card ref={questionCardRef} className="gap-4">
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
            {question.answers.map((answer: string, index: number) => {
              const answerNum = index + 1;
              const isSelected = selectedAnswer === answerNum;
              const isCorrectAnswer = answerNum === question.correct;
              
              let buttonVariant = 'outline';
              let buttonClassName = 'w-full ';
              
              if (isAnswered) {
                if (isCorrectAnswer) {
                  buttonVariant = 'default';
                  buttonClassName += 'bg-emerald-500 dark:bg-emerald-600 border border-emerald-400/60';
                } else if (isSelected && !isCorrect) {
                  buttonClassName += 'bg-rose-500 dark:bg-rose-600 border border-rose-400/60';
                }
              }

              return (
                <Button
                  key={index}
                  onPress={() => handleAnswer(answerNum)}
                  variant={buttonVariant}
                  disabled={isAnswered}
                  className={buttonClassName}
                  textClassName={isAnswered && (isCorrectAnswer || (isSelected && !isCorrect)) ? 'text-white dark:text-white' : ''}
                  testID={`study.answer.${answerNum}`}
                >
                  {answer}
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
            <Button onPress={handleNext} variant="default" className="w-full" testID="study.next">
              {t('study.next', lang)}
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
