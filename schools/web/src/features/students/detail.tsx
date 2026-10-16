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
import { errorMessage } from '@/lib/api'
import { ageOn, DRIVING_KIND, ENROLMENT_STATUS, euro, formatAgo, formatDate, fullName, percent, plural } from '@/lib/format'
import { documentUrl, useAddDrivingLesson, useCreateDocument, useEnrol, useGroups, usePatchStudent, useStudent, useStudentJoinCode } from '@/lib/queries'
import type { StudentDetail } from '@/lib/types'

export default function StudentPage() {
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
      back={{ to: '/ziaci', label: 'Žiaci' }}
      title={
        <span className="flex items-center gap-3">
          {fullName(s)}
          <ReadinessBadge progress={s.progress} />
          {minor && <Badge tone="warning">pod 18</Badge>}
        </span>
      }
      description={
        <>
          č. {s.register_no} v matričnej knihe
          {enrolment && (
            <>
              {' '}
              · kurz{' '}
              <Link to="/kurzy/$groupId" params={{ groupId: enrolment.group_id }} className="text-accent-text hover:underline">
                {enrolment.group_name}
              </Link>{' '}
              ({ENROLMENT_STATUS[enrolment.status]})
            </>
          )}
          {s.birth_date && <> · {ageOn(s.birth_date)} r.</>}
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
  const p = s.progress
  if (!p.linked) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-fg">Príprava na teoretickú skúšku</h2>
        <Callout className="mt-3" title="Aplikácia nie je prepojená">
          Dajte žiakovi kód (vpravo). Keď ho zadá v aplikácii Driver SK, uvidíte tu jeho pripravenosť, chyby a skúšobné testy.
        </Callout>
      </Card>
    )
  }
  const trend = s.snapshots.map((x) => x.readiness_score)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Príprava na teoretickú skúšku</h2>
          <p className="text-xs text-muted">z aplikácie Driver SK · synchronizované {formatAgo(p.last_sync_at)}</p>
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
          <Property label="Precvičené otázky">
            <span className="tabular-nums">
              {p.seen_count} z {p.total_questions}
            </span>
          </Property>
          <Property label="Otvorené chyby">
            <span className="tabular-nums">{p.mistakes_count}</span> <span className="text-xs text-subtle">({p.due_mistakes_count} na dnes)</span>
          </Property>
          <Property label="Úspešnosť za 7 dní">{p.accuracy_7d === null ? <span className="text-subtle">bez odpovedí</span> : <span className="tabular-nums">{p.accuracy_7d} % z {p.attempts_7d}</span>}</Property>
          <Property label="Skúšobné testy">
            <span className="tabular-nums">
              {p.mocks_passed}/{p.mocks_taken} úspešných
            </span>
            {p.last_mock_score !== null && <span className="text-xs text-subtle"> · posledný {p.last_mock_score} b.</span>}
          </Property>
          <Property label="Odhad">
            {p.days_to_ready === null ? <span className="text-subtle">–</span> : p.days_to_ready === 0 ? 'pripravený' : `asi ${plural(p.days_to_ready, 'deň', 'dni', 'dní')} pri súčasnom tempe`}
          </Property>
          <Property label="Posledná aktivita">{formatAgo(p.last_activity_at)}</Property>
          {p.exam && (
            <Property label="Reálna skúška">
              <Badge tone={p.exam.passed ? 'success' : 'danger'}>{p.exam.passed ? 'uspel' : 'neuspel'}</Badge> <span className="tabular-nums">{p.exam.points} b.</span>{' '}
              <span className="text-xs text-subtle">{formatDate(p.exam.taken_at)}</span>
            </Property>
          )}
        </PropertyList>
      </div>
      {(s.weak_categories.length > 0 || s.mocks.length > 0) && (
        <div className="mt-4 grid grid-cols-[1fr_1fr] gap-6 border-t border-line pt-4 max-desk:grid-cols-1">
          {s.weak_categories.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted">Najslabšie okruhy</h3>
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
              <h3 className="mb-2 text-xs font-semibold text-muted">Skúšobné testy</h3>
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
  const [open, setOpen] = useState(false)
  const required = s.enrolments.find((e) => e.status === 'active')?.driving_lessons_required ?? 39
  const done = s.driving_lessons.filter((d) => d.kind !== 'PU').reduce((n, d) => n + d.lessons, 0)
  const byKind = (k: string) => s.driving_lessons.filter((d) => d.kind === k).reduce((n, d) => n + d.lessons, 0)
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Jazdy</h2>
          <p className="text-xs text-muted">
            {done} z {required} vyučovacích hodín · trenažér {byKind('AT')}, autocvičisko {byKind('AC')}, premávka {byKind('CP')} · {s.training.driving_km} km
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> Zapísať jazdu
        </Button>
      </div>
      <Meter value={done} max={required} label="Jazdy" className="mt-3" size="md" />
      {s.driving_lessons.length > 0 && (
        <Table className="mt-3">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Dátum</TableHeaderCell>
              <TableHeaderCell>Druh</TableHeaderCell>
              <TableHeaderCell className="text-right">Hodiny</TableHeaderCell>
              <TableHeaderCell className="text-right">km</TableHeaderCell>
              <TableHeaderCell>Inštruktor</TableHeaderCell>
              <TableHeaderCell>Poznámka</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {s.driving_lessons.slice(0, 8).map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  {formatDate(d.held_on)} {d.starts_at && <span className="text-xs text-subtle">{d.starts_at.slice(0, 5)}</span>}
                </TableCell>
                <TableCell>{DRIVING_KIND[d.kind]}</TableCell>
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
      <DialogContent title="Zapísať jazdu" description="Denné maximá podľa § 8 ods. 11 vyhlášky 45/2016: 2 h trenažér alebo autocvičisko, 3 h cestná premávka." size="sm">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dátum">
                <Input type="date" value={form.held_on} onChange={set('held_on')} required />
              </Field>
              <Field label="Začiatok">
                <Input type="time" value={form.starts_at} onChange={set('starts_at')} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Druh">
                <Select value={form.kind} onChange={set('kind')}>
                  {Object.entries(DRIVING_KIND).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hodiny">
                <Input type="number" min={1} max={6} value={form.lessons} onChange={set('lessons')} required />
              </Field>
              <Field label="km">
                <Input type="number" min={0} value={form.km} onChange={set('km')} />
              </Field>
            </div>
            <Field label="Vozidlo">
              <Input value={form.vehicle} onChange={set('vehicle')} placeholder="Škoda Fabia ZA-456DE" />
            </Field>
            <Field label="Poznámka">
              <Textarea value={form.notes} onChange={set('notes')} placeholder="čo šlo dobre, čo precvičiť nabudúce" />
            </Field>
            {add.isError && <p className="text-sm text-danger-text">{errorMessage(add.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Zrušiť
            </Button>
            <Button type="submit" variant="primary" loading={add.isPending}>
              Zapísať
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TheoryCard({ s }: { s: StudentDetail }) {
  const t = s.training
  const required = s.enrolments.find((e) => e.status === 'active')?.theory_lessons_required ?? 32
  const att = percent(t.theory_present, t.theory_held)
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-fg">Teória</h2>
      <p className="text-xs text-muted">
        {t.theory_present} z {t.theory_held} odučených hodín ({att ?? 0} %) · kurz predpisuje {required} h · v autoškole treba odsedieť aspoň 50 %, zvyšok sa nahrádza v JISCD (§ 8 ods. 6 vyhl. 45/2016)
      </p>
      <Meter value={t.theory_present} max={Math.max(required, t.theory_held)} label="Teória" className="mt-3" size="md" tone={att !== null && att < 50 ? 'warn' : 'default'} />
    </Card>
  )
}

function AppCard({ s }: { s: StudentDetail }) {
  const make = useStudentJoinCode(s.id)
  const code = s.join_code
  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      toast('Kód skopírovaný', { tone: 'success' })
    } catch {
      toast.error('Kód sa nepodarilo skopírovať')
    }
  }
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <SmartphoneIcon aria-hidden className="size-4 text-subtle" /> Aplikácia Driver SK
      </h2>
      {s.progress.linked ? (
        <p className="mt-1 text-sm text-muted">
          Prepojená, posledná synchronizácia {formatAgo(s.progress.last_sync_at)}.{s.app_consent_on && <> Súhlas so zdieľaním od {formatDate(s.app_consent_on)}.</>}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">Nie je prepojená. Osobný kód funguje raz a platí 14 dní; kód kurzu nájdete na stránke kurzu.</p>
      )}
      {code && (
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 rounded-md border border-line bg-sunken px-3 py-2 text-center font-mono text-xl tracking-[0.3em] text-fg">{code.code}</code>
          <Button icon aria-label="Kopírovať kód" onClick={copy}>
            <CopyIcon aria-hidden />
          </Button>
        </div>
      )}
      <Button size="sm" variant="ghost" className="mt-3" loading={make.isPending} onClick={() => make.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
        {code ? 'Nový osobný kód' : 'Vytvoriť osobný kód'}
      </Button>
    </Card>
  )
}

const DOCUMENTS: { kind: string; title: string; hint: string; needsPlace?: boolean }[] = [
  { kind: 'agreement', title: 'Zmluva o vykonaní vodičského kurzu', hint: '§ 7 ods. 3 vyhl. 45/2016: začatie, trvanie, obsah a cena kurzu', needsPlace: true },
  { kind: 'guardian_consent', title: 'Súhlas zákonného zástupcu + informácia GDPR', hint: '§ 2b ods. 3 písm. g) zákona 93/2005 a čl. 13 GDPR' },
  { kind: 'certificate', title: 'Potvrdenie o absolvovaní kurzu', hint: 'údaje podľa § 23 vyhl. 45/2016 (osvedčenie samo vydáva JISCD)', needsPlace: true },
  { kind: 'progress_report', title: 'Výpis z prípravy na skúšku', hint: 'pokrok z aplikácie a jazdy, pre žiaka alebo rodiča' },
]

function DocumentsCard({ s, minor }: { s: StudentDetail; minor: boolean }) {
  const create = useCreateDocument(s.id)
  const [place, setPlace] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const make = (kind: string) => {
    setPending(kind)
    create.mutate(
      { kind, fields: { place } },
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
        <FileTextIcon aria-hidden className="size-4 text-subtle" /> Dokumenty
      </h2>
      <Field label="Miesto vystavenia" className="mt-2">
        <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Žiline" />
      </Field>
      <ul className="mt-3 flex flex-col divide-y divide-line-subtle">
        {DOCUMENTS.filter((d) => d.kind !== 'guardian_consent' || minor || s.guardian_name).map((d) => (
          <li key={d.kind} className="flex items-center gap-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-fg">{d.title}</span>
              <span className="text-xs text-subtle">{d.hint}</span>
            </span>
            <Button size="sm" loading={pending === d.kind} onClick={() => make(d.kind)}>
              PDF
            </Button>
          </li>
        ))}
      </ul>
      {s.documents.length > 0 && (
        <Section title="Vystavené" className="mt-4">
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

const TEXT_FIELDS: { key: keyof StudentDetail; label: string; type?: string; hint?: string }[] = [
  { key: 'first_name', label: 'Meno' },
  { key: 'last_name', label: 'Priezvisko' },
  { key: 'birth_date', label: 'Dátum narodenia', type: 'date' },
  { key: 'birth_place', label: 'Miesto narodenia' },
  { key: 'personal_id', label: 'Rodné číslo', hint: 'len pre prihlášku na skúšku' },
  { key: 'address', label: 'Adresa pobytu' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefón' },
]

const DATE_CHECKS: { key: keyof StudentDetail; label: string; hint: string }[] = [
  { key: 'medical_ok_on', label: 'Lekárska prehliadka', hint: 'zaznamenať do JISCD pred zaradením (§ 6 ods. 1 písm. h)' },
  { key: 'psych_ok_on', label: 'Psychologické vyšetrenie', hint: 'len ak ho skupina vyžaduje (§ 6 ods. 1 písm. i)' },
  { key: 'first_aid_ok_on', label: 'Kurz prvej pomoci', hint: 'podmienka osvedčenia (§ 6 ods. 3)' },
  { key: 'guardian_consent_on', label: 'Súhlas zákonného zástupcu', hint: 'pod 18 rokov (§ 2b ods. 3 písm. g)' },
  { key: 'privacy_notice_on', label: 'Informácia o osobných údajoch odovzdaná', hint: 'čl. 13 GDPR' },
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
  const patch = usePatchStudent(s.id)
  const [form, setForm] = useState(() => initialForm(s))
  const text = (k: string) => ({ value: (form[k] as string) ?? '', onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })) })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: Record<string, unknown> = { ...form }
    for (const f of TEXT_FIELDS) if (f.type === 'date') body[f.key] = form[f.key] || null
    for (const d of DATE_CHECKS) body[d.key] = form[d.key] || null
    patch.mutate(body, { onSuccess: () => toast('Údaje žiaka uložené', { tone: 'success' }), onError: (err) => toast.error(errorMessage(err)) })
  }
  const missing = DATE_CHECKS.filter((d) => (d.key !== 'guardian_consent_on' || minor) && d.key !== 'psych_ok_on' && !s[d.key]).length + (s.education_doc_ok ? 0 : 1)
  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Údaje a doklady</h2>
          {missing > 0 ? <Badge tone="warning">{plural(missing, 'chýbajúci doklad', 'chýbajúce doklady', 'chýbajúcich dokladov')}</Badge> : <Badge tone="success">doklady kompletné</Badge>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TEXT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} className={f.key === 'address' ? 'col-span-2' : undefined}>
              <Input type={f.type ?? 'text'} {...text(f.key)} />
            </Field>
          ))}
        </div>
        {(minor || s.guardian_name) && (
          <div className="grid grid-cols-2 gap-3 rounded-md bg-sunken p-3">
            <Field label="Zákonný zástupca">
              <Input {...text('guardian_name')} />
            </Field>
            <Field label="Kontakt na zástupcu">
              <Input {...text('guardian_contact')} />
            </Field>
          </div>
        )}
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {DATE_CHECKS.map((d) => (
            <div key={d.key} className="grid grid-cols-[1fr_9rem] items-center gap-3">
              <span className="flex flex-col">
                <span className="text-sm text-fg">{d.label}</span>
                <span className="text-xs text-subtle">{d.hint}</span>
              </span>
              <Input type="date" aria-label={d.label} {...text(d.key)} />
            </div>
          ))}
          <Checkbox label="Doklad o vzdelaní predložený" description="skupina B: aspoň nižšie stredné vzdelanie (§ 2b ods. 2)" checked={Boolean(form.education_doc_ok)} onCheckedChange={(v) => setForm((f) => ({ ...f, education_doc_ok: v === true }))} />
          <Checkbox label="Okuliare alebo iná zdravotná pomôcka pri jazde" description="zapisuje sa do matričnej knihy (§ 17 ods. 2 písm. h)" checked={Boolean(form.needs_glasses)} onCheckedChange={(v) => setForm((f) => ({ ...f, needs_glasses: v === true }))} />
        </div>
        <Field label="Poznámky">
          <Textarea {...text('notes')} />
        </Field>
        <Button type="submit" variant="primary" loading={patch.isPending} className="self-start">
          Uložiť
        </Button>
      </form>
    </Card>
  )
}

function EnrolmentCard({ s }: { s: StudentDetail }) {
  const groups = useGroups()
  const enrol = useEnrol(s.id)
  const [groupId, setGroupId] = useState('')
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-fg">Kurzy</h2>
      <ul className="mt-2 flex flex-col divide-y divide-line-subtle text-sm">
        {s.enrolments.map((e) => (
          <li key={e.group_id} className="flex items-center justify-between gap-2 py-2">
            <span className="flex min-w-0 flex-col">
              <Link to="/kurzy/$groupId" params={{ groupId: e.group_id }} className="font-medium text-fg hover:underline">
                {e.group_name}
              </Link>
              <span className="text-xs text-subtle">
                od {formatDate(e.enrolled_on)} · {euro(e.price_cents)} {e.paid_on ? `· zaplatené ${formatDate(e.paid_on)}` : e.price_cents ? '· nezaplatené' : ''}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={e.status === 'active' ? 'accent' : e.status === 'finished' ? 'success' : 'neutral'}>{ENROLMENT_STATUS[e.status]}</Badge>
              {e.status === 'active' && (
                <Select className="w-32" aria-label="Zmeniť stav" value="" onChange={(ev) => ev.target.value && enrol.mutate({ group_id: e.group_id, status: ev.target.value })}>
                  <option value="">zmeniť…</option>
                  <option value="finished">ukončil</option>
                  <option value="withdrawn">odišiel</option>
                </Select>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Zaradiť do kurzu" className="flex-1">
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
          Zaradiť
        </Button>
      </div>
    </Card>
  )
}
