import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { PlusIcon, SearchIcon, SmartphoneIcon } from 'lucide-react'
import { LoadError, Loading, Page } from '@/components/page'
import { ReadinessBar } from '@/components/readiness'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Input, Select } from '@/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { useI18n, useT } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { formatAgo, fullName, isEnrolmentStatus } from '@/lib/format'
import { useCreateStudent, useGroups, useStudents } from '@/lib/queries'

export default function StudentsPage() {
  const { t, tp } = useI18n()
  const search = useSearch({ from: '/app/ziaci' })
  const navigate = useNavigate({ from: '/ziaci' })
  const q = search.q ?? ''
  const students = useStudents(q, search.kurz)
  const groups = useGroups()
  const [open, setOpen] = useState(false)
  return (
    <Page
      title={t('students.title')}
      description={t('students.description')}
      actions={
        <Button variant="primary" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> {t('students.new')}
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-desk:w-full">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input
            aria-label={t('students.search')}
            placeholder={t('students.searchPlaceholder')}
            className="pl-8"
            value={q}
            onChange={(e) => void navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true })}
          />
        </div>
        <Select className="w-56" aria-label={t('students.courseFilter')} value={search.kurz ?? ''} onChange={(e) => void navigate({ search: (s) => ({ ...s, kurz: e.target.value || undefined }), replace: true })}>
          <option value="">{t('students.allCourses')}</option>
          {groups.data?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        {students.data && <span className="text-xs text-subtle">{tp('students.count', students.data.length)}</span>}
      </div>
      {students.isPending ? (
        <Loading />
      ) : students.isError ? (
        <LoadError error={students.error} />
      ) : students.data.length === 0 ? (
        <EmptyState title={t('students.emptyTitle')}>{t('students.emptyHint')}</EmptyState>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="text-right">{t('col.no')}</TableHeaderCell>
              <TableHeaderCell>{t('col.name')}</TableHeaderCell>
              <TableHeaderCell>{t('col.course')}</TableHeaderCell>
              <TableHeaderCell>{t('col.readiness')}</TableHeaderCell>
              <TableHeaderCell>{t('col.lastActivity')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.mistakes')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.mocks')}</TableHeaderCell>
              <TableHeaderCell>{t('col.status')}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-right tabular-nums text-subtle">{s.register_no}</TableCell>
                <TableCell>
                  <Link to="/ziaci/$studentId" params={{ studentId: s.id }} className="font-medium text-fg hover:underline">
                    {fullName(s)}
                  </Link>
                  {s.progress.linked && <SmartphoneIcon aria-label={t('common.appLinked')} className="ml-1.5 inline size-3.5 text-accent-text" />}
                </TableCell>
                <TableCell className="text-muted">
                  {s.group_id ? (
                    <Link to="/kurzy/$groupId" params={{ groupId: s.group_id }} className="hover:underline">
                      {s.group_name}
                    </Link>
                  ) : (
                    '–'
                  )}
                </TableCell>
                <TableCell>
                  <ReadinessBar progress={s.progress} />
                </TableCell>
                <TableCell className="text-muted">{s.progress.linked ? formatAgo(s.progress.last_activity_at) : '–'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.progress.linked ? s.progress.mistakes_count : '–'}</TableCell>
                <TableCell className="text-right tabular-nums">{s.progress.linked ? `${s.progress.mocks_passed}/${s.progress.mocks_taken}` : '–'}</TableCell>
                <TableCell>
                  <Badge tone={s.enrolment_status === 'active' ? 'accent' : s.enrolment_status === 'finished' ? 'success' : 'neutral'}>
                    {isEnrolmentStatus(s.enrolment_status) ? t(`enrolmentStatus.${s.enrolment_status}`) : t('students.noCourse')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NewStudentDialog open={open} onOpenChange={setOpen} defaultGroupId={search.kurz} />
    </Page>
  )
}

export function NewStudentDialog({ open, onOpenChange, defaultGroupId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultGroupId?: string }) {
  const t = useT()
  const groups = useGroups()
  const create = useCreateStudent()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', birth_date: '', email: '', phone: '', group_id: defaultGroupId ?? '', price: '' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        first_name: form.first_name,
        last_name: form.last_name,
        birth_date: form.birth_date || null,
        email: form.email,
        phone: form.phone,
        group_id: form.group_id || undefined,
        price_cents: form.price ? Math.round(Number(form.price.replace(',', '.')) * 100) : undefined,
      },
      {
        onSuccess: (s) => {
          onOpenChange(false)
          void navigate({ to: '/ziaci/$studentId', params: { studentId: s.id } })
        },
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('students.new')} description={t('students.newDescription')} size="sm">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('field.firstName')}>
                <Input value={form.first_name} onChange={set('first_name')} required autoFocus />
              </Field>
              <Field label={t('field.lastName')}>
                <Input value={form.last_name} onChange={set('last_name')} required />
              </Field>
            </div>
            <Field label={t('field.birthDate')} hint={t('students.birthDateHint')}>
              <Input type="date" value={form.birth_date} onChange={set('birth_date')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('field.email')}>
                <Input type="email" value={form.email} onChange={set('email')} />
              </Field>
              <Field label={t('field.phone')}>
                <Input value={form.phone} onChange={set('phone')} />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field label={t('students.course')}>
                <Select value={form.group_id} onChange={set('group_id')}>
                  <option value="">{t('students.noCourseYet')}</option>
                  {groups.data
                    ?.filter((g) => g.status !== 'archived')
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label={t('students.price')}>
                <Input inputMode="decimal" value={form.price} onChange={set('price')} placeholder="890" />
              </Field>
            </div>
            {create.isError && <p className="text-sm text-danger-text">{errorMessage(create.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t('students.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
