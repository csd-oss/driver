/** What the server answers (schools/server/src/api). Dates are `YYYY-MM-DD`; instants RFC 3339. */

export type Role = 'admin' | 'instructor'

export interface Me {
  user_id: string
  school_id: string
  email: string
  name: string
  role: Role
}

export interface School {
  id: string
  name: string
  legal_name: string
  ico: string
  address: string
  registration_no: string
  trade_licence_no: string
  responsible_person: string
  phone: string
  email: string
}

export interface Instructor {
  id: string
  name: string
  email: string
  role: Role
  instructor_card_no: string
  instructor_groups: string
  active: boolean
}

export interface Branch {
  id: string
  name: string
  address: string
}

export type ReadinessLabel = 'ready' | 'almostReady' | 'gettingThere' | 'needsWork'

export interface Components {
  mistakes: number
  performance: number
  mock: number
  coverage: number
  overall: number
}

export interface Progress {
  student_id: string
  linked: boolean
  score: number
  label: ReadinessLabel
  components: Components
  total_questions: number
  seen_count: number
  mistakes_count: number
  due_mistakes_count: number
  accuracy_7d: number | null
  attempts_7d: number
  attempts_total: number
  mocks_taken: number
  mocks_passed: number
  last_mock_score: number | null
  best_mock_score: number | null
  days_to_ready: number | null
  streak: number
  last_activity_at: string | null
  last_sync_at: string | null
  exam: { passed: boolean; points: number; taken_at: string } | null
}

export interface Training {
  theory_present: number
  theory_held: number
  driving_lessons: number
  driving_km: number
}

export type GroupStatus = 'planned' | 'running' | 'finished' | 'archived'

export interface Group {
  id: string
  name: string
  category: string
  jiscd_course_no: string
  branch_id: string | null
  branch_name: string | null
  starts_on: string | null
  ends_on: string | null
  exam_on: string | null
  lead_instructor_id: string | null
  lead_instructor_name: string | null
  theory_lessons_required: number
  driving_lessons_required: number
  status: GroupStatus
  students_count: number
  theory_lessons_held: number
}

export interface GroupStats {
  linked: number
  avg_readiness: number | null
  ready_count: number
  almost_ready_count: number
  active_7d: number
  avg_theory_attendance: number | null
  avg_driving_lessons: number | null
}

export interface GroupListItem extends Group {
  stats: GroupStats
}

export interface JoinCode {
  code: string
  expires_at: string
  uses_left: number | null
}

export interface GroupStudent {
  id: string
  register_no: number
  first_name: string
  last_name: string
  birth_date: string | null
  email: string
  phone: string
  enrolment_status: string
  enrolled_on: string
  progress: Progress
  training: Training
}

export interface GroupDetail extends Group {
  stats: GroupStats
  students: GroupStudent[]
  join_code: JoinCode | null
}

export type Subject = 'PCP' | 'NVU' | 'TVV' | 'ZBJ' | 'OP'

export interface Lesson {
  id: string
  held_on: string
  starts_at: string | null
  lessons: number
  subject: Subject
  topic: string
  instructor_id: string | null
  instructor_name: string | null
  present_count: number
  present_ids: string[]
}

export interface Student {
  id: string
  register_no: number
  first_name: string
  last_name: string
  birth_date: string | null
  birth_place: string
  personal_id: string
  address: string
  email: string
  phone: string
  guardian_name: string
  guardian_contact: string
  guardian_consent_on: string | null
  medical_ok_on: string | null
  psych_ok_on: string | null
  education_doc_ok: boolean
  first_aid_ok_on: string | null
  needs_glasses: boolean
  privacy_notice_on: string | null
  app_consent_on: string | null
  notes: string
  created_at: string
  group_id: string | null
  group_name: string | null
  enrolment_status: string | null
}

export interface StudentListItem extends Student {
  progress: Progress
}

export type DrivingKind = 'AT' | 'AC' | 'CP' | 'PU'

export interface DrivingLesson {
  id: string
  held_on: string
  starts_at: string | null
  lessons: number
  kind: DrivingKind
  km: number | null
  vehicle: string
  notes: string
  instructor_id: string | null
  instructor_name: string | null
}

export interface Enrolment {
  group_id: string
  group_name: string
  category: string
  status: string
  enrolled_on: string
  price_cents: number | null
  paid_on: string | null
  finished_on: string | null
  exam_on: string | null
  theory_lessons_required: number
  driving_lessons_required: number
}

export interface SnapshotPoint {
  received_at: string
  readiness_score: number
  seen_count: number
  mistakes_count: number
}

export interface MockPoint {
  completed_at: string
  score: number
  max_score: number
  passed: boolean
}

export interface CategoryStat {
  category_text: string
  attempts: number
  correct: number
}

export interface DocumentRow {
  id: string
  kind: string
  title: string
  created_at: string
  created_by_name: string | null
}

export interface StudentDetail extends Student {
  progress: Progress
  training: Training
  enrolments: Enrolment[]
  driving_lessons: DrivingLesson[]
  snapshots: SnapshotPoint[]
  mocks: MockPoint[]
  weak_categories: CategoryStat[]
  documents: DocumentRow[]
  join_code: JoinCode | null
}

export interface Overview {
  students_active: number
  students_linked: number
  groups_running: number
  groups_planned: number
  avg_readiness: number | null
  ready_count: number
  almost_ready_count: number
  attempts_7d: number
  active_students_7d: number
  exams_taken: number
  exams_passed: number
  upcoming_exams: { group_id: string; group_name: string; exam_on: string; students: number }[]
  readiness_buckets: { label: ReadinessLabel; count: number }[]
}
