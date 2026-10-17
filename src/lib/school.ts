/**
 * The driving-school link: join a school with a code, push practice progress to it, leave.
 * Everything here is opt-in and behind `SCHOOLS_ENABLED`; the app works exactly as before
 * when nothing is linked. Server API: schools/server/src/api/app.rs.
 *
 * What gets sent on a sync (and nothing else): the student's own answer events, finished mock
 * exams and real-exam results that have `synced_at IS NULL`, plus a snapshot of the readiness
 * numbers the home screen shows. Rows are marked synced only after the server said 200, and the
 * server upserts by the app's ids, so a retry can never double-count.
 */
import * as Application from 'expo-application';
import { getDeviceId } from '../db/device';
import * as SchoolLinkDB from '../db/queries/schoolLink';
import * as SyncDB from '../db/queries/sync';
import * as EngagementDB from '../db/queries/engagement';
import * as StatsDB from '../db/queries/stats';
import { buildQuestionIndex } from './bank';
import { SCHOOLS_API_URL, SCHOOLS_ENABLED } from './flags';
import { getReadinessForecast } from './readiness';
import { getLanguage, getReadinessMode } from './settings';

export type { SchoolLink } from '../db/queries/schoolLink';

/** Don't sync on every focus: at most once per this many ms unless forced. */
export const SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;

export class SchoolApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'SchoolApiError';
    this.status = status;
    this.code = code;
  }
}

/** Uppercase, letters and digits only: what a person typed from a screen or a printout. */
export const normalizeJoinCode = (input: string): string =>
  input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export const isPlausibleJoinCode = (input: string): boolean => normalizeJoinCode(input).length === 8;

async function call<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${SCHOOLS_API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new SchoolApiError(0, 'network', 'network');
  }
  const text = response.status === 204 ? '' : await response.text();
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!response.ok) {
    throw new SchoolApiError(response.status, parsed?.code ?? `http_${response.status}`, parsed?.detail ?? `HTTP ${response.status}`);
  }
  return parsed as T;
}

export interface JoinResult {
  schoolName: string;
  groupName: string | null;
  studentName: string;
}

/**
 * Join with a code. A personal code links the student the school created; a group code needs a
 * name the first time (the server answers 422 `name_required` without one).
 */
export async function joinSchool(code: string, name?: { firstName: string; lastName: string }): Promise<JoinResult> {
  if (!SCHOOLS_ENABLED) throw new SchoolApiError(0, 'disabled', 'disabled');
  const normalized = normalizeJoinCode(code);
  if (normalized.length !== 8) throw new SchoolApiError(400, 'bad_code', 'bad_code');
  const deviceId = await getDeviceId();
  const lang = await getLanguage();
  const res = await call<{
    token: string;
    school_name: string;
    group_name: string | null;
    student_name: string;
    linked_at: string;
  }>('/api/v1/app/join', {
    code: normalized,
    device_id: deviceId,
    lang,
    app_version: Application.nativeApplicationVersion ?? undefined,
    first_name: name?.firstName,
    last_name: name?.lastName,
  });
  await SchoolLinkDB.saveSchoolLink({
    token: res.token,
    schoolName: res.school_name,
    groupName: res.group_name,
    studentName: res.student_name,
    linkedAt: new Date(res.linked_at),
  });
  // A fresh link sends the whole history, so the school sees everything so far.
  await SyncDB.resetSyncMarks();
  return { schoolName: res.school_name, groupName: res.group_name, studentName: res.student_name };
}

export const getSchoolLink = SchoolLinkDB.getSchoolLink;

/** Revoke the token on the server (best effort) and forget the link locally. */
export async function leaveSchool(): Promise<void> {
  const link = await SchoolLinkDB.getSchoolLink();
  if (link) {
    try {
      await call('/api/v1/app/unlink', {}, link.token);
    } catch {
      // Offline or already revoked: the local side is what matters to the user.
    }
  }
  await SchoolLinkDB.clearSchoolLink();
}

