#!/usr/bin/env node
/**
 * Emit SQL that seeds a good-looking demo state for marketing screenshots.
 *
 *   node seed.js | sqlite3 <path-to-driver.db>
 *
 * Seeds Slovak (1), English (2) and Hungarian (3):
 *   - ~14 consecutive days of study answer_attempts at ~85% accuracy
 *     (drives the streak, 7-day accuracy, coverage and readiness score)
 *   - 5 completed mock exams, 4 passed
 *   - 7 mistakes referencing real question ids (so the Mistakes screen
 *     renders actual questions)
 *   - settings flipped to onboarded + language chosen (lang 2 by default;
 *     flip with:  UPDATE settings SET lang=1;  (SK)  or  UPDATE settings SET lang=3;  (HU)
 *
 * Idempotent-ish: deletes prior seed-* rows first.
 */
const { data } = (() => {
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../../data/data5.js'), 'utf8');
  // data5.js is `export const data = [...]`; evaluate just the array.
  const body = src.replace(/^\s*export\s+const\s+data\s*=/, 'module.exports.data =');
  const m = { exports: {} };
  new Function('module', body)(m);
  return m.exports;
})();

// data = [SK[], EN[], HU[]] with shared ids. Pull distinct ids from EN.
const ids = [];
const seen = new Set();
for (const test of data[1]) {
  const otazky = test.otazky || {};
  for (const k of Object.keys(otazky)) {
    const q = otazky[k] && otazky[k][0];
    if (q && q.id != null && !seen.has(q.id)) { seen.add(q.id); ids.push(q.id); }
  }
}

const POOL = ids.slice(0, 520);            // distinct ids -> coverage
const MISTAKE_IDS = ids.slice(40, 47);     // 7 real ids for the mistakes screen
const DEVICE = 'seed-device';
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const midnight = now - (now % DAY);        // today 00:00 UTC (seconds)

const sql = [];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Full reset — this is a throwaway screenshot DB. Clears both seed rows and
// any real rows the app recorded during prior capture runs (e.g. a mock that
// auto-started when /mock was deep-linked), so numbers stay deterministic.
sql.push("DELETE FROM answer_attempts;");
sql.push("DELETE FROM mock_exams;");
sql.push("DELETE FROM mistakes;");

let n = 0;
for (const lang of [1, 2, 3]) {
  // ---- answer_attempts: 14 days, ~45/day, ~85% correct ----
  for (let d = 13; d >= 0; d--) {
    const dayStart = midnight - d * DAY;
    for (let i = 0; i < 45; i++) {
      const qid = POOL[(d * 45 + i) % POOL.length];
      const correct = ((d * 45 + i) % 20) !== 0 && ((d * 45 + i) % 20) !== 7 && ((d * 45 + i) % 20) !== 13 ? 1 : 0; // ~85%
      const shown = dayStart + 8 * 3600 + i * 47 + (d % 5) * 11;
      const rt = 4200 + ((i * 137) % 9000);
      const submitted = shown + Math.round(rt / 1000);
      const pts = 1 + ((qid % 3));
      const corrIdx = 1 + (qid % 3);
      const selIdx = correct ? corrIdx : 1 + ((qid + 1) % 3);
      sql.push(
        `INSERT INTO answer_attempts (id,device_id,lang,question_id,mode,selected_answer_index,correct_answer_index,is_correct,points,question_shown_at,answer_submitted_at,response_time_ms,was_in_mistakes,created_at) VALUES (`
        + `${q('seed-aa-' + lang + '-' + n)},${q(DEVICE)},${lang},${q(String(qid))},${q('study')},${selIdx},${corrIdx},${correct},${pts},${shown},${submitted},${rt},0,${shown});`
      );
      n++;
    }
  }

  // ---- mock_exams: 5 over the last ~12 days, 4 passed ----
  const mockScores = [92, 95, 88, 96, 94]; // min_to_pass 90 -> one fail (88)
  mockScores.forEach((score, mi) => {
    const completed = midnight - (12 - mi * 3) * DAY + 18 * 3600;
    const passed = score >= 90 ? 1 : 0;
    sql.push(
      `INSERT INTO mock_exams (id,device_id,lang,test_id,started_at,completed_at,duration_sec,score,max_score,min_to_pass,passed,wrong_count,added_to_mistakes_count,created_at) VALUES (`
      + `${q('seed-mock-' + lang + '-' + mi)},${q(DEVICE)},${lang},${q(String(1 + mi))},${completed - 1500},${completed},${1400 + mi * 30},${score},100,90,${passed},${Math.round((100 - score) / 3)},0,${completed});`
    );
  });

  // ---- mistakes: 7 real ids, mix of due-now and upcoming ----
  MISTAKE_IDS.forEach((qid, k) => {
    const created = midnight - (6 - k) * DAY + 9 * 3600;
    const due = midnight + (k - 3) * DAY; // some overdue, some upcoming
    sql.push(
      `INSERT INTO mistakes (id,device_id,lang,question_id,streak_count,next_review_at,interval_days,created_at,updated_at) VALUES (`
      + `${q('seed-mis-' + lang + '-' + k)},${q(DEVICE)},${lang},${q(String(qid))},${k % 3},${due},${[0,1,3,7][k % 4]},${created},${created});`
    );
  });
}

// ---- settings: onboarded, language chosen, default to English ----
// MUST be id=1 — the app reads/creates the settings row at id=1, so an
// auto-incremented id would be ignored and the app would re-show onboarding.
sql.push("DELETE FROM settings;");
sql.push(
  `INSERT INTO settings (id,lang,has_onboarded,has_chosen_language,use_conservative_readiness,analytics_opt_out,notification_morning_enabled,notification_lunch_enabled,notification_evening_enabled,created_at,updated_at) VALUES (1,2,1,1,0,0,1,1,1,${now},${now});`
);

process.stdout.write('BEGIN;\n' + sql.join('\n') + '\nCOMMIT;\n');
process.stderr.write(`seed: ${POOL.length} distinct ids, ${n} attempts/lang-pair, mistakes ${MISTAKE_IDS.join(',')}\n`);
