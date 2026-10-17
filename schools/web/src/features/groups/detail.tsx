import { useState, type FormEvent } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { CopyIcon, FileTextIcon, PlusIcon, RefreshCwIcon, SmartphoneIcon } from 'lucide-react'
import { LoadError, Loading, Page, Section } from '@/components/page'
import { ReadinessBar, StatTile } from '@/components/readiness'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { useI18n, useT } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { daysUntil, formatAgo, formatDate, fullName, GROUP_STATUSES, isEnrolmentStatus, percent, SUBJECTS } from '@/lib/format'
import { documentUrl, useAddLesson, useCreateGroupDocument, useGroup, useGroupJoinCode, useLessons, usePatchGroup, useSetAttendance } from '@/lib/queries'
import type { GroupDetail, GroupStudent, Lesson } from '@/lib/types'
import { NewStudentDialog } from '@/features/students'

export default function GroupPage() {
  const { t, tp } = useI18n()
  const { groupId } = useParams({ from: '/app/kurzy/$groupId' })
  const group = useGroup(groupId)
  if (group.isPending) return <Loading />
  if (group.isError) return <LoadError error={group.error} />
  const g = group.data
  const days = daysUntil(g.exam_on)
  return (
    <Page
      wide
      back={{ to: '/kurzy', label: t('nav.courses') }}
      title={
        <span className="flex items-center gap-3">
          {g.name}
          <Badge tone={g.status === 'running' ? 'accent' : g.status === 'finished' ? 'success' : 'neutral'}>{t(`groupStatus.${g.status}`)}</Badge>
        </span>
      }
      description={
        <>
          {t('course.categoryLine', { category: g.category })} · {g.branch_name ?? t('course.noBranch')} · {g.lead_instructor_name ?? t('course.noInstructor')} · {t('course.from', { date: formatDate(g.starts_on) })}
          {g.jiscd_course_no && <> · {t('course.jiscdNo', { no: g.jiscd_course_no })}</>}
        </>
      }
      actions={<StatusSelect group={g} />}
    >
      <div className="grid grid-cols-5 gap-3 max-desk:grid-cols-2">
        <StatTile label={t('course.students')} value={g.students_count} hint={t('course.withAppHint', { n: g.stats.linked })} />
        <StatTile label={t('course.avgReadiness')} value={g.stats.avg_readiness ?? '–'} hint={t('course.readyHint', { ready: g.stats.ready_count, almost: g.stats.almost_ready_count })} tone="accent" />
        <StatTile label={t('course.studiedThisWeek')} value={g.stats.active_7d} hint={t('course.ofLinked', { n: g.stats.linked })} />
        <StatTile
          label={t('course.theory')}
          value={`${g.theory_lessons_held}/${g.theory_lessons_required}`}
          hint={g.stats.avg_theory_attendance === null ? t('course.hoursHeld') : t('course.hoursAttendance', { pct: g.stats.avg_theory_attendance })}
        />
        <StatTile
          label={t('course.exam')}
          value={g.exam_on ? formatDate(g.exam_on) : '–'}
          hint={days === null ? t('course.noExamDate') : days >= 0 ? tp('time.inDays', days) : t('course.examPast')}
          tone={days !== null && days >= 0 && days <= 14 ? 'warning' : 'default'}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_20rem] gap-5 max-desk:grid-cols-1">
        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students" count={g.students.length}>
              {t('course.tabStudents')}
            </TabsTrigger>
            <TabsTrigger value="theory">{t('course.tabTheory')}</TabsTrigger>
            <TabsTrigger value="documents">{t('course.tabDocuments')}</TabsTrigger>
          </TabsList>
          <TabsContent value="students" className="pt-4">
            <StudentsTab group={g} />
          </TabsContent>
          <TabsContent value="theory" className="pt-4">
            <TheoryTab group={g} />
          </TabsContent>
          <TabsContent value="documents" className="pt-4">
            <DocumentsTab group={g} />
          </TabsContent>
        </Tabs>
        <JoinCodeCard group={g} />
      </div>
    </Page>
  )
}