export interface SyncPayload {
  lang: number;
  attempts: {
    id: string;
    question_id: string;
    mode: string;
    category_text: string | null;
    is_correct: boolean;
    response_time_ms: number;
    answered_at: number;
  }[];
  mock_exams: {
    id: string;
    score: number;
    max_score: number;
    min_to_pass: number;
    passed: boolean;
    duration_sec: number | null;
    completed_at: number;
  }[];
  exam_results: {
    id: string;
    passed: boolean;
    points: number;
    max_points: number;
    min_to_pass: number;
    readiness_score: number | null;
    taken_at: number;
  }[];
  snapshot: {
    readiness_score: number;
    readiness_label: string;
    total_questions: number;
    seen_count: number;
    mistakes_count: number;
    due_mistakes_count: number;
    accuracy_7d: number | null;
    attempts_7d: number;
    mocks_taken: number;
    mocks_passed: number;
    days_to_ready: number | null;
    streak: number;
    components: Record<string, number>;
  } | null;
}

/** Pure: the request body from the unsynced rows and the home screen's readiness numbers. */
export function buildSyncPayload({
  lang,
  attempts,
  mockExams,
  examResults,
  forecast,
  streak,
  seenCount,
  totalQuestions,
  attempts7d,
}: {
  lang: number;
  attempts: SyncDB.UnsyncedAttempt[];
  mockExams: SyncDB.UnsyncedMockExam[];
  examResults: SyncDB.UnsyncedExamResult[];
  forecast: Awaited<ReturnType<typeof getReadinessForecast>> | null;
  streak: number;
  seenCount: number;
  totalQuestions: number;
  attempts7d: number;
}): SyncPayload {
  return {
    lang,
    attempts: attempts.map((a) => ({
      id: a.id,
      question_id: String(a.question_id),
      mode: a.mode,
      category_text: a.category_text ?? null,
      is_correct: Boolean(a.is_correct),
      response_time_ms: Number(a.response_time_ms) || 0,
      answered_at: Number(a.answer_submitted_at),
    })),
    mock_exams: mockExams.map((m) => ({
      id: m.id,
      score: Number(m.score) || 0,
      max_score: Number(m.max_score),
      min_to_pass: Number(m.min_to_pass),
      passed: Boolean(m.passed),
      duration_sec: m.duration_sec === null ? null : Number(m.duration_sec),
      completed_at: Number(m.completed_at),
    })),
    exam_results: examResults.map((e) => ({
      id: e.id,
      passed: Boolean(e.passed),
      points: Number(e.points),
      max_points: Number(e.max_points),
      min_to_pass: Number(e.min_to_pass),
      readiness_score: e.readiness_score === null ? null : Number(e.readiness_score),
      taken_at: Number(e.taken_at),
    })),
    snapshot: forecast
      ? {
          readiness_score: forecast.score,
          readiness_label: forecast.label,
          total_questions: totalQuestions,
          seen_count: seenCount,
          mistakes_count: forecast.mistakesCount,
          due_mistakes_count: forecast.dueMistakesCount,
          accuracy_7d: forecast.accuracy7d,
          attempts_7d: attempts7d,
          mocks_taken: forecast.mockHistory.length,
          mocks_passed: forecast.mockHistory.filter((m: { passed: boolean }) => m.passed).length,
          days_to_ready: forecast.daysToReady,
          streak,
          components: {
            mistakes: forecast.components.mistakes,
            performance: forecast.components.performance,
            mockExam: forecast.components.mockExam,
            coverage: forecast.components.coverage,
          },
        }
      : null,
  };
}

export interface SyncOutcome {
  status: 'synced' | 'skipped' | 'not_linked' | 'unauthorized' | 'offline' | 'error';
  attempts?: number;
  mockExams?: number;
  examResults?: number;
}

let syncInFlight: Promise<SyncOutcome> | null = null;

/**
 * Push unsynced progress to the linked school. Returns what happened; never throws. `force`
 * ignores the ten-minute throttle (the "Sync now" button). A 401 means the school revoked the
 * link: the local link is dropped so the UI shows the join screen again.
 */
