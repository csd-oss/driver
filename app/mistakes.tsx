import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Header } from '@/components/ui/header';
import { getLanguage } from '@/src/lib/settings';
import { loadProgress, saveProgress } from '@/src/lib/storage';
import { findQuestionById } from '@/src/lib/bank';
import { applyAnswer } from '@/src/lib/engine';
import { IMAGE_MANIFEST } from '@/data/imageManifest';
import { t } from '@/src/i18n/i18n';

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
  const scrollViewRef = useRef(null);
  const nextButtonRef = useRef(null);
  const [lang, setLang] = useState(1);
  const [mistakes, setMistakes] = useState([]);
  const [shuffledMistakes, setShuffledMistakes] = useState([]);
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
        // Shuffle the mistakes list for random order
        const shuffled = shuffleArray(mistakeList);
        setShuffledMistakes(shuffled);
        loadQuestion(shuffled[0], currentLang);
        setCurrentIndex(0);
      } else {
        setQuestion(null);
        setCurrentIndex(0);
        setShuffledMistakes([]);
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
    
    // Re-shuffle the remaining mistakes
    if (updatedMistakes.length > 0) {
      const shuffled = shuffleArray(updatedMistakes);
      setShuffledMistakes(shuffled);
      // Update current index if current question was removed
      if (!updatedMistakes.includes(question.qid)) {
        setCurrentIndex(0);
      } else {
        const newIndex = shuffled.indexOf(question.qid);
        if (newIndex !== -1) {
          setCurrentIndex(newIndex);
        }
      }
    } else {
      setShuffledMistakes([]);
    }
  };

  const handleNext = () => {
    const updatedMistakes = progress.mistakesByLang?.[String(lang)] || [];
    
    if (updatedMistakes.length === 0) {
      setQuestion(null);
      setCurrentIndex(0);
      setShuffledMistakes([]);
      return;
    }
    
    // Use shuffled mistakes list, re-shuffle if needed
    let currentShuffled = shuffledMistakes;
    
    // If shuffled list is empty or doesn't match current mistakes, re-shuffle
    if (currentShuffled.length === 0 || 
        currentShuffled.length !== updatedMistakes.length ||
        !currentShuffled.every(qid => updatedMistakes.includes(qid))) {
      currentShuffled = shuffleArray(updatedMistakes);
      setShuffledMistakes(currentShuffled);
    }
    
    // Pick a random next question from the shuffled list
    // Avoid picking the same question if there are multiple options
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
      loadQuestion(currentShuffled[nextIndex], lang);
      setCurrentIndex(nextIndex);
      setMistakes(updatedMistakes);
    } else {
      setQuestion(null);
    }
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

  if (mistakes.length === 0) {
    return (
      <Screen header={<Header title={t('nav.mistakes', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
          <UIText variant="title">{t('mistakes.empty', lang)}</UIText>
        </View>
      </Screen>
    );
  }

  if (!question) {
    return (
      <Screen header={<Header title={t('nav.mistakes', lang)} />}>
        <View className="flex-1 items-center justify-center mt-1">
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
    <Screen header={<Header title={t('nav.mistakes', lang)} />}>
      <ScrollView 
        ref={scrollViewRef}
        className="flex-1 mt-1" 
        contentContainerClassName={`gap-4 ${isAnswered ? 'pb-8' : 'pb-2'}`}
      >
        <Card className="gap-4">
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
            <View className="my-4 items-center">
              <Image
                source={imageSource}
                style={{ width: 300, maxHeight: 300, resizeMode: 'contain' }}
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
                    isAnswered && isCorrectAnswer ? 'bg-green-500 dark:bg-green-600 border border-green-400/60' : ''
                  }`}
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
              {t('mistakes.next', lang)}
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