function StatusSelect({ group }: { group: GroupDetail }) {
  const t = useT()
  const patch = usePatchGroup(group.id)
  return (
    <Select className="w-40" aria-label={t('course.statusLabel')} value={group.status} onChange={(e) => patch.mutate({ status: e.target.value })}>
      {GROUP_STATUSES.map((k) => (
        <option key={k} value={k}>
          {t(`groupStatus.${k}`)}
        </option>
      ))}
    </Select>
  )
}

function StudentsTab({ group }: { group: GroupDetail }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const sorted = [...group.students].sort((a, b) => Number(b.progress.linked) - Number(a.progress.linked) || b.progress.score - a.progress.score)
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">{t('course.sortedHint')}</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> {t('course.addStudent')}
        </Button>
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="text-right">{t('col.no')}</TableHeaderCell>
            <TableHeaderCell>{t('col.name')}</TableHeaderCell>
            <TableHeaderCell>{t('col.readiness')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.questions')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.mistakes')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.mocks')}</TableHeaderCell>
            <TableHeaderCell>{t('col.activity')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.theory')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.driving')}</TableHeaderCell>
            <TableHeaderCell>{t('col.status')}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((s) => (
            <StudentRow key={s.id} s={s} group={group} />
          ))}
        </TableBody>
      </Table>
      <NewStudentDialog open={open} onOpenChange={setOpen} defaultGroupId={group.id} />
    </>
  )
}

function StudentRow({ s, group }: { s: GroupStudent; group: GroupDetail }) {
  const t = useT()
  const p = s.progress
  const att = percent(s.training.theory_present, s.training.theory_held)
  return (
    <TableRow>
      <TableCell className="text-right tabular-nums text-subtle">{s.register_no}</TableCell>
      <TableCell>
        <Link to="/ziaci/$studentId" params={{ studentId: s.id }} className="font-medium text-fg hover:underline">
          {fullName(s)}
        </Link>
        {p.linked && <SmartphoneIcon aria-label={t('common.appLinked')} className="ml-1.5 inline size-3.5 text-accent-text" />}
        {p.exam && (
          <Badge tone={p.exam.passed ? 'success' : 'danger'} className="ml-2">
            {p.exam.passed ? t('course.examPassed') : t('course.examFailed')}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <ReadinessBar progress={p} />
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted">{p.linked ? `${p.seen_count}/${p.total_questions}` : '–'}</TableCell>
      <TableCell className="text-right tabular-nums">{p.linked ? p.mistakes_count : '–'}</TableCell>
      <TableCell className="text-right tabular-nums">{p.linked ? `${p.mocks_passed}/${p.mocks_taken}` : '–'}</TableCell>
      <TableCell className="text-muted">{p.linked ? formatAgo(p.last_activity_at) : '–'}</TableCell>
      <TableCell className="text-right tabular-nums">{att === null ? '–' : <span className={att < 50 ? 'text-warning-text' : ''}>{att} %</span>}</TableCell>
      <TableCell className="text-right tabular-nums">
        {s.training.driving_lessons}/{group.driving_lessons_required}
      </TableCell>
      <TableCell>
        <Badge tone={s.enrolment_status === 'active' ? 'accent' : 'neutral'}>{isEnrolmentStatus(s.enrolment_status) ? t(`enrolmentStatus.${s.enrolment_status}`) : s.enrolment_status}</Badge>
      </TableCell>
    </TableRow>
  )
}

function JoinCodeCard({ group }: { group: GroupDetail }) {
  const t = useT()
  const make = useGroupJoinCode(group.id)
  const code = group.join_code
  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      toast(t('common.codeCopied'), { tone: 'success' })
    } catch {
      toast.error(t('common.codeCopyFailed'))
    }
  }
  return (
    <Card className="h-fit p-4">
      <h2 className="text-sm font-semibold text-fg">{t('course.joinCodeTitle')}</h2>
      <p className="mt-1 text-xs text-muted">{t('course.joinCodeHint')}</p>
      {code ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-md border border-line bg-sunken px-3 py-2 text-center font-mono text-xl tracking-[0.3em] text-fg">{code.code}</code>
            <Button icon aria-label={t('common.copyCode')} onClick={copy}>
              <CopyIcon aria-hidden />
            </Button>
          </div>
          <p className="mt-2 text-xs text-subtle">{t('course.joinCodeValid', { date: formatDate(code.expires_at) })}</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">{t('course.noJoinCode')}</p>
      )}
      <Button size="sm" variant="ghost" className="mt-3" loading={make.isPending} onClick={() => make.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
        <RefreshCwIcon aria-hidden /> {code ? t('course.newCode') : t('course.createCode')}
      </Button>
    </Card>
  )
}

