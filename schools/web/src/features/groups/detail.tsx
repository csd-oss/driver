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
import { errorMessage } from '@/lib/api'
import { daysUntil, ENROLMENT_STATUS, formatAgo, formatDate, fullName, GROUP_STATUS, percent, plural, SUBJECT } from '@/lib/format'
import { documentUrl, useAddLesson, useCreateGroupDocument, useGroup, useGroupJoinCode, useLessons, usePatchGroup, useSetAttendance } from '@/lib/queries'
import type { GroupDetail, GroupStudent, Lesson } from '@/lib/types'
import { NewStudentDialog } from '@/features/students'

export default function GroupPage() {
  const { groupId } = useParams({ from: '/app/kurzy/$groupId' })
  const group = useGroup(groupId)
  if (group.isPending) return <Loading />
  if (group.isError) return <LoadError error={group.error} />
  const g = group.data
  const days = daysUntil(g.exam_on)
  return (
    <Page
      wide
      back={{ to: '/kurzy', label: 'Kurzy' }}
      title={
        <span className="flex items-center gap-3">
          {g.name}
          <Badge tone={g.status === 'running' ? 'accent' : g.status === 'finished' ? 'success' : 'neutral'}>{GROUP_STATUS[g.status]}</Badge>
        </span>
      }
      description={
        <>
          Skupina {g.category} · {g.branch_name ?? 'bez pobočky'} · {g.lead_instructor_name ?? 'bez inštruktora'} · od {formatDate(g.starts_on)}
          {g.jiscd_course_no && <> · kurz JISCD č. {g.jiscd_course_no}</>}
        </>
      }
      actions={<StatusSelect group={g} />}
    >
      <div className="grid grid-cols-5 gap-3 max-desk:grid-cols-2">
        <StatTile label="Žiaci" value={g.students_count} hint={`${g.stats.linked} s aplikáciou`} />
        <StatTile label="Priemerná pripravenosť" value={g.stats.avg_readiness ?? '–'} hint={`${g.stats.ready_count} pripravených, ${g.stats.almost_ready_count} takmer`} tone="accent" />
        <StatTile label="Učili sa tento týždeň" value={g.stats.active_7d} hint={`z ${g.stats.linked} prepojených`} />
        <StatTile label="Teória" value={`${g.theory_lessons_held}/${g.theory_lessons_required}`} hint={g.stats.avg_theory_attendance === null ? 'hodín odučených' : `hodín · dochádzka ${g.stats.avg_theory_attendance} %`} />
        <StatTile
          label="Skúška"
          value={g.exam_on ? formatDate(g.exam_on) : '–'}
          hint={days === null ? 'termín nie je zadaný' : days >= 0 ? `o ${plural(days, 'deň', 'dni', 'dní')}` : 'už bola'}
          tone={days !== null && days >= 0 && days <= 14 ? 'warning' : 'default'}
        />
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_20rem] gap-5 max-desk:grid-cols-1">
        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students" count={g.students.length}>
              Žiaci
            </TabsTrigger>
            <TabsTrigger value="theory">Teória</TabsTrigger>
            <TabsTrigger value="documents">Dokumenty</TabsTrigger>
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
  const patch = usePatchGroup(group.id)
  return (
    <Select className="w-40" aria-label="Stav kurzu" value={group.status} onChange={(e) => patch.mutate({ status: e.target.value })}>
      {Object.entries(GROUP_STATUS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </Select>
  )
}

function StudentsTab({ group }: { group: GroupDetail }) {
  const [open, setOpen] = useState(false)
  const sorted = [...group.students].sort((a, b) => Number(b.progress.linked) - Number(a.progress.linked) || b.progress.score - a.progress.score)
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">Zoradení podľa pripravenosti. Kliknite na meno pre kartu žiaka.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> Pridať žiaka
        </Button>
      </div>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="text-right">Č.</TableHeaderCell>
            <TableHeaderCell>Meno</TableHeaderCell>
            <TableHeaderCell>Pripravenosť</TableHeaderCell>
            <TableHeaderCell className="text-right">Otázky</TableHeaderCell>
            <TableHeaderCell className="text-right">Chyby</TableHeaderCell>
            <TableHeaderCell className="text-right">Testy</TableHeaderCell>
            <TableHeaderCell>Aktivita</TableHeaderCell>
            <TableHeaderCell className="text-right">Teória</TableHeaderCell>
            <TableHeaderCell className="text-right">Jazdy</TableHeaderCell>
            <TableHeaderCell>Stav</TableHeaderCell>
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
  const p = s.progress
  const att = percent(s.training.theory_present, s.training.theory_held)
  return (
    <TableRow>
      <TableCell className="text-right tabular-nums text-subtle">{s.register_no}</TableCell>
      <TableCell>
        <Link to="/ziaci/$studentId" params={{ studentId: s.id }} className="font-medium text-fg hover:underline">
          {fullName(s)}
        </Link>
        {p.linked && <SmartphoneIcon aria-label="Aplikácia prepojená" className="ml-1.5 inline size-3.5 text-accent-text" />}
        {p.exam && (
          <Badge tone={p.exam.passed ? 'success' : 'danger'} className="ml-2">
            {p.exam.passed ? 'skúška ✓' : 'skúška ✗'}
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
        <Badge tone={s.enrolment_status === 'active' ? 'accent' : 'neutral'}>{ENROLMENT_STATUS[s.enrolment_status] ?? s.enrolment_status}</Badge>
      </TableCell>
    </TableRow>
  )
}

function JoinCodeCard({ group }: { group: GroupDetail }) {
  const make = useGroupJoinCode(group.id)
  const code = group.join_code
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
    <Card className="h-fit p-4">
      <h2 className="text-sm font-semibold text-fg">Kód pre aplikáciu</h2>
      <p className="mt-1 text-xs text-muted">Žiak ho zadá v aplikácii Driver SK (Nastavenia → Autoškola). Aplikácia ho pridá do tohto kurzu a začne posielať pokrok.</p>
      {code ? (
        <>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-md border border-line bg-sunken px-3 py-2 text-center font-mono text-xl tracking-[0.3em] text-fg">{code.code}</code>
            <Button icon aria-label="Kopírovať kód" onClick={copy}>
              <CopyIcon aria-hidden />
            </Button>
          </div>
          <p className="mt-2 text-xs text-subtle">Platí do {formatDate(code.expires_at)}, pre celý kurz.</p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Kurz zatiaľ nemá platný kód.</p>
      )}
      <Button size="sm" variant="ghost" className="mt-3" loading={make.isPending} onClick={() => make.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
        <RefreshCwIcon aria-hidden /> {code ? 'Nový kód' : 'Vytvoriť kód'}
      </Button>
    </Card>
  )
}

function TheoryTab({ group }: { group: GroupDetail }) {
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
        <p className="text-sm text-muted">
          {held} z {group.theory_lessons_required} vyučovacích hodín · kliknutím na hodinu upravíte dochádzku
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> Zapísať hodinu
        </Button>
      </div>
      {lessons.data.length === 0 ? (
        <EmptyState title="Zatiaľ žiadna teória">Zapíšte prvý blok výučby a kto na ňom bol.</EmptyState>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Dátum</TableHeaderCell>
              <TableHeaderCell>Predmet</TableHeaderCell>
              <TableHeaderCell>Téma</TableHeaderCell>
              <TableHeaderCell>Inštruktor</TableHeaderCell>
              <TableHeaderCell className="text-right">Hodiny</TableHeaderCell>
              <TableHeaderCell className="text-right">Prítomní</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lessons.data.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => setEditing(l)}>
                <TableCell>{formatDate(l.held_on)}{l.starts_at && <span className="ml-1 text-xs text-subtle">{l.starts_at.slice(0, 5)}</span>}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted">{l.subject}</span> {SUBJECT[l.subject]}
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
      <DialogContent title="Zapísať hodinu teórie" description="Jeden blok má najviac 6 vyučovacích hodín po 45 minút.">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Dátum">
                <Input type="date" value={form.held_on} onChange={set('held_on')} required />
              </Field>
              <Field label="Začiatok">
                <Input type="time" value={form.starts_at} onChange={set('starts_at')} />
              </Field>
              <Field label="Hodiny">
                <Input type="number" min={1} max={6} value={form.lessons} onChange={set('lessons')} required />
              </Field>
            </div>
            <div className="grid grid-cols-[12rem_1fr] gap-3">
              <Field label="Predmet">
                <Select value={form.subject} onChange={set('subject')}>
                  {Object.entries(SUBJECT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} · {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Téma">
                <Input value={form.topic} onChange={set('topic')} placeholder="napr. Križovatky, prednosť v jazde" />
              </Field>
            </div>
            <AttendancePicker students={active} present={present} onChange={setPresent} />
            {add.isError && <p className="text-sm text-danger-text">{errorMessage(add.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
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

function AttendancePicker({ students, present, onChange }: { students: GroupStudent[]; present: Set<string>; onChange: (s: Set<string>) => void }) {
  const toggle = (id: string, on: boolean) => {
    const next = new Set(present)
    if (on) next.add(id)
    else next.delete(id)
    onChange(next)
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full items-center justify-between text-xs font-medium text-muted">
        <span>
          Prítomní ({present.size}/{students.length})
        </span>
        <span className="flex gap-2">
          <button type="button" className="text-accent-text hover:underline" onClick={() => onChange(new Set(students.map((s) => s.id)))}>
            všetci
          </button>
          <button type="button" className="text-accent-text hover:underline" onClick={() => onChange(new Set())}>
            nikto
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
  const save = useSetAttendance(group.id)
  const active = group.students.filter((s) => s.enrolment_status === 'active')
  const [present, setPresent] = useState<Set<string>>(() => new Set(lesson.present_ids))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Dochádzka · ${formatDate(lesson.held_on)}`} description={`${lesson.subject} · ${SUBJECT[lesson.subject]} · ${lesson.lessons} h`} size="sm">
        <DialogBody>
          <AttendancePicker students={active} present={present} onChange={setPresent} />
          {save.isError && <p className="text-sm text-danger-text">{errorMessage(save.error)}</p>}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Zrušiť</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ lessonId: lesson.id, present_ids: [...present] }, { onSuccess: onClose })}>
            Uložiť
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentsTab({ group }: { group: GroupDetail }) {
  const create = useCreateGroupDocument(group.id)
  const [place, setPlace] = useState('')
  const [authority, setAuthority] = useState('')
  const make = (kind: string) =>
    create.mutate(
      { kind, fields: { place, authority } },
      {
        onSuccess: (d) => window.open(documentUrl(d.id), '_blank', 'noopener'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  return (
    <div className="grid grid-cols-2 gap-4 max-desk:grid-cols-1">
      <Card className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FileTextIcon aria-hidden className="size-4 text-subtle" /> Prihláška na skúšku z odbornej spôsobilosti
        </h3>
        <p className="mt-1 text-xs text-muted">Príloha č. 2 k vyhláške č. 9/2009 Z. z.: list pre dopravný inšpektorát a menný zoznam žiakov kurzu s rodnými číslami a adresami. Chýbajúce údaje doplňte na kartách žiakov.</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Miesto">
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Žiline" />
          </Field>
          <Field label="Orgán PZ">
            <Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="OR PZ Žilina, ODI" />
          </Field>
        </div>
        <Button variant="primary" className="mt-3" loading={create.isPending} onClick={() => make('exam_application')}>
          Vytvoriť PDF
        </Button>
      </Card>
      <Card className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FileTextIcon aria-hidden className="size-4 text-subtle" /> Prezenčná listina výučby teórie
        </h3>
        <p className="mt-1 text-xs text-muted">Tabuľka hodín a žiakov s účasťou, pre vlastnú evidenciu autoškoly (záväzná triedna kniha je v JISCD).</p>
        <Button variant="primary" className="mt-3" loading={create.isPending} onClick={() => make('attendance_sheet')}>
          Vytvoriť PDF
        </Button>
      </Card>
      <Section title="Čo vieme vygenerovať pre jednotlivých žiakov" className="col-span-full">
        <p className="text-sm text-muted">Zmluvu o vykonaní kurzu, potvrdenie o absolvovaní kurzu, súhlas zákonného zástupcu s informáciou o osobných údajoch a výpis z prípravy nájdete na karte každého žiaka.</p>
      </Section>
    </div>
  )
}
