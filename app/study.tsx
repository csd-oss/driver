import { useState, useCallback, useRef, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { AspectImage } from '@/components/ui/aspect-image';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { getLanguage, getSelectedCategory, setSelectedCategory } from '@/src/lib/settings';
import { loadProgress, saveProgress } from '@/src/lib/storage';
import { applyAnswer } from '@/src/lib/engine';
import { recordStudyAttempt, recordQuestionSeen, updateStreak } from '@/src/lib/stats';
import { getSmartQuestion, pushRecent } from '@/src/lib/smartPractice';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';
import { CategorySelector } from '@/components/CategorySelector';

export default function StudyScreen() {
  const scrollViewRef = useRef(null);
  const nextButtonRef = useRef(null);
  const questionCardRef = useRef(null);
  const hasRecordedAnswer = useRef(false);
  const hasRecordedSeen = useRef(false);
  const recentQuestionIds = useRef([]);
  const [lang, setLang] = useState(1);
  const [selectedCategory, setSelectedCategoryState] = useState('all');
  const [question, setQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [progress, setProgress] = useState({ mistakesByLang: {}, streaksByLang: {} });

  const loadData = useCallback(async () => {
    const currentLang = await getLanguage();
    setLang(currentLang);
    
    const category = await getSelectedCategory(currentLang);
    setSelectedCategoryState(category);
    
    const loadedProgress = await loadProgress();
    if (loadedProgress) {
      setProgress(loadedProgress);
    }
    
    loadNewQuestion(currentLang, category);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const loadNewQuestion = async (currentLang, category = selectedCategory) => {
    // Use Smart Practice algorithm
    const q = await getSmartQuestion({
      lang: currentLang,
      selectedCategory: category,
      recentIds: recentQuestionIds.current,
    });
    
    // Reset flags for new question
    hasRecordedAnswer.current = false;
    hasRecordedSeen.current = false;
    
    // Track question as seen when it loads
    if (q && !hasRecordedSeen.current) {
      await recordQuestionSeen({ lang: currentLang, qid: q.qid });
      hasRecordedSeen.current = true;
    }
    
    // Add to recent list
    if (q && q.qid) {
      recentQuestionIds.current = pushRecent(q.qid, recentQuestionIds.current, 20);
    }
    
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
    
    // Update progress
    const updatedProgress = applyAnswer(
      progress,
      lang,
      question.qid,
      correct
    );
    setProgress(updatedProgress);
    await saveProgress(updatedProgress);
    
    // Record stats (only once per question)
    if (!hasRecordedAnswer.current) {
      await recordStudyAttempt({
        lang,
        category: selectedCategory === 'all' ? null : selectedCategory,
        isCorrect: correct,
      });
      await updateStreak({ lang, isMockPass: false });
      hasRecordedAnswer.current = true;
    }
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
    await setSelectedCategory(lang, categoryTxt);
    setSelectedCategoryState(categoryTxt);
    loadNewQuestion(lang, categoryTxt);
  };

  // Auto-scroll to Next button when answer is submitted
  useEffect(() => {
    if (isAnswered && scrollViewRef.current) {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isAnswered]);

  if (!question) {
    return (
      <Screen header={<Header title={t('nav.study', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <UIText variant="body">Loading...</UIText>
        </View>
      </Screen>
    );
  }

  const imageSource = question.image ? IMAGE_MANIFEST[question.image] : null;

  return (
    <Screen header={<Header title={t('nav.study', lang)} />}>
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
            <UIText variant="caption" className="uppercase tracking-[0.1em] text-indigo-500">
              {t('nav.study', lang)}
            </UIText>
            <UIText variant="caption" className="text-slate-500 dark:text-slate-400">
              {t('study.points', lang)}: {question.points}
            </UIText>
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
                  buttonVariant = 'default';
                  buttonClassName += 'bg-emerald-500 dark:bg-emerald-600 border border-emerald-400/60';
                } else if (isSelected && !isCorrect) {
                  // Wrong selected answer - use red/purple background
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
          <View ref={nextButtonRef}>
            <Button onPress={handleNext} variant="default" className="w-full">
              {t('study.next', lang)}
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
