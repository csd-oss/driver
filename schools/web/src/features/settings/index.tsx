import { useState, type FormEvent } from 'react'
import { LoadError, Loading, Page, Section } from '@/components/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useBranches, useInstructors, useSchool, useUpdateSchool } from '@/lib/queries'
import type { School } from '@/lib/types'

function SchoolForm({ school }: { school: School }) {
  const auth = useAuth()
  const update = useUpdateSchool()
  const [form, setForm] = useState<Partial<School>>(school)
  const admin = auth.me?.role === 'admin'
  const submit = (e: FormEvent) => {
    e.preventDefault()
    update.mutate(form, { onSuccess: () => toast('Údaje autoškoly uložené', { tone: 'success' }), onError: (err) => toast.error(errorMessage(err)) })
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold text-fg">Údaje autoškoly</h2>
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          <Input value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} disabled={!admin} />
        </Field>
      ))}
      {admin ? (
        <Button type="submit" variant="primary" loading={update.isPending} className="self-start">
          Uložiť
        </Button>
      ) : (
        <p className="text-xs text-subtle">Údaje môže meniť len správca autoškoly.</p>
      )}
    </form>
  )
}

const FIELDS: { key: keyof Omit<School, 'id'>; label: string; hint?: string }[] = [
  { key: 'name', label: 'Názov (ako ho vidia žiaci)' },
  { key: 'legal_name', label: 'Obchodné meno', hint: 'Tlačí sa na dokumenty' },
  { key: 'ico', label: 'IČO' },
  { key: 'address', label: 'Sídlo' },
  { key: 'registration_no', label: 'Číslo registrácie autoškoly', hint: 'z rozhodnutia okresného úradu v sídle kraja' },
  { key: 'trade_licence_no', label: 'Číslo živnostenského oprávnenia' },
  { key: 'responsible_person', label: 'Prevádzkovateľ / zodpovedný zástupca', hint: 'podpisuje osvedčenia a zmluvy' },
  { key: 'phone', label: 'Telefón' },
  { key: 'email', label: 'E-mail' },
]

export default function SettingsPage() {
  const school = useSchool()
  const instructors = useInstructors()
  const branches = useBranches()
  if (school.isPending) return <Loading />
  if (school.isError) return <LoadError error={school.error} />
  return (
    <Page title="Autoškola" description="Údaje, ktoré sa tlačia na dokumenty, a ľudia, ktorí sa môžu prihlásiť.">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 max-desk:grid-cols-1">
        <SchoolForm key={school.dataUpdatedAt} school={school.data} />
        <div className="flex flex-col gap-6">
          <Section title="Ľudia">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Meno</TableHeaderCell>
                  <TableHeaderCell>Rola</TableHeaderCell>
                  <TableHeaderCell>Inštruktorský preukaz</TableHeaderCell>
                  <TableHeaderCell>Skupiny</TableHeaderCell>
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
                      <Badge tone={i.role === 'admin' ? 'accent' : 'neutral'}>{i.role === 'admin' ? 'správca' : 'inštruktor'}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">{i.instructor_card_no || '–'}</TableCell>
                    <TableCell className="text-muted">{i.instructor_groups || '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-subtle">Pridávanie ľudí a zmena hesla zatiaľ nie sú v rozhraní (MVP); urobíme ich cez pozvánku e-mailom.</p>
          </Section>
          <Section title="Pobočky">
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