export async function syncWithSchool({ force = false }: { force?: boolean } = {}): Promise<SyncOutcome> {
  if (!SCHOOLS_ENABLED) return { status: 'not_linked' };
  if (syncInFlight) {
    if (!force) return syncInFlight;
    // A forced sync (after a join, or the button) runs after the one in flight, never instead of it.
    await syncInFlight.catch(() => undefined);
  }
  const run = doSync(force).finally(() => {
    if (syncInFlight === run) syncInFlight = null;
  });
  syncInFlight = run;
  return run;
}

/** How many rounds of SYNC_BATCH one sync drains at most (a long history goes up in one go). */
const MAX_ROUNDS = 10;

async function doSync(force: boolean): Promise<SyncOutcome> {
  const link = await SchoolLinkDB.getSchoolLink();
  if (!link) return { status: 'not_linked' };
  if (!force && link.lastSyncAt && Date.now() - link.lastSyncAt.getTime() < SYNC_MIN_INTERVAL_MS) {
    return { status: 'skipped' };
  }
  const lang = await getLanguage();
  let forecast: Awaited<ReturnType<typeof getReadinessForecast>> | null = null;
  try {
    forecast = await getReadinessForecast(lang, { useConservative: await getReadinessMode() });
  } catch {
    forecast = null;
  }
  let streak = 0;
  let seenCount = 0;
  let attempts7d = 0;
  try {
    streak = await EngagementDB.getCurrentStreak(lang);
    seenCount = await StatsDB.getQuestionsSeenCount(lang);
    attempts7d = (await StatsDB.getDailyStats(lang, 7)).reduce((sum, day) => sum + day.attempts, 0);
  } catch {
    // Thin snapshot; the server recounts from the events anyway.
  }
  const totalQuestions = Object.keys(buildQuestionIndex(lang)).length;

  const totals = { attempts: 0, mockExams: 0, examResults: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const [attempts, mockExams, examResults] = await Promise.all([
      SyncDB.getUnsyncedAttempts(lang),
      SyncDB.getUnsyncedMockExams(lang),
      SyncDB.getUnsyncedExamResults(lang),
    ]);
    // The snapshot describes the whole history; send it with the last batch only.
    const lastRound = attempts.length < SyncDB.SYNC_BATCH && mockExams.length < SyncDB.SYNC_BATCH;
    const payload = buildSyncPayload({
      lang,
      attempts,
      mockExams,
      examResults,
      forecast: lastRound ? forecast : null,
      streak,
      seenCount,
      totalQuestions,
      attempts7d,
    });
    try {
      const res = await call<{ synced_at: string }>('/api/v1/app/sync', payload, link.token);
      // The link may have changed while the request was out (left, joined elsewhere): then this
      // answer belongs to the old school and must not mark anything.
      const current = await SchoolLinkDB.getSchoolLink();
      if (!current || current.token !== link.token) return { status: 'not_linked' };
      const at = new Date(res.synced_at);
      await SyncDB.markSynced('answer_attempts', attempts.map((a) => a.id), at);
      await SyncDB.markSynced('mock_exams', mockExams.map((m) => m.id), at);
      await SyncDB.markSynced('exam_results', examResults.map((e) => e.id), at);
      await SchoolLinkDB.setSchoolLastSync(at);
      totals.attempts += attempts.length;
      totals.mockExams += mockExams.length;
      totals.examResults += examResults.length;
      if (lastRound) break;
    } catch (error) {
      if (error instanceof SchoolApiError) {
        if (error.status === 401) {
          const current = await SchoolLinkDB.getSchoolLink();
          if (current && current.token === link.token) await SchoolLinkDB.clearSchoolLink();
          return { status: 'unauthorized' };
        }
        if (error.status === 0) return { status: 'offline' };
      }
      return { status: 'error' };
    }
  }
  return { status: 'synced', ...totals };
}