function TheoryTab({ group }: { group: GroupDetail }) {
  const t = useT()
  const lessons = useLessons(group.id)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Lesson | null>(null)
  if (lessons.isPending) return <Loading />
  if (lessons.isError) return <LoadError error={lessons.error} />
  const held = lessons.data.reduce((s, l) => s + l.lessons, 0)
  const active = group.students.filter((s) => s.enrolment_status === 'active')
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">{t('course.theoryHint', { held, required: group.theory_lessons_required })}</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> {t('course.recordLesson')}
        </Button>
      </div>
      {lessons.data.length === 0 ? (
        <EmptyState title={t('course.noTheoryTitle')}>{t('course.noTheoryHint')}</EmptyState>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t('col.date')}</TableHeaderCell>
              <TableHeaderCell>{t('col.subject')}</TableHeaderCell>
              <TableHeaderCell>{t('col.topic')}</TableHeaderCell>
              <TableHeaderCell>{t('col.instructor')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.hours')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.present')}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lessons.data.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => setEditing(l)}>
                <TableCell>
                  {formatDate(l.held_on)}
                  {l.starts_at && <span className="ml-1 text-xs text-subtle">{l.starts_at.slice(0, 5)}</span>}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted">{l.subject}</span> {t(`subject.${l.subject}`)}
                </TableCell>
                <TableCell className="text-muted">{l.topic || '–'}</TableCell>
                <TableCell className="text-muted">{l.instructor_name ?? '–'}</TableCell>
                <TableCell className="text-right tabular-nums">{l.lessons}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.present_count}/{active.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <LessonDialog group={group} open={open} onOpenChange={setOpen} />
      {editing && <AttendanceDialog group={group} lesson={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function LessonDialog({ group, open, onOpenChange }: { group: GroupDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const add = useAddLesson(group.id)
  const active = group.students.filter((s) => s.enrolment_status === 'active')
  const [form, setForm] = useState({ held_on: new Date().toISOString().slice(0, 10), starts_at: '16:30', lessons: '3', subject: 'PCP', topic: '' })
  const [present, setPresent] = useState<Set<string>>(() => new Set(active.map((s) => s.id)))
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    add.mutate(
      { held_on: form.held_on, starts_at: form.starts_at ? `${form.starts_at}:00` : undefined, lessons: Number(form.lessons), subject: form.subject, topic: form.topic, present_ids: [...present] },
      { onSuccess: () => onOpenChange(false) },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('course.lessonDialogTitle')} description={t('course.lessonDialogHint')}>
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('col.date')}>
                <Input type="date" value={form.held_on} onChange={set('held_on')} required />
              </Field>
              <Field label={t('col.start')}>
                <Input type="time" value={form.starts_at} onChange={set('starts_at')} />
              </Field>
              <Field label={t('col.hours')}>
                <Input type="number" min={1} max={6} value={form.lessons} onChange={set('lessons')} required />
              </Field>
            </div>
            <div className="grid grid-cols-[12rem_1fr] gap-3">
              <Field label={t('col.subject')}>
                <Select value={form.subject} onChange={set('subject')}>
                  {SUBJECTS.map((k) => (
                    <option key={k} value={k}>
                      {k} · {t(`subject.${k}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('col.topic')}>
                <Input value={form.topic} onChange={set('topic')} placeholder={t('course.topicPlaceholder')} />
              </Field>
            </div>
            <AttendancePicker students={active} present={present} onChange={setPresent} />
            {add.isError && <p className="text-sm text-danger-text">{errorMessage(add.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={add.isPending}>
              {t('common.record')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AttendancePicker({ students, present, onChange }: { students: GroupStudent[]; present: Set<string>; onChange: (s: Set<string>) => void }) {
  const t = useT()
  const toggle = (id: string, on: boolean) => {
    const next = new Set(present)
    if (on) next.add(id)
    else next.delete(id)
    onChange(next)
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full items-center justify-between text-xs font-medium text-muted">
        <span>{t('course.present', { n: present.size, total: students.length })}</span>
        <span className="flex gap-2">
          <button type="button" className="text-accent-text hover:underline" onClick={() => onChange(new Set(students.map((s) => s.id)))}>
            {t('common.everyone')}
          </button>
          <button type="button" className="text-accent-text hover:underline" onClick={() => onChange(new Set())}>
            {t('common.nobody')}
          </button>
        </span>
      </legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {students.map((s) => (
          <Checkbox key={s.id} label={fullName(s)} checked={present.has(s.id)} onCheckedChange={(v) => toggle(s.id, v === true)} />
        ))}
      </div>
    </fieldset>
  )
}

function AttendanceDialog({ group, lesson, onClose }: { group: GroupDetail; lesson: Lesson; onClose: () => void }) {
  const t = useT()
  const save = useSetAttendance(group.id)
  const active = group.students.filter((s) => s.enrolment_status === 'active')
  const [present, setPresent] = useState<Set<string>>(() => new Set(lesson.present_ids))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('course.attendanceTitle', { date: formatDate(lesson.held_on) })} description={`${lesson.subject} · ${t(`subject.${lesson.subject}`)} · ${lesson.lessons} ${t('common.hoursShort')}`} size="sm">
        <DialogBody>
          <AttendancePicker students={active} present={present} onChange={setPresent} />
          {save.isError && <p className="text-sm text-danger-text">{errorMessage(save.error)}</p>}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ lessonId: lesson.id, present_ids: [...present] }, { onSuccess: onClose })}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentsTab({ group }: { group: GroupDetail }) {
  const { t, locale } = useI18n()
  const create = useCreateGroupDocument(group.id)
  const [place, setPlace] = useState('')
  const [authority, setAuthority] = useState('')
  const make = (kind: string) =>
    create.mutate(
      { kind, fields: { place, authority }, lang: locale },
      {
        onSuccess: (d) => window.open(documentUrl(d.id), '_blank', 'noopener'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  return (
    <div className="grid grid-cols-2 gap-4 max-desk:grid-cols-1">
      <Card className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FileTextIcon aria-hidden className="size-4 text-subtle" /> {t('course.docExamApplication')}
        </h3>
        <p className="mt-1 text-xs text-muted">{t('course.docExamApplicationHint')}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={t('course.place')}>
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('course.placePlaceholder')} />
          </Field>
          <Field label={t('course.authority')}>
            <Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder={t('course.authorityPlaceholder')} />
          </Field>
        </div>
        <Button variant="primary" className="mt-3" loading={create.isPending} onClick={() => make('exam_application')}>
          {t('common.createPdf')}
        </Button>
      </Card>
      <Card className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FileTextIcon aria-hidden className="size-4 text-subtle" /> {t('course.docAttendance')}
        </h3>
        <p className="mt-1 text-xs text-muted">{t('course.docAttendanceHint')}</p>
        <Button variant="primary" className="mt-3" loading={create.isPending} onClick={() => make('attendance_sheet')}>
          {t('common.createPdf')}
        </Button>
      </Card>
      <Section title={t('course.perStudentTitle')} className="col-span-full">
        <p className="text-sm text-muted">{t('course.perStudentHint')}</p>
        <p className="mt-1 text-xs text-subtle">{t('doc.languageNote')}</p>
      </Section>
    </div>
  )
}
