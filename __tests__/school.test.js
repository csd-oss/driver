/**
 * The driving-school link (src/lib/school.ts): code handling, the sync payload, and the sync
 * flow against a mocked server and DB. The flag is on for these tests.
 */
const mockRunAsync = jest.fn().mockResolvedValue({ changes: 1 });
const mockGetFirstAsync = jest.fn();
const mockGetAllAsync = jest.fn().mockResolvedValue([]);

jest.mock('../src/db/index', () => ({
  database: { runAsync: mockRunAsync, getFirstAsync: mockGetFirstAsync, getAllAsync: mockGetAllAsync },
  db: {},
}));
jest.mock('../src/db/device', () => ({ getDeviceId: jest.fn().mockResolvedValue('device-7') }));
jest.mock('../src/lib/flags', () => ({ SCHOOLS_ENABLED: true, SCHOOLS_API_URL: 'http://schools.test' }));
jest.mock('../src/lib/settings', () => ({
  getLanguage: jest.fn().mockResolvedValue(1),
  getReadinessMode: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/lib/readiness', () => ({
  getReadinessForecast: jest.fn().mockResolvedValue({
    score: 71,
    label: 'gettingThere',
    components: { mistakes: 90, performance: 88, mockExam: 60, coverage: 40, overall: 71 },
    mistakesCount: 6,
    dueMistakesCount: 2,
    accuracy7d: 88,
    mockHistory: [{ passed: true }, { passed: false }],
    daysToReady: 14,
    unseenCount: 585,
  }),
}));
jest.mock('../src/db/queries/engagement', () => ({ getCurrentStreak: jest.fn().mockResolvedValue(3) }));
jest.mock('../src/db/queries/stats', () => ({
  getQuestionsSeenCount: jest.fn().mockResolvedValue(390),
  getDailyStats: jest.fn().mockResolvedValue([{ attempts: 20 }, { attempts: 35 }]),
}));
jest.mock('../src/lib/bank', () => ({
  buildQuestionIndex: jest.fn(() => Object.fromEntries(Array.from({ length: 975 }, (_, i) => [String(i), {}]))),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.49' }));

const {
  buildSyncPayload,
  isPlausibleJoinCode,
  joinSchool,
  normalizeJoinCode,
  SYNC_MIN_INTERVAL_MS,
  syncWithSchool,
} = require('../src/lib/school');

const linkedRow = (lastSync) => ({
  school_token: 'tok',
  school_name: 'Autoškola Demo',
  school_group_name: 'B-2026-09',
  school_student_name: 'Test Žiak',
  school_linked_at: 1_760_000_000,
  school_last_sync_at: lastSync,
});

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

describe('join codes', () => {
  it('normalises what people type', () => {
    expect(normalizeJoinCode(' b312-97 76 ')).toBe('B3129776');
    expect(isPlausibleJoinCode('b3129776')).toBe(true);
    expect(isPlausibleJoinCode('b312')).toBe(false);
  });
});

describe('buildSyncPayload', () => {
  it('maps the unsynced rows and the forecast to the server shape', () => {
    const payload = buildSyncPayload({
      lang: 1,
      attempts: [
        { id: 'a1', question_id: 1469, mode: 'study', category_text: 'Pravidlá', is_correct: 1, response_time_ms: 4000, answer_submitted_at: 1_760_000_100 },
      ],
      mockExams: [{ id: 'm1', score: 94, max_score: 100, min_to_pass: 90, passed: 1, duration_sec: null, completed_at: 1_760_000_200 }],
      examResults: [{ id: 'e1', passed: 0, points: 86, max_points: 100, min_to_pass: 90, readiness_score: null, taken_at: 1_760_000_300 }],
      forecast: {
        score: 71,
        label: 'gettingThere',
        components: { mistakes: 90, performance: 88, mockExam: 60, coverage: 40 },
        mistakesCount: 6,
        dueMistakesCount: 2,
        accuracy7d: 88,
        mockHistory: [{ passed: true }, { passed: false }],
        daysToReady: 14,
      },
      streak: 3,
      seenCount: 390,
      totalQuestions: 975,
      attempts7d: 55,
    });
    expect(payload.attempts[0]).toEqual({
      id: 'a1',
      question_id: '1469',
      mode: 'study',
      category_text: 'Pravidlá',
      is_correct: true,
      response_time_ms: 4000,
      answered_at: 1_760_000_100,
    });
    expect(payload.mock_exams[0]).toMatchObject({ id: 'm1', passed: true, duration_sec: null });
    expect(payload.exam_results[0]).toMatchObject({ id: 'e1', passed: false, readiness_score: null });
    expect(payload.snapshot).toMatchObject({
      readiness_score: 71,
      readiness_label: 'gettingThere',
      total_questions: 975,
      seen_count: 390,
      mistakes_count: 6,
      due_mistakes_count: 2,
      accuracy_7d: 88,
      attempts_7d: 55,
      mocks_taken: 2,
      mocks_passed: 1,
      days_to_ready: 14,
      streak: 3,
    });
  });

  it('sends no snapshot when the forecast is unavailable', () => {
    const payload = buildSyncPayload({ lang: 2, attempts: [], mockExams: [], examResults: [], forecast: null, streak: 0, seenCount: 0, totalQuestions: 985, attempts7d: 0 });
    expect(payload.snapshot).toBeNull();
    expect(payload.lang).toBe(2);
  });
});

describe('syncWithSchool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('does nothing when no school is linked', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ school_token: null });
    expect(await syncWithSchool()).toEqual({ status: 'not_linked' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('is throttled to once per ten minutes unless forced', async () => {
    const recent = Math.floor(Date.now() / 1000) - 60;
    mockGetFirstAsync.mockResolvedValue(linkedRow(recent));
    expect(await syncWithSchool()).toEqual({ status: 'skipped' });
    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch.mockResolvedValueOnce(jsonResponse(200, { synced_at: '2026-10-17T10:00:00Z' }));
    expect((await syncWithSchool({ force: true })).status).toBe('synced');
    expect(SYNC_MIN_INTERVAL_MS).toBe(600000);
  });

  it('posts the unsynced rows with the token and marks them synced afterwards', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    mockGetFirstAsync.mockResolvedValue(linkedRow(old));
    mockGetAllAsync
      .mockResolvedValueOnce([{ id: 'a1', question_id: '1', mode: 'study', category_text: null, is_correct: 1, response_time_ms: 1, answer_submitted_at: 1 }])
      .mockResolvedValueOnce([{ id: 'm1', score: 90, max_score: 100, min_to_pass: 90, passed: 1, duration_sec: 600, completed_at: 2 }])
      .mockResolvedValueOnce([]);
    global.fetch.mockResolvedValueOnce(jsonResponse(200, { synced_at: '2026-10-17T10:00:00Z' }));
    const outcome = await syncWithSchool();
    expect(outcome).toEqual({ status: 'synced', attempts: 1, mockExams: 1, examResults: 0 });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('http://schools.test/api/v1/app/sync');
    expect(init.headers.authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.attempts).toHaveLength(1);
    expect(body.snapshot.total_questions).toBe(975);
    expect(body.snapshot.attempts_7d).toBe(55);
    const updates = mockRunAsync.mock.calls.map((c) => c[0]);
    expect(updates.some((sql) => sql.startsWith('UPDATE answer_attempts SET synced_at'))).toBe(true);
    expect(updates.some((sql) => sql.startsWith('UPDATE mock_exams SET synced_at'))).toBe(true);
    expect(updates.some((sql) => sql.includes('school_last_sync_at = ?'))).toBe(true);
  });

  it('keeps rows unsynced when the server fails, and drops the link on 401', async () => {
    mockGetFirstAsync.mockResolvedValue(linkedRow(null));
    global.fetch.mockResolvedValueOnce(jsonResponse(500, { detail: 'boom' }));
    expect((await syncWithSchool()).status).toBe('error');
    expect(mockRunAsync.mock.calls.some((c) => String(c[0]).includes('synced_at = ?'))).toBe(false);
    global.fetch.mockResolvedValueOnce(jsonResponse(401, { code: 'unauthorized' }));
    expect((await syncWithSchool()).status).toBe('unauthorized');
    expect(mockRunAsync.mock.calls.some((c) => String(c[0]).includes('school_token = NULL'))).toBe(true);
  });

  it('reports offline when fetch throws', async () => {
    mockGetFirstAsync.mockResolvedValue(linkedRow(null));
    global.fetch.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect((await syncWithSchool()).status).toBe('offline');
  });
});

describe('joinSchool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('rejects a malformed code before touching the network', async () => {
    await expect(joinSchool('abc')).rejects.toMatchObject({ code: 'bad_code' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('stores the link and resets the sync marks so the whole history is sent', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, { token: 't', school_name: 'Autoškola Demo', group_name: 'B-2026-09', student_name: 'Test Žiak', linked_at: '2026-10-17T09:00:00Z' })
    );
    const result = await joinSchool('b312-9776', { firstName: 'Test', lastName: 'Žiak' });
    expect(result).toEqual({ schoolName: 'Autoškola Demo', groupName: 'B-2026-09', studentName: 'Test Žiak' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ code: 'B3129776', device_id: 'device-7', lang: 1, first_name: 'Test', last_name: 'Žiak', app_version: '1.0.49' });
    const sql = mockRunAsync.mock.calls.map((c) => c[0]);
    expect(sql.some((q) => q.includes('school_token = ?'))).toBe(true);
    expect(sql.filter((q) => q.includes('SET synced_at = NULL'))).toHaveLength(3);
  });

  it('surfaces the server code for a group code without a name', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse(422, { code: 'name_required', detail: 'Zadajte meno' }));
    await expect(joinSchool('B3129776')).rejects.toMatchObject({ status: 422, code: 'name_required' });
  });
});
