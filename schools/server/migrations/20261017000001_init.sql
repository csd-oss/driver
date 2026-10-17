-- Driver for driving schools: the whole MVP schema in one migration (new product, no history to keep).
-- Conventions: ids are uuid v7; instants are timestamptz; calendar days are date; enums are text + CHECK.

CREATE TABLE schools (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  -- Legal identity printed on documents (obchodné meno, IČO, sídlo, registrácia autoškoly).
  legal_name text NOT NULL DEFAULT '',
  ico text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  registration_no text NOT NULL DEFAULT '',
  trade_licence_no text NOT NULL DEFAULT '',
  responsible_person text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX branches_school_idx ON branches(school_id);

-- Staff logins: the school admin (prevádzkovateľ / zodpovedný zástupca) and instructors.
CREATE TABLE users (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'instructor')),
  password_hash text NOT NULL,
  -- Instructor card (inštruktorský preukaz) number and groups it covers; informational.
  instructor_card_no text NOT NULL DEFAULT '',
  instructor_groups text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));
CREATE INDEX users_school_idx ON users(school_id);

-- Staff sessions: 30 days sliding. The cookie holds the raw token; the row keeps its SHA-256.
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_agent text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- A course (kurz / skupina): the unit a school plans theory around. `category` is the licence
-- group (B, A, C…); `jiscd_course_no` is the course number JISCD assigned, so our records can be
-- matched to the official ones.
CREATE TABLE groups (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  branch_id uuid REFERENCES branches(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'B',
  jiscd_course_no text NOT NULL DEFAULT '',
  starts_on date,
  ends_on date,
  exam_on date,
  lead_instructor_id uuid REFERENCES users(id),
  -- Theory lessons the curriculum prescribes for the group's category (32 for B).
  theory_lessons_required integer NOT NULL DEFAULT 32,
  -- Driving lessons (45 min) the curriculum prescribes (39 for B with AT + AC).
  driving_lessons_required integer NOT NULL DEFAULT 39,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'running', 'finished', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX groups_school_idx ON groups(school_id);

-- A student of the school (účastník kurzu). Personal data per zákon 93/2005 § 2b ods. 3.
CREATE TABLE students (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  -- Sequential number in the school's register (poradové číslo z matričnej knihy).
  register_no integer NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date,
  birth_place text NOT NULL DEFAULT '',
  -- Rodné číslo: sensitive; stored only when the school needs it for the exam application.
  personal_id text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  -- Guardian (zákonný zástupca) when the student is under 18 at enrolment.
  guardian_name text NOT NULL DEFAULT '',
  guardian_contact text NOT NULL DEFAULT '',
  guardian_consent_on date,
  -- Documents the law asks for before enrolment (§ 6 ods. 1 písm. h), i); § 2b ods. 2).
  medical_ok_on date,
  psych_ok_on date,
  education_doc_ok boolean NOT NULL DEFAULT false,
  first_aid_ok_on date,
  needs_glasses boolean NOT NULL DEFAULT false,
  -- GDPR: when the privacy notice was handed over / consent for app data sharing given.
  privacy_notice_on date,
  app_consent_on date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, register_no)
);
CREATE INDEX students_school_idx ON students(school_id);

CREATE TABLE enrolments (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id),
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'withdrawn', 'transferred')),
  price_cents integer,
  paid_on date,
  finished_on date,
  certificate_issued_on date,
  UNIQUE (student_id, group_id)
);
CREATE INDEX enrolments_group_idx ON enrolments(group_id);
-- One active course per student (enrol_in moves the previous one to `transferred`).
CREATE UNIQUE INDEX enrolments_one_active_idx ON enrolments(student_id) WHERE status = 'active';

-- A code the student types into the app. Group codes enrol into the group; student codes link one
-- known student. `uses_left` NULL = unlimited until it expires.
CREATE TABLE join_codes (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  group_id uuid REFERENCES groups(id),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  uses_left integer,
  CHECK (group_id IS NOT NULL OR student_id IS NOT NULL)
);

