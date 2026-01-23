import { data } from '../../data/data5.js';

// Cached question indices per language
const questionIndices = {};

/**
 * Get all tests for a language
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {Array} Array of test objects
 */
export const getTests = (lang) => {
  if (lang < 1 || lang > 3) {
    console.warn(`Invalid language: ${lang}, defaulting to 1`);
    lang = 1;
  }
  return data[lang - 1] || [];
};

/**
 * Get a random test from the language dataset
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {Object|null} Random test object or null
 */
export const getRandomTest = (lang) => {
  const tests = getTests(lang);
  if (tests.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * tests.length);
  return tests[randomIndex];
};

/**
 * Get a normalized question object from a test
 * @param {Object} test - Test object
 * @param {number|string} qNo - Question number (1-based)
 * @returns {Object|null} Normalized question object
 */
export const getQuestionFromTest = (test, qNo) => {
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
  const answers = answersData.map(a => a.odpoved || '');
  
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

/**
 * Get a random question across all tests for a language
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {Object|null} Normalized question object
 */
export const flattenRandomQuestion = (lang) => {
  const tests = getTests(lang);
  if (tests.length === 0) return null;
  
  // Pick a random test
  const randomTestIndex = Math.floor(Math.random() * tests.length);
  const test = tests[randomTestIndex];
  
  if (!test || !test.pocet) return null;
  
  // Pick a random question number
  const randomQNo = Math.floor(Math.random() * test.pocet) + 1;
  
  return getQuestionFromTest(test, randomQNo);
};

/**
 * Build a question index for fast lookup by qid
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {Object} Map of qid -> { testIndex, qNo }
 */
export const buildQuestionIndex = (lang) => {
  if (questionIndices[lang]) {
    return questionIndices[lang];
  }
  
  const tests = getTests(lang);
  const index = {};
  
  tests.forEach((test, testIndex) => {
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

/**
 * Find a question by its ID
 * @param {number} lang - Language index (1, 2, or 3)
 * @param {string} qid - Question ID
 * @returns {Object|null} Normalized question object
 */
export const findQuestionById = (lang, qid) => {
  const index = buildQuestionIndex(lang);
  const entry = index[qid];
  
  if (!entry) {
    return null;
  }
  
  const tests = getTests(lang);
  const test = tests[entry.testIndex];
  
  if (!test) {
    return null;
  }
  
  return getQuestionFromTest(test, entry.qNo);
};

/**
 * Get test object for a question ID
 * Useful for category computation
 * @param {number} lang - Language index (1, 2, or 3)
 * @param {string} qid - Question ID
 * @returns {Object|null} Test object or null
 */
export const getTestForQuestion = (lang, qid) => {
  const index = buildQuestionIndex(lang);
  const entry = index[qid];
  
  if (!entry) {
    return null;
  }
  
  const tests = getTests(lang);
  return tests[entry.testIndex] || null;
};
