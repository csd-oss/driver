import { getTests, getQuestionFromTest } from './bank';
import { getCategoryForQuestion } from './categories';

/**
 * "Who goes first?": a timed game built from the intersection situations in
 * the question bank (every question whose image is a driver's-eye crossing).
 *
 * Each situation is classified into one interaction:
 *   order    tap the vehicles in the order they cross (chips)
 *   pick     tap the one vehicle the question asks for (chips)
 *   ordinal  tap first / second / third / last (chips)
 *   choice   plain three-answer question (long or unusual answers)
 * Everything is derived from the answer texts, so no hand annotation.
 */

export const ROUND_SIZE = 10;
export const LIVES = 3;
export const TIME_LIMIT_MS = 20000;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 100;
export const STREAK_STEP = 0.1;
export const MAX_MULTIPLIER = 2;

/** Canonical chip order; also the order of chips for "order" items. */
export const VEHICLES = ['you', 'tram', 'red', 'blue', 'green', 'yellow'];
export const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'];

// Images of the "traffic situations at intersections" category.
export const isSituationImage = (path) => /^obr3\/ds\/|^2023\/\d+_DS/.test(path || '');

const COLOURS = {
  1: { 'modré': 'blue', 'zelené': 'green', 'žlté': 'yellow', 'červené': 'red' },
  2: { blue: 'blue', green: 'green', yellow: 'yellow', red: 'red' },
  3: { 'kék': 'blue', 'zöld': 'green', 'sárga': 'yellow', 'piros': 'red' },
};

const ORDINAL_WORDS = {
  1: { 'prvé': 'first', 'druhé': 'second', 'tretie': 'third', 'štvrté': 'fourth', 'posledné': 'last' },
  2: { first: 'first', second: 'second', third: 'third', fourth: 'fourth', last: 'last' },
  3: { 'elsőként': 'first', 'másodikként': 'second', 'harmadikként': 'third', 'negyedikként': 'fourth', 'utolsóként': 'last' },
};

// Whole-answer patterns ("the green vehicle.") and bare sequence segments ("green").
const PATTERNS = {
  1: {
    vehicle: /^(modré|zelené|žlté|červené) vozidlo$/,
    you: /^vaše vozidlo$/,
    tram: /^električka$/,
    segment: /^(modré|zelené|žlté|červené)$/,
    ordinal: /^(prvé|druhé|tretie|štvrté|posledné)$/,
  },
  2: {
    vehicle: /^the (blue|green|yellow|red) vehicle$/,
    you: /^your vehicle$/,
    tram: /^the tram$/,
    segment: /^(blue|green|yellow|red)$/,
    ordinal: /^the (first|second|third|fourth|last) one$/,
  },
  3: {
    vehicle: /^a (kék|zöld|sárga|piros) jármű$/,
    you: /^(az )?ön járműve$/,
    tram: /^a villamos$/,
    segment: /^a (kék|zöld|sárga|piros)$/,
    ordinal: /^(elsőként|másodikként|harmadikként|negyedikként|utolsóként)$/,
  },
};

// "X at the same time as Y" answers become a paired chip. The second vehicle
// is in an oblique case in Slovak and Hungarian, so it gets its own table.
const SECOND_VEHICLE = {
  1: {
    pattern: /^(.+?) súčasne (?:s|so) (.+?)$/,
    words: {
      'modrým': 'blue', 'zeleným': 'green', 'žltým': 'yellow', 'červeným': 'red',
      'modrým vozidlom': 'blue', 'zeleným vozidlom': 'green', 'žltým vozidlom': 'yellow', 'červeným vozidlom': 'red',
      'vaším vozidlom': 'you', 'električkou': 'tram',
    },
  },
  2: {
    pattern: /^(.+?) at the same time as (.+?)$/,
    words: {
      'the blue': 'blue', 'the green': 'green', 'the yellow': 'yellow', 'the red': 'red',
      'the blue vehicle': 'blue', 'the green vehicle': 'green', 'the yellow vehicle': 'yellow', 'the red vehicle': 'red',
      'the blue one': 'blue', 'the green one': 'green', 'the yellow one': 'yellow', 'the red one': 'red',
      'your vehicle': 'you', 'the tram': 'tram',
    },
  },
  3: {
    pattern: /^(.+?) (a kékkel|a zölddel|a sárgával|a pirossal|a villamossal|az ön járművével|ön járművével) egyszerre$/,
    words: {
      'a kékkel': 'blue', 'a zölddel': 'green', 'a sárgával': 'yellow', 'a pirossal': 'red',
      'a villamossal': 'tram', 'az ön járművével': 'you', 'ön járművével': 'you',
    },
  },
};

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!]+$/g, '')
    .trim();

const langOf = (lang) => (lang >= 1 && lang <= 3 ? lang : 1);

/** Vehicle key for a whole answer such as "the green vehicle.", or null. */
export const parseVehicle = (text, lang) => {
  const l = langOf(lang);
  const p = PATTERNS[l];
  const t = normalize(text);
  if (p.you.test(t)) return 'you';
  if (p.tram.test(t)) return 'tram';
  const m = t.match(p.vehicle);
  return m ? COLOURS[l][m[1]] : null;
};

/**
 * One or two vehicle keys for a whole answer: "the red vehicle." gives
 * ['red'], "the red vehicle at the same time as the blue." gives
 * ['red', 'blue']. Null when the answer is anything else.
 */
