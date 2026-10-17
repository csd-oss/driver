import { useState, type FormEvent } from 'react'
import { LoadError, Loading, Page, Section } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { type MessageKey, useT } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranches, useInstructors, useSchool, useUpdateSchool } from '@/lib/queries'
import type { School } from '@/lib/types'

function SchoolForm({ school }: { school: School }) {
  const t = useT()
  const auth = useAuth()
  const update = useUpdateSchool()
  const [form, setForm] = useState<Partial<School>>(school)
  const admin = auth.me?.role === 'admin'
  const submit = (e: FormEvent) => {
    e.preventDefault()
    update.mutate(form, { onSuccess: () => toast(t('school.saved'), { tone: 'success' }), onError: (err) => toast.error(errorMessage(err)) })
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">{t('school.dataTitle')}</h2>
      {FIELDS.map((f) => (
        <Field key={f.key} label={t(f.label)} hint={f.hint ? t(f.hint) : undefined}>
          <Input value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} disabled={!admin} />
        </Field>
      ))}
      {admin ? (
        <Button type="submit" variant="primary" loading={update.isPending} className="self-start">
          {t('common.save')}
        </Button>
      ) : (
        <p className="text-xs text-subtle">{t('school.adminOnly')}</p>
      )}
    </form>
  )
}

const FIELDS: { key: keyof Omit<School, 'id'>; label: MessageKey; hint?: MessageKey }[] = [
  { key: 'name', label: 'school.name' },
  { key: 'legal_name', label: 'school.legalName', hint: 'school.legalNameHint' },
  { key: 'ico', label: 'school.ico' },
  { key: 'address', label: 'school.address' },
  { key: 'registration_no', label: 'school.registrationNo', hint: 'school.registrationNoHint' },
  { key: 'trade_licence_no', label: 'school.tradeLicenceNo' },
  { key: 'responsible_person', label: 'school.responsiblePerson', hint: 'school.responsiblePersonHint' },
  { key: 'phone', label: 'school.phone' },
  { key: 'email', label: 'school.email' },
]

export default function SettingsPage() {
  const t = useT()
  const school = useSchool()
  const instructors = useInstructors()
  const branches = useBranches()
  if (school.isPending) return <Loading />
  if (school.isError) return <LoadError error={school.error} />
  return (
    <Page title={t('school.title')} description={t('school.description')}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-desk:grid-cols-1">
        <SchoolForm key={school.dataUpdatedAt} school={school.data} />
        <div className="flex flex-col gap-6">
          <Section title={t('school.people')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t('col.name')}</TableHeaderCell>
                  <TableHeaderCell>{t('col.role')}</TableHeaderCell>
                  <TableHeaderCell>{t('col.instructorCard')}</TableHeaderCell>
                  <TableHeaderCell>{t('col.categories')}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {instructors.data?.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="font-medium text-fg">{i.name}</span>
                      <span className="ml-2 text-xs text-subtle">{i.email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={i.role === 'admin' ? 'accent' : 'neutral'}>{t(`role.${i.role}`)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">{i.instructor_card_no || '–'}</TableCell>
                    <TableCell className="text-muted">{i.instructor_groups || '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-subtle">{t('school.peopleHint')}</p>
          </Section>
          <Section title={t('school.branches')}>
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
              {branches.data?.map((b) => (
                <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium text-fg">{b.name}</span>
                  <span className="text-muted">{b.address}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </Page>
  )
}
