import { data } from '../../data/data5.js';

/**
 * Get list of categories for a language
 * Uses the first test of that language to extract category names
 * @param {number} lang - Language index (1, 2, or 3)
 * @returns {Array<string>} Array of category text strings
 */
export const getCategories = (lang) => {
  if (lang < 1 || lang > 3) {
    console.warn(`Invalid language: ${lang}, defaulting to 1`);
    lang = 1;
  }
  
  const tests = data[lang - 1];
  if (!tests || tests.length === 0) {
    return [];
  }
  
  const test = tests[0];
  if (!test || !test.okruhy) {
    return [];
  }
  
  // Convert okruhy object to array and extract txt values
  // okruhy structure: { "1": [{txt, zacina}], "2": [{txt, zacina}], ... }
  const okruhyArray = Object.values(test.okruhy)
    .map(arr => arr[0]) // Extract first element from each array
    .filter(okruh => okruh && okruh.txt); // Filter out invalid entries
  
  // Sort by zacina to ensure consistent order
  okruhyArray.sort((a, b) => (a.zacina || 0) - (b.zacina || 0));
  
  return okruhyArray.map(okruh => okruh.txt);
};

/**
 * Determine category for a question inside a test
 * @param {Object} test - Test object with okruhy and pocet
 * @param {number} qNo - Question number (1-based)
 * @returns {string|null} Category text or null if not found
 */
export const getCategoryForQuestion = (test, qNo) => {
  if (!test || !test.okruhy || typeof qNo !== 'number') {
    return null;
  }
  
  // Convert okruhy object to array
  const okruhyArray = Object.values(test.okruhy)
    .map(arr => arr[0])
    .filter(okruh => okruh && okruh.txt && typeof okruh.zacina === 'number');
  
  if (okruhyArray.length === 0) {
    return null;
  }
  
  // Sort by zacina
  okruhyArray.sort((a, b) => a.zacina - b.zacina);
  
  // Find which okruh range the question falls into
  for (let i = 0; i < okruhyArray.length; i++) {
    const okruh = okruhyArray[i];
    const start = okruh.zacina;
    
    // Determine end: next okruh's zacina - 1, or test.pocet if last
    let end;
    if (i < okruhyArray.length - 1) {
      end = okruhyArray[i + 1].zacina - 1;
    } else {
      end = test.pocet || start;
    }
    
    // Check if question number falls in this range
    if (qNo >= start && qNo <= end) {
      return okruh.txt;
    }
  }
  
  // Question number outside all ranges
  return null;
};