export const parseVehicleGroup = (text, lang) => {
  const single = parseVehicle(text, lang);
  if (single) return [single];
  const l = langOf(lang);
  const rule = SECOND_VEHICLE[l];
  const m = normalize(text).match(rule.pattern);
  if (!m) return null;
  const first = parseVehicle(m[1], l);
  const second = rule.words[m[2].trim()];
  if (!first || !second || first === second) return null;
  return [first, second];
};

/** Ordinal key for a whole answer such as "the second one.", or null. */
export const parseOrdinal = (text, lang) => {
  const l = langOf(lang);
  const m = normalize(text).match(PATTERNS[l].ordinal);
  return m ? ORDINAL_WORDS[l][m[1]] : null;
};

const parseSegment = (segment, lang) => {
  const l = langOf(lang);
  const p = PATTERNS[l];
  const t = normalize(segment);
  if (p.you.test(t)) return 'you';
  if (p.tram.test(t)) return 'tram';
  const m = t.match(p.segment);
  return m ? COLOURS[l][m[1]] : null;
};

/**
 * Crossing order from an answer such as "1. blue, 2. green, 3. your vehicle."
 * Returns the vehicle keys in order, or null when any step is not a single
 * vehicle (simultaneous crossings, free text, fewer than two steps).
 */
export const parseSequence = (text, lang) => {
  const raw = String(text || '');
  if (!/^\s*1\s*\./.test(raw)) return null;
  const segments = raw.split(/\d+\s*\./).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const keys = segments.map((s) => parseSegment(s, lang));
  if (keys.some((k) => !k)) return null;
  if (new Set(keys).size !== keys.length) return null;
  return keys;
};

const sameSet = (lists) => {
  const first = [...lists[0]].sort().join(',');
  return lists.every((l) => l.length === lists[0].length && [...l].sort().join(',') === first);
};

/**
 * Decide how a question is played. Returns the game item or null when the
 * question is not an intersection situation.
 */
export const classifyQuestion = (question, lang, category = null) => {
  if (!question || !isSituationImage(question.image)) return null;
  const answers = question.answers || [];
  const base = {
    qid: question.qid,
    text: question.text,
    image: question.image,
    points: question.points,
    answers,
    correct: question.correct,
    category,
  };
  if (answers.length < 2) return { ...base, type: 'choice' };

  const sequences = answers.map((a) => parseSequence(a, lang));
  if (sequences.every(Boolean) && sameSet(sequences)) {
    const sequence = sequences[question.correct - 1];
    return {
      ...base,
      type: 'order',
      sequence,
      chips: VEHICLES.filter((v) => sequence.includes(v)).map((key) => ({ key, keys: [key] })),
      answerSequences: sequences,
    };
  }

  const groups = answers.map((a) => parseVehicleGroup(a, lang));
  const groupKeys = groups.map((g) => (g ? g.join('+') : null));
  if (groups.every(Boolean) && new Set(groupKeys).size === groups.length) {
    return {
      ...base,
      type: 'pick',
      chips: groups.map((keys, i) => ({ key: keys.join('+'), keys, answerIndex: i + 1 })),
    };
  }

  const ordinals = answers.map((a) => parseOrdinal(a, lang));
  if (ordinals.every(Boolean) && new Set(ordinals).size === ordinals.length) {
    return {
      ...base,
      type: 'ordinal',
      chips: ordinals.map((key, i) => ({ key, keys: [key], answerIndex: i + 1 })),
    };
  }

  return { ...base, type: 'choice' };
};

const itemCache = {};

/** All playable situations for a language, one per question id. */
export const getGameItems = (lang) => {
  const l = langOf(lang);
  if (itemCache[l]) return itemCache[l];
  const seen = new Set();
  const items = [];
  for (const test of getTests(l)) {
    for (let qNo = 1; qNo <= test.pocet; qNo++) {
      const question = getQuestionFromTest(test, qNo);
      if (!question || seen.has(question.qid) || !isSituationImage(question.image)) continue;
      seen.add(question.qid);
      const item = classifyQuestion(question, l, getCategoryForQuestion(test, qNo));
      if (item) items.push(item);
    }
  }
  itemCache[l] = items;
  return items;
};

/** Which answer (1-based) a tapped order corresponds to, or -1 if none listed. */
export const answerIndexForSequence = (item, sequence) => {
  if (!item.answerSequences) return -1;
  const key = sequence.join(',');
  const index = item.answerSequences.findIndex((s) => s.join(',') === key);
  return index >= 0 ? index + 1 : -1;
};

const shuffle = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** A round: `size` distinct situations in random order. */
export const createRound = (lang, { size = ROUND_SIZE, random = Math.random } = {}) =>
  shuffle(getGameItems(lang), random).slice(0, size);

/**
 * Points for one answer. Wrong answers score nothing. A correct answer earns
 * BASE_POINTS plus a speed bonus that decays linearly over the time limit,
 * multiplied by the current streak (10% per consecutive correct answer,
 * capped at 2x).
 */
export const scoreAnswer = ({ correct, elapsedMs, streak = 0 }) => {
  if (!correct) return 0;
  const fraction = Math.max(0, Math.min(1, 1 - elapsedMs / TIME_LIMIT_MS));
  const bonus = Math.round(MAX_SPEED_BONUS * fraction);
  const multiplier = Math.min(MAX_MULTIPLIER, 1 + STREAK_STEP * Math.max(0, streak));
  return Math.round((BASE_POINTS + bonus) * multiplier);
};