-- One app installation linked to a student. The app keeps the raw token; we keep its hash.
CREATE TABLE app_links (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  lang integer NOT NULL DEFAULT 1,
  app_version text NOT NULL DEFAULT '',
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX app_links_student_idx ON app_links(student_id);

-- Theory lessons (vyučovacie hodiny teórie) planned for a group, with attendance.
CREATE TABLE theory_lessons (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  instructor_id uuid REFERENCES users(id),
  held_on date NOT NULL,
  starts_at time,
  lessons integer NOT NULL DEFAULT 1,
  subject text NOT NULL DEFAULT 'PCP' CHECK (subject IN ('PCP', 'NVU', 'TVV', 'ZBJ', 'OP')),
  topic text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX theory_lessons_group_idx ON theory_lessons(group_id);

CREATE TABLE theory_attendance (
  lesson_id uuid NOT NULL REFERENCES theory_lessons(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT true,
  PRIMARY KEY (lesson_id, student_id)
);

-- Driving lessons (jazdy): simulator (AT), training ground (AC), road traffic (CP), maintenance (PU).
CREATE TABLE driving_lessons (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id),
  instructor_id uuid REFERENCES users(id),
  held_on date NOT NULL,
  starts_at time,
  lessons integer NOT NULL DEFAULT 1,
  kind text NOT NULL DEFAULT 'CP' CHECK (kind IN ('AT', 'AC', 'CP', 'PU')),
  km integer,
  vehicle text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driving_lessons_student_idx ON driving_lessons(student_id);

-- Progress synced from the app. Raw events are copies of the app's own rows (same ids), so a
-- resync is idempotent; `snapshots` is what the app computed at sync time.
CREATE TABLE app_attempts (
  id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lang integer NOT NULL,
  question_id text NOT NULL,
  mode text NOT NULL,
  category_text text,
  is_correct boolean NOT NULL,
  response_time_ms integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL,
  -- The app's row id is unique per installation; a student who moves school keeps their ids, so
  -- identity here is (student, app id) and a resync under a new student is a new row.
  PRIMARY KEY (student_id, id)
);
CREATE INDEX app_attempts_student_idx ON app_attempts(student_id, answered_at);

CREATE TABLE app_mock_exams (
  id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lang integer NOT NULL,
  score integer NOT NULL,
  max_score integer NOT NULL,
  min_to_pass integer NOT NULL,
  passed boolean NOT NULL,
  duration_sec integer,
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (student_id, id)
);
CREATE INDEX app_mock_exams_student_idx ON app_mock_exams(student_id, completed_at);

CREATE TABLE app_exam_results (
  id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lang integer NOT NULL,
  passed boolean NOT NULL,
  points integer NOT NULL,
  max_points integer NOT NULL DEFAULT 100,
  min_to_pass integer NOT NULL DEFAULT 90,
  readiness_score integer,
  taken_at timestamptz NOT NULL,
  PRIMARY KEY (student_id, id)
);

CREATE TABLE app_snapshots (
  id uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lang integer NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  readiness_score integer NOT NULL,
  readiness_label text NOT NULL,
  total_questions integer NOT NULL,
  seen_count integer NOT NULL,
  mistakes_count integer NOT NULL,
  due_mistakes_count integer NOT NULL DEFAULT 0,
  accuracy_7d integer,
  attempts_7d integer NOT NULL DEFAULT 0,
  mocks_taken integer NOT NULL DEFAULT 0,
  mocks_passed integer NOT NULL DEFAULT 0,
  days_to_ready integer,
  streak integer NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX app_snapshots_student_idx ON app_snapshots(student_id, received_at DESC);

-- Generated documents: what was produced, for whom, by whom, with the data it was rendered from.
CREATE TABLE documents (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  student_id uuid REFERENCES students(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  pdf bytea NOT NULL
);
CREATE INDEX documents_student_idx ON documents(student_id, created_at DESC);
CREATE INDEX documents_school_idx ON documents(school_id, created_at DESC);
