// data5.js is a 4.8MB untyped JS module; cast to Test[][] below.
import { data } from '../../data/data5.js';

// ---------- Raw shapes (as they live in data5.js) ----------

interface RawQuestion {
  id: number;
  text: string;
  body: number;
  obrazok: string;
  platna: number;
}

interface RawAnswer {
  odpoved: string;
}

interface OkruhEntry {
  txt: string;
  zacina: number;
}

export interface Test {
  pocet: number;
  cas?: number;
  minbody?: number;
  maxbody?: number;
  otazky: Record<string, RawQuestion[]>;
  odpovede: Record<string, RawAnswer[]>;
  okruhy?: Record<string, OkruhEntry[]>;
  [key: string]: unknown;
}

// data5.js exports `data` shaped as [lang1Tests[], lang2Tests[], lang3Tests[]]
const tests = data as Test[][];

// ---------- Normalized shapes used by app code ----------

export interface Question {
  qid: string;
  text: string;
  points: number;
  image: string;
  correct: number;
  answers: string[];
  qNo: number;
}

interface QuestionIndexEntry {
  testIndex: number;
  qNo: number;
}

export type QuestionIndex = Record<string, QuestionIndexEntry>;

// Cached question indices per language
const questionIndices: Record<number, QuestionIndex> = {};

const normalizeLang = (lang: number): number => {
  if (lang < 1 || lang > 3) {
    console.warn(`Invalid language: ${lang}, defaulting to 1`);
    return 1;
  }
  return lang;
};

export const getTests = (lang: number): Test[] => {
  const safeLang = normalizeLang(lang);
  return tests[safeLang - 1] || [];
};

export const getRandomTest = (lang: number): Test | null => {
  const langTests = getTests(lang);
  if (langTests.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * langTests.length);
  return langTests[randomIndex];
};

export const getRandomTestWithIndex = (
  lang: number
): { test: Test; testIndex: number } | null => {
  const langTests = getTests(lang);
  if (langTests.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * langTests.length);
  return {
    test: langTests[randomIndex],
    testIndex: randomIndex,
  };
};

export const getTotalUniqueQuestions = (lang: number): number => {
  const index = buildQuestionIndex(lang);
  return Object.keys(index).length;
};

export const getQuestionFromTest = (test: Test, qNo: number | string): Question | null => {
  if (!test || !test.otazky || !test.odpovede) {
    return null;
  }

  const qNoStr = String(qNo);
  const questionData = test.otazky[qNoStr];
  const answersData = test.odpovede[qNoStr];

  if (!questionData || !questionData[0] || !answersData || answersData.length < 3) {
    return null;
  }

  const q = questionData[0];
  const answers = answersData.map((a) => a.odpoved || '');

  return {
    qid: String(q.id),
    text: q.text || '',
    points: q.body || 0,
    image: q.obrazok || '',
    correct: q.platna || 1,
    answers: answers,
    qNo: parseInt(qNoStr, 10),
  };
};

export const flattenRandomQuestion = (lang: number): Question | null => {
  const langTests = getTests(lang);
  if (langTests.length === 0) return null;

  const randomTestIndex = Math.floor(Math.random() * langTests.length);
  const test = langTests[randomTestIndex];

  if (!test || !test.pocet) return null;

  const randomQNo = Math.floor(Math.random() * test.pocet) + 1;
  return getQuestionFromTest(test, randomQNo);
};

export const buildQuestionIndex = (lang: number): QuestionIndex => {
  if (questionIndices[lang]) {
    return questionIndices[lang];
  }

  const langTests = getTests(lang);
  const index: QuestionIndex = {};

  langTests.forEach((test, testIndex) => {
    if (!test.otazky) return;

    Object.keys(test.otazky).forEach((qNoStr) => {
      const questionData = test.otazky[qNoStr];
      if (questionData && questionData[0] && questionData[0].id) {
        const qid = String(questionData[0].id);
        index[qid] = {
          testIndex,
          qNo: parseInt(qNoStr, 10),
        };
      }
    });
  });

  questionIndices[lang] = index;
  return index;
};

export const findQuestionById = (lang: number, qid: string): Question | null => {
  const index = buildQuestionIndex(lang);
  const entry = index[qid];
  if (!entry) return null;

  const langTests = getTests(lang);
  const test = langTests[entry.testIndex];
  if (!test) return null;

  return getQuestionFromTest(test, entry.qNo);
};

export const getTestForQuestion = (lang: number, qid: string): Test | null => {
  const index = buildQuestionIndex(lang);
  const entry = index[qid];
  if (!entry) return null;

  const langTests = getTests(lang);
  return langTests[entry.testIndex] || null;
};
