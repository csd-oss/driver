import { Link } from '@tanstack/react-router'
import { CalendarClockIcon } from 'lucide-react'
import { LoadError, Loading, Page, Section } from '@/components/page'
import { StatTile } from '@/components/readiness'
import { Card } from '@/components/ui/card'
import { Meter } from '@/components/ui/meter'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { useI18n } from '@/i18n'
import { daysUntil, formatDate, formatNumber, percent } from '@/lib/format'
import { useGroups, useOverview, useSchool } from '@/lib/queries'

export default function Dashboard() {
  const { t, tp } = useI18n()
  const overview = useOverview()
  const groups = useGroups()
  const school = useSchool()
  if (overview.isPending || groups.isPending) return <Loading />
  if (overview.isError) return <LoadError error={overview.error} />
  if (groups.isError) return <LoadError error={groups.error} />
  const o = overview.data
  const running = groups.data.filter((g) => g.status === 'running')
  const passRate = percent(o.exams_passed, o.exams_taken)
  const bucketsTotal = o.readiness_buckets.reduce((s, b) => s + b.count, 0)

  return (
    <Page title={school.data?.name ?? t('overview.title')} description={t('overview.description')}>
      <div className="grid grid-cols-4 gap-3 max-desk:grid-cols-2">
        <StatTile label={t('overview.activeStudents')} value={o.students_active} hint={t('overview.withApp', { n: o.students_linked })} />
        <StatTile label={t('overview.avgReadiness')} value={o.avg_readiness ?? '–'} hint={t('overview.avgReadinessHint')} tone="accent" />
        <StatTile label={t('overview.readyForExam')} value={o.ready_count} hint={t('overview.almostReadyHint', { n: o.almost_ready_count })} tone="success" />
        <StatTile label={t('overview.studiedThisWeek')} value={o.active_students_7d} hint={t('overview.answers7d', { n: formatNumber(o.attempts_7d) })} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 max-desk:grid-cols-1">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">{t('overview.distribution')}</h2>
          <div className="flex flex-col gap-2.5">
            {[...o.readiness_buckets].reverse().map((b) => (
              <div key={b.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span className="text-muted">{t(`readiness.${b.label}`)}</span>
                <span className="tabular-nums text-fg">{b.count}</span>
                <Meter
                  value={b.count}
                  max={Math.max(1, bucketsTotal)}
                  label={t(`readiness.${b.label}`)}
                  tone={b.label === 'ready' ? 'in' : b.label === 'almostReady' ? 'default' : b.label === 'gettingThere' ? 'warn' : 'over'}
                  className="col-span-2"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-subtle">{bucketsTotal === 0 ? t('overview.nobodyLinked') : tp('overview.withAppData', bucketsTotal)}</p>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">{t('overview.upcomingExams')}</h2>
          {o.upcoming_exams.length === 0 ? (
            <p className="text-sm text-muted">{t('overview.noExamDates')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {o.upcoming_exams.map((e) => {
                const days = daysUntil(e.exam_on) ?? 0
                return (
                  <li key={e.group_id}>
                    <Link to="/kurzy/$groupId" params={{ groupId: e.group_id }} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
                      <CalendarClockIcon aria-hidden className="size-4 flex-none text-subtle" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium text-fg">{e.group_name}</span>
                        <span className="text-xs text-muted">
                          {formatDate(e.exam_on)} · {tp('students.count', e.students)}
                        </span>
                      </span>
                      <span className={days <= 14 ? 'text-xs font-medium text-warning-text' : 'text-xs text-subtle'}>{tp('time.inDays', days)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">{t('overview.realExams')}</h2>
          <p className="text-3xl font-semibold tabular-nums text-fg">{passRate === null ? '–' : `${passRate} %`}</p>
          <p className="text-sm text-muted">{tp('overview.passRate', o.exams_taken)}</p>
          <p className="mt-3 text-xs text-subtle">{t('overview.realExamsHint')}</p>
        </Card>
      </div>

      <Section
        title={t('overview.runningCourses')}
        className="mt-6"
        actions={
          <Link to="/kurzy" className="text-xs text-accent-text hover:underline">
            {t('overview.allCourses')}
          </Link>
        }
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t('col.course')}</TableHeaderCell>
              <TableHeaderCell>{t('col.status')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.students')}</TableHeaderCell>
              <TableHeaderCell className="text-right">{t('col.withApp')}</TableHeaderCell>
              <TableHeaderCell>{t('col.readiness')}</TableHeaderCell>
              <TableHeaderCell>{t('col.theory')}</TableHeaderCell>
              <TableHeaderCell>{t('col.exam')}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {running.map((g) => (
              <TableRow key={g.id}>
                <TableCell>
                  <Link to="/kurzy/$groupId" params={{ groupId: g.id }} className="font-medium text-fg hover:underline">
                    {g.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted">{t(`groupStatus.${g.status}`)}</TableCell>
                <TableCell className="text-right tabular-nums">{g.students_count}</TableCell>
                <TableCell className="text-right tabular-nums">{g.stats.linked}</TableCell>
                <TableCell>
                  {g.stats.avg_readiness === null ? (
                    <span className="text-xs text-subtle">–</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Meter value={g.stats.avg_readiness} max={100} label={t('overview.avgReadiness')} className="w-20" />
                      <span className="tabular-nums">{g.stats.avg_readiness}</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted">
                  {g.theory_lessons_held}/{g.theory_lessons_required} {t('common.hoursShort')}
                </TableCell>
                <TableCell className="text-muted">{formatDate(g.exam_on)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </Page>
  )
}
