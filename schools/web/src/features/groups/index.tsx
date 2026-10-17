import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { LoadError, Loading, Page } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { Meter } from '@/components/ui/meter'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { useT } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useBranches, useCreateGroup, useGroups, useInstructors } from '@/lib/queries'
import type { GroupStatus } from '@/lib/types'

const STATUS_TONE: Record<GroupStatus, 'accent' | 'success' | 'neutral' | 'warning'> = { running: 'accent', finished: 'success', planned: 'warning', archived: 'neutral' }

export default function GroupsPage() {
  const t = useT()
  const groups = useGroups()
  const [open, setOpen] = useState(false)
  if (groups.isPending) return <Loading />
  if (groups.isError) return <LoadError error={groups.error} />
  return (
    <Page
      title={t('courses.title')}
      description={t('courses.description')}
      actions={
        <Button variant="primary" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden /> {t('courses.new')}
        </Button>
      }
    >
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{t('col.course')}</TableHeaderCell>
            <TableHeaderCell>{t('col.category')}</TableHeaderCell>
            <TableHeaderCell>{t('col.branch')}</TableHeaderCell>
            <TableHeaderCell>{t('col.status')}</TableHeaderCell>
            <TableHeaderCell>{t('col.start')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.students')}</TableHeaderCell>
            <TableHeaderCell>{t('col.readiness')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.attendance')}</TableHeaderCell>
            <TableHeaderCell className="text-right">{t('col.drivingAvg')}</TableHeaderCell>
            <TableHeaderCell>{t('col.exam')}</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.data.map((g) => (
            <TableRow key={g.id}>
              <TableCell>
                <Link to="/kurzy/$groupId" params={{ groupId: g.id }} className="font-medium text-fg hover:underline">
                  {g.name}
                </Link>
                <span className="ml-2 text-xs text-subtle">{g.lead_instructor_name}</span>
              </TableCell>
              <TableCell>{g.category}</TableCell>
              <TableCell className="text-muted">{g.branch_name ?? '–'}</TableCell>
              <TableCell>
                <Badge tone={STATUS_TONE[g.status]}>{t(`groupStatus.${g.status}`)}</Badge>
              </TableCell>
              <TableCell className="text-muted">{formatDate(g.starts_on)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {g.students_count} <span className="text-xs text-subtle">{t('courses.appCount', { n: g.stats.linked })}</span>
              </TableCell>
              <TableCell>
                {g.stats.avg_readiness === null ? (
                  <span className="text-xs text-subtle">–</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Meter value={g.stats.avg_readiness} max={100} label={t('course.avgReadiness')} className="w-20" />
                    <span className="tabular-nums">{g.stats.avg_readiness}</span>
                    {g.stats.ready_count > 0 && <span className="text-xs text-success-text">{t('courses.readyShort', { n: g.stats.ready_count })}</span>}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted">{g.stats.avg_theory_attendance === null ? '–' : `${g.stats.avg_theory_attendance} %`}</TableCell>
              <TableCell className="text-right tabular-nums text-muted">
                {g.stats.avg_driving_lessons === null ? '–' : `${g.stats.avg_driving_lessons}/${g.driving_lessons_required}`}
              </TableCell>
              <TableCell className="text-muted">{formatDate(g.exam_on)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <NewGroupDialog open={open} onOpenChange={setOpen} />
    </Page>
  )
}

function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const branches = useBranches()
  const instructors = useInstructors()
  const create = useCreateGroup()
  const [form, setForm] = useState({ name: '', category: 'B', branch_id: '', starts_on: '', exam_on: '', lead_instructor_id: '', status: 'planned' })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      {
        name: form.name,
        category: form.category,
        branch_id: form.branch_id || null,
        starts_on: form.starts_on || null,
        exam_on: form.exam_on || null,
        lead_instructor_id: form.lead_instructor_id || null,
        status: form.status as GroupStatus,
        theory_lessons_required: form.category === 'B' ? 32 : 26,
        driving_lessons_required: form.category === 'B' ? 39 : 18,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('courses.new')} description={t('courses.newDescription')} size="sm">
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label={t('courses.name')} hint={t('courses.nameHint')}>
              <Input value={form.name} onChange={set('name')} required autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('courses.category')}>
                <Select value={form.category} onChange={set('category')}>
                  {['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C', 'CE', 'D', 'T'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('courses.status')}>
                <Select value={form.status} onChange={set('status')}>
                  <option value="planned">{t('groupStatus.planned')}</option>
                  <option value="running">{t('groupStatus.running')}</option>
                </Select>
              </Field>
            </div>
            <Field label={t('courses.branch')}>
              <Select value={form.branch_id} onChange={set('branch_id')}>
                <option value="">–</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('courses.leadInstructor')}>
              <Select value={form.lead_instructor_id} onChange={set('lead_instructor_id')}>
                <option value="">–</option>
                {instructors.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('courses.start')}>
                <Input type="date" value={form.starts_on} onChange={set('starts_on')} />
              </Field>
              <Field label={t('courses.exam')}>
                <Input type="date" value={form.exam_on} onChange={set('exam_on')} />
              </Field>
            </div>
            {create.isError && <p className="text-sm text-danger-text">{errorMessage(create.error)}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t('courses.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
