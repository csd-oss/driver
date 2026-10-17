import { useState, type FormEvent } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { CopyIcon, ExternalLinkIcon, FileTextIcon, PlusIcon, SmartphoneIcon } from 'lucide-react'
import { LoadError, Loading, Page, Section } from '@/components/page'
import { ComponentBars, ReadinessBadge, Sparkline } from '@/components/readiness'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { Meter } from '@/components/ui/meter'
import { Property, PropertyList } from '@/components/ui/property-list'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { type MessageKey, useI18n, useT } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { ageOn, DRIVING_KINDS, euro, formatAgo, formatDate, fullName, isEnrolmentStatus, percent } from '@/lib/format'
import { documentUrl, useAddDrivingLesson, useCreateDocument, useEnrol, useGroups, usePatchStudent, useStudent, useStudentJoinCode } from '@/lib/queries'
import type { StudentDetail } from '@/lib/types'

export default function StudentPage() {
  const t = useT()
  const { studentId } = useParams({ from: '/app/ziaci/$studentId' })
  const student = useStudent(studentId)
  if (student.isPending) return <Loading />
  if (student.isError) return <LoadError error={student.error} />
  const s = student.data
  const enrolment = s.enrolments.find((e) => e.status === 'active') ?? s.enrolments[0]
  const minor = (ageOn(s.birth_date) ?? 99) < 18
  return (
    <Page
      wide
      back={{ to: '/ziaci', label: t('nav.students') }}
      title={
        <span className="flex items-center gap-3">
          {fullName(s)}
          <ReadinessBadge progress={s.progress} />
          {minor && <Badge tone="warning">{t('student.minor')}</Badge>}
        </span>
      }
      description={
        <>
          {t('student.registerNo', { n: s.register_no })}
          {enrolment && (
            <>
              {' '}
              · {t('student.courseWord')}{' '}
              <Link to="/kurzy/$groupId" params={{ groupId: enrolment.group_id }} className="text-accent-text hover:underline">
                {enrolment.group_name}
              </Link>{' '}
              ({isEnrolmentStatus(enrolment.status) ? t(`enrolmentStatus.${enrolment.status}`) : enrolment.status})
            </>
          )}
          {s.birth_date && <> · {t('student.age', { n: ageOn(s.birth_date) ?? '' })}</>}
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 max-desk:grid-cols-1">
        <div className="flex flex-col gap-5">
          <ReadinessCard s={s} />
          <DrivingCard s={s} />
          <TheoryCard s={s} />
        </div>
        <div className="flex flex-col gap-5">
          <AppCard s={s} />
          <DocumentsCard s={s} minor={minor} />
          <ProfileCard key={s.id} s={s} minor={minor} />
          <EnrolmentCard s={s} />
        </div>
      </div>
    </Page>
  )
}

function ReadinessCard({ s }: { s: StudentDetail }) {
  const { t, tp } = useI18n()
  const p = s.progress
  if (!p.linked) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-fg">{t('student.readinessTitle')}</h2>
        <Callout className="mt-3" title={t('student.notLinkedTitle')}>
          {t('student.notLinkedHint')}
        </Callout>
      </Card>
    )
  }
  const trend = s.snapshots.map((x) => x.readiness_score)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">{t('student.readinessTitle')}</h2>
          <p className="text-xs text-muted">{t('student.fromApp', { ago: formatAgo(p.last_sync_at) })}</p>
        </div>
        <div className="flex items-center gap-4">
          <Sparkline points={trend} />
          <div className="text-right">
            <span className="text-3xl font-semibold tabular-nums text-fg">{p.score}</span>
            <span className="text-sm text-subtle"> / 100</span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_1fr] gap-6 max-desk:grid-cols-1">
        <ComponentBars progress={p} />
        <PropertyList labelWidth="9rem">
          <Property label={t('student.questionsPractised')}>
            <span className="tabular-nums">{t('student.ofTotal', { n: p.seen_count, total: p.total_questions })}</span>
          </Property>
          <Property label={t('student.openMistakes')}>
            <span className="tabular-nums">{p.mistakes_count}</span> <span className="text-xs text-subtle">{t('student.dueToday', { n: p.due_mistakes_count })}</span>
          </Property>
          <Property label={t('student.accuracy7d')}>
            {p.accuracy_7d === null ? <span className="text-subtle">{t('student.noAnswers')}</span> : <span className="tabular-nums">{t('student.accuracyOf', { pct: p.accuracy_7d, n: p.attempts_7d })}</span>}
          </Property>
          <Property label={t('student.mocks')}>
            <span className="tabular-nums">{t('student.mocksPassed', { passed: p.mocks_passed, taken: p.mocks_taken })}</span>
            {p.last_mock_score !== null && <span className="text-xs text-subtle"> {t('student.lastMock', { n: p.last_mock_score })}</span>}
          </Property>
          <Property label={t('student.estimate')}>{p.days_to_ready === null ? <span className="text-subtle">–</span> : p.days_to_ready === 0 ? t('student.ready') : tp('student.estimateDays', p.days_to_ready)}</Property>
          <Property label={t('student.lastActivity')}>{formatAgo(p.last_activity_at)}</Property>
          {p.exam && (
            <Property label={t('student.realExam')}>
              <Badge tone={p.exam.passed ? 'success' : 'danger'}>{p.exam.passed ? t('student.passed') : t('student.failed')}</Badge> <span className="tabular-nums">{t('student.points', { n: p.exam.points })}</span>{' '}
              <span className="text-xs text-subtle">{formatDate(p.exam.taken_at)}</span>
            </Property>
          )}
        </PropertyList>
      </div>
      {(s.weak_categories.length > 0 || s.mocks.length > 0) && (
        <div className="mt-4 grid grid-cols-[1fr_1fr] gap-6 border-t border-line pt-4 max-desk:grid-cols-1">
          {s.weak_categories.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted">{t('student.weakCategories')}</h3>
              <ul className="flex flex-col gap-1.5">
                {s.weak_categories.map((c) => {
                  const acc = percent(Number(c.correct), Number(c.attempts)) ?? 0
                  return (
                    <li key={c.category_text} className="grid grid-cols-[1fr_5rem_2.5rem] items-center gap-2 text-sm">
                      <span className="truncate text-fg" title={c.category_text}>
                        {c.category_text}
                      </span>
                      <Meter value={acc} max={100} label={c.category_text} tone={acc < 70 ? 'over' : acc < 85 ? 'warn' : 'default'} />
                      <span className="text-right tabular-nums text-muted">{acc} %</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {s.mocks.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted">{t('student.mockHistory')}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {s.mocks.slice(0, 6).map((m) => (
                  <li key={m.completed_at} className="flex items-center justify-between">
                    <span className="text-muted">{formatDate(m.completed_at)}</span>
                    <span className={m.passed ? 'tabular-nums text-success-text' : 'tabular-nums text-danger-text'}>
                      {m.score}/{m.max_score} {m.passed ? '✓' : '✗'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function DrivingCard({ s }: { s: StudentDetail }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const required = s.enrolments.find((e) => e.status === 'active')?.driving_lessons_required ?? 39
  const done = s.driving_lessons.filter((d) => d.kind !== 'PU').reduce((n, d) => n + d.lessons, 0)
  const byKind = (k: string) => s.driving_lessons.filter((d) => d.kind === k).reduce((n, d) => n + d.lessons, 0)
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">{t('student.drivingTitle')}</h2>
          <p className="text-xs text-muted">{t('student.drivingSummary', { done, required, at: byKind('AT'), ac: byKind('AC'), cp: byKind('CP'), km: s.training.driving_km })}</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> {t('student.recordDrive')}
        </Button>
      </div>
      <Meter value={done} max={required} label={t('student.drivingTitle')} className="mt-3" size="md" />
      {s.driving_lessons.length > 0 && (
        <Table className="mt-3">
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t('col.date')}</TableHeaderCell>
              <TableHeaderCell>{t('col.kind')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.hours')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.km')}</TableHeaderCell>
              <TableHeaderCell>{t('col.instructor')}</TableHeaderCell>
              <TableHeaderCell>{t('col.note')}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {s.driving_lessons.slice(0, 8).map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  {formatDate(d.held_on)} {d.starts_at && <span className="text-xs text-subtle">{d.starts_at.slice(0, 5)}</span>}
                </TableCell>
                <TableCell>{t(`drivingKind.${d.kind}`)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.lessons}</TableCell>
                <TableCell className="text-right tabular-nums text-muted">{d.km ?? '–'}</TableCell>
                <TableCell className="text-muted">{d.instructor_name ?? '–'}</TableCell>
                <TableCell className="max-w-48 truncate text-muted">{d.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {open && <DrivingDialog s={s} onClose={() => setOpen(false)} />}
    </Card>
  )
}

function DrivingDialog({ s, onClose }: { s: StudentDetail; onClose: () => void }) {
  const t = useT()
  const add = useAddDrivingLesson(s.id)
  const [form, setForm] = useState({ held_on: new Date().toISOString().slice(0, 10), starts_at: '', lessons: '2', kind: 'CP', km: '', vehicle: '', notes: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    add.mutate(
      { held_on: form.held_on, starts_at: form.starts_at ? `${form.starts_at}:00` : undefined, lessons: Number(form.lessons), kind: form.kind, km: form.km ? Number(form.km) : undefined, vehicle: form.vehicle, notes: form.notes },
      { onSuccess: onClose },
    )
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('student.recordDrive')} description={t('student.driveDialogHint')} size="sm">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('col.date')}>
                <Input type="date" value={form.held_on} onChange={set('held_on')} required />
              </Field>
              <Field label={t('col.start')}>
                <Input type="time" value={form.starts_at} onChange={set('starts_at')} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('col.kind')}>
                <Select value={form.kind} onChange={set('kind')}>
                  {DRIVING_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`drivingKind.${k}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('col.hours')}>
                <Input type="number" min={1} max={6} value={form.lessons} onChange={set('lessons')} required />
              </Field>
              <Field label={t('col.km')}>
                <Input type="number" min={0} value={form.km} onChange={set('km')} />
              </Field>
            </div>
            <Field label={t('student.vehicle')}>
              <Input value={form.vehicle} onChange={set('vehicle')} placeholder={t('student.vehiclePlaceholder')} />
            </Field>
            <Field label={t('col.note')}>
              <Textarea value={form.notes} onChange={set('notes')} placeholder={t('student.notesPlaceholder')} />
            </Field>
            {add.isError && <p className="text-sm text-danger-text">{errorMessage(add.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
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

function TheoryCard({ s }: { s: StudentDetail }) {
  const t = useT()
  const tr = s.training
  const required = s.enrolments.find((e) => e.status === 'active')?.theory_lessons_required ?? 32
  const att = percent(tr.theory_present, tr.theory_held)
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-fg">{t('student.theoryTitle')}</h2>
      <p className="text-xs text-muted">{t('student.theorySummary', { present: tr.theory_present, held: tr.theory_held, pct: att ?? 0, required })}</p>
      <Meter value={tr.theory_present} max={Math.max(required, tr.theory_held)} label={t('student.theoryTitle')} className="mt-3" size="md" tone={att !== null && att < 50 ? 'warn' : 'default'} />
    </Card>
  )
}

function AppCard({ s }: { s: StudentDetail }) {
  const t = useT()
  const make = useStudentJoinCode(s.id)
  const code = s.join_code
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
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <SmartphoneIcon aria-hidden className="size-4 text-subtle" /> {t('student.appTitle')}
      </h2>
      {s.progress.linked ? (
        <p className="mt-1 text-sm text-muted">
          {t('student.appLinked', { ago: formatAgo(s.progress.last_sync_at) })}
          {s.app_consent_on && <> {t('student.appConsent', { date: formatDate(s.app_consent_on) })}</>}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('student.appNotLinked')}</p>
      )}
      {code && (
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded-md border border-line bg-sunken px-3 py-2 text-center font-mono text-xl tracking-[0.3em] text-fg">{code.code}</code>
          <Button icon aria-label={t('common.copyCode')} onClick={copy}>
            <CopyIcon aria-hidden />
          </Button>
        </div>
      )}
      <Button size="sm" variant="ghost" className="mt-3" loading={make.isPending} onClick={() => make.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
        {code ? t('student.newPersonalCode') : t('student.createPersonalCode')}
      </Button>
    </Card>
  )
}

const DOCUMENTS: { kind: string; title: MessageKey; hint: MessageKey }[] = [
  { kind: 'agreement', title: 'doc.agreement', hint: 'doc.agreementHint' },
  { kind: 'guardian_consent', title: 'doc.guardianConsent', hint: 'doc.guardianConsentHint' },
  { kind: 'certificate', title: 'doc.certificate', hint: 'doc.certificateHint' },
  { kind: 'progress_report', title: 'doc.progressReport', hint: 'doc.progressReportHint' },
]

function DocumentsCard({ s, minor }: { s: StudentDetail; minor: boolean }) {
  const { t, locale } = useI18n()
  const create = useCreateDocument(s.id)
  const [place, setPlace] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const make = (kind: string) => {
    setPending(kind)
    create.mutate(
      { kind, fields: { place }, lang: locale },
      {
        onSuccess: (d) => window.open(documentUrl(d.id), '_blank', 'noopener'),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setPending(null),
      },
    )
  }
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <FileTextIcon aria-hidden className="size-4 text-subtle" /> {t('student.documentsTitle')}
      </h2>
      <Field label={t('student.issuePlace')} className="mt-2">
        <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('course.placePlaceholder')} />
      </Field>
      <ul className="mt-3 flex flex-col divide-y divide-line-subtle">
        {DOCUMENTS.filter((d) => d.kind !== 'guardian_consent' || minor || s.guardian_name).map((d) => (
          <li key={d.kind} className="flex items-center gap-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-fg">{t(d.title)}</span>
              <span className="text-xs text-subtle">{t(d.hint)}</span>
            </span>
            <Button size="sm" loading={pending === d.kind} onClick={() => make(d.kind)}>
              {t('common.pdf')}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-subtle">{t('doc.languageNote')}</p>
      {s.documents.length > 0 && (
        <Section title={t('student.issued')} className="mt-4">
          <ul className="flex flex-col gap-1 text-sm">
            {s.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <a href={documentUrl(d.id)} target="_blank" rel="noopener" className="flex min-w-0 items-center gap-1.5 text-accent-text hover:underline">
                  <ExternalLinkIcon aria-hidden className="size-3.5 flex-none" />
                  <span className="truncate">{d.title}</span>
                </a>
                <span className="flex-none text-xs text-subtle">
                  {formatDate(d.created_at)} · {d.created_by_name}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Card>
  )
}

const TEXT_FIELDS: { key: keyof StudentDetail; label: MessageKey; type?: string; hint?: MessageKey }[] = [
  { key: 'first_name', label: 'field.firstName' },
  { key: 'last_name', label: 'field.lastName' },
  { key: 'birth_date', label: 'field.birthDate', type: 'date' },
  { key: 'birth_place', label: 'field.birthPlace' },
  { key: 'personal_id', label: 'field.personalId', hint: 'field.personalIdHint' },
  { key: 'address', label: 'field.address' },
  { key: 'email', label: 'field.email' },
  { key: 'phone', label: 'field.phone' },
]

const DATE_CHECKS: { key: keyof StudentDetail; label: MessageKey; hint: MessageKey }[] = [
  { key: 'medical_ok_on', label: 'check.medical', hint: 'check.medicalHint' },
  { key: 'psych_ok_on', label: 'check.psych', hint: 'check.psychHint' },
  { key: 'first_aid_ok_on', label: 'check.firstAid', hint: 'check.firstAidHint' },
  { key: 'guardian_consent_on', label: 'check.guardianConsent', hint: 'check.guardianConsentHint' },
  { key: 'privacy_notice_on', label: 'check.privacyNotice', hint: 'check.privacyNoticeHint' },
]

function initialForm(s: StudentDetail): Record<string, string | boolean | null> {
  const next: Record<string, string | boolean | null> = {}
  for (const f of [...TEXT_FIELDS, ...DATE_CHECKS]) next[f.key] = (s[f.key] as string | null) ?? ''
  next.guardian_name = s.guardian_name
  next.guardian_contact = s.guardian_contact
  next.notes = s.notes
  next.education_doc_ok = s.education_doc_ok
  next.needs_glasses = s.needs_glasses
  return next
}

function ProfileCard({ s, minor }: { s: StudentDetail; minor: boolean }) {
  const { t, tp } = useI18n()
  const patch = usePatchStudent(s.id)
  const [form, setForm] = useState(() => initialForm(s))
  const text = (k: string) => ({ value: (form[k] as string) ?? '', onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })) })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: Record<string, unknown> = { ...form }
    for (const f of TEXT_FIELDS) if (f.type === 'date') body[f.key] = form[f.key] || null
    for (const d of DATE_CHECKS) body[d.key] = form[d.key] || null
    patch.mutate(body, { onSuccess: () => toast(t('student.saved'), { tone: 'success' }), onError: (err) => toast.error(errorMessage(err)) })
  }
  const missing = DATE_CHECKS.filter((d) => (d.key !== 'guardian_consent_on' || minor) && d.key !== 'psych_ok_on' && !s[d.key]).length + (s.education_doc_ok ? 0 : 1)
  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">{t('student.profileTitle')}</h2>
          {missing > 0 ? <Badge tone="warning">{tp('student.missingDocs', missing)}</Badge> : <Badge tone="success">{t('student.docsComplete')}</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TEXT_FIELDS.map((f) => (
            <Field key={f.key} label={t(f.label)} hint={f.hint ? t(f.hint) : undefined} className={f.key === 'address' ? 'col-span-2' : undefined}>
              <Input type={f.type ?? 'text'} {...text(f.key)} />
            </Field>
          ))}
        </div>
        {(minor || s.guardian_name) && (
          <div className="grid grid-cols-2 gap-3 rounded-md bg-sunken p-3">
            <Field label={t('student.guardian')}>
              <Input {...text('guardian_name')} />
            </Field>
            <Field label={t('student.guardianContact')}>
              <Input {...text('guardian_contact')} />
            </Field>
          </div>
        )}
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {DATE_CHECKS.map((d) => (
            <div key={d.key} className="grid grid-cols-[1fr_9rem] items-center gap-3">
              <span className="flex flex-col">
                <span className="text-sm text-fg">{t(d.label)}</span>
                <span className="text-xs text-subtle">{t(d.hint)}</span>
              </span>
              <Input type="date" aria-label={t(d.label)} {...text(d.key)} />
            </div>
          ))}
          <Checkbox label={t('student.educationDoc')} description={t('student.educationDocHint')} checked={Boolean(form.education_doc_ok)} onCheckedChange={(v) => setForm((f) => ({ ...f, education_doc_ok: v === true }))} />
          <Checkbox label={t('student.glasses')} description={t('student.glassesHint')} checked={Boolean(form.needs_glasses)} onCheckedChange={(v) => setForm((f) => ({ ...f, needs_glasses: v === true }))} />
        </div>
        <Field label={t('student.notes')}>
          <Textarea {...text('notes')} />
        </Field>
        <Button type="submit" variant="primary" loading={patch.isPending} className="self-start">
          {t('common.save')}
        </Button>
      </form>
    </Card>
  )
}

function EnrolmentCard({ s }: { s: StudentDetail }) {
  const t = useT()
  const groups = useGroups()
  const enrol = useEnrol(s.id)
  const [groupId, setGroupId] = useState('')
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-fg">{t('student.coursesTitle')}</h2>
      <ul className="mt-2 flex flex-col divide-y divide-line-subtle text-sm">
        {s.enrolments.map((e) => (
          <li key={e.group_id} className="flex items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 flex-col">
              <Link to="/kurzy/$groupId" params={{ groupId: e.group_id }} className="font-medium text-fg hover:underline">
                {e.group_name}
              </Link>
              <span className="text-xs text-subtle">
                {t('student.enrolledFrom', { date: formatDate(e.enrolled_on) })} · {euro(e.price_cents)} {e.paid_on ? t('student.paidOn', { date: formatDate(e.paid_on) }) : e.price_cents ? t('student.unpaid') : ''}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={e.status === 'active' ? 'accent' : e.status === 'finished' ? 'success' : 'neutral'}>{isEnrolmentStatus(e.status) ? t(`enrolmentStatus.${e.status}`) : e.status}</Badge>
              {e.status === 'active' && (
                <Select className="w-32" aria-label={t('student.changeStatus')} value="" onChange={(ev) => ev.target.value && enrol.mutate({ group_id: e.group_id, status: ev.target.value })}>
                  <option value="">{t('student.changeEllipsis')}</option>
                  <option value="finished">{t('student.markFinished')}</option>
                  <option value="withdrawn">{t('student.markWithdrawn')}</option>
                </Select>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end gap-2">
        <Field label={t('student.enrolInto')} className="flex-1">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">–</option>
            {groups.data
              ?.filter((g) => g.status !== 'archived' && !s.enrolments.some((e) => e.group_id === g.id && e.status === 'active'))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </Select>
        </Field>
        <Button disabled={!groupId} loading={enrol.isPending} onClick={() => enrol.mutate({ group_id: groupId }, { onSuccess: () => setGroupId('') })}>
          {t('student.enrol')}
        </Button>
      </div>
    </Card>
  )
}
