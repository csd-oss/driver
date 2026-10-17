import { useState, type FormEvent } from 'react'
import { LocaleSwitch } from '@/components/shell/LocaleSwitch'
import { Logo } from '@/components/shell/Logo'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { useI18n } from '@/i18n'
import { translateRich } from '@/i18n/rich'
import { errorMessage } from '@/lib/api'
import { signedIn } from '@/lib/auth'
import { useLogin } from '@/lib/queries'

const Code = ({ children }: { children: string }) => <code className="rounded bg-sunken px-1 font-mono text-fg">{children}</code>

/** Email + password. The demo school's logins are in the hint under the form. */
export function SignInScreen() {
  const { t, locale } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: signedIn })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas-subtle px-4">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-md">
        <div className="flex items-start gap-3">
          <Logo className="size-10" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <h1 className="text-lg font-semibold text-fg">{t('auth.title')}</h1>
            <p className="text-sm text-muted">{t('auth.subtitle')}</p>
          </div>
          <LocaleSwitch className="flex-none" />
        </div>
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('auth.password')} error={login.isError ? errorMessage(login.error, locale) : null}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={login.isPending}>
          {t('auth.signIn')}
        </Button>
        <p className="text-xs text-subtle">
          {translateRich(locale, 'auth.demoHint', { admin: <Code>jana@demo.sk</Code>, instructor: <Code>peter@demo.sk</Code>, password: <Code>driver</Code> })}
        </p>
      </form>
    </main>
  )
}
