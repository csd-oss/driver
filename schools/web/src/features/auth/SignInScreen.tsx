import { useState, type FormEvent } from 'react'
import { Logo } from '@/components/shell/Logo'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { errorMessage } from '@/lib/api'
import { signedIn } from '@/lib/auth'
import { useLogin } from '@/lib/queries'

/** Email + password. The demo school's logins are in the hint under the form. */
export function SignInScreen() {
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
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-semibold text-fg">Driver pre autoškoly</h1>
            <p className="text-sm text-muted">Prihlásenie pre autoškolu</p>
          </div>
        </div>
        <Field label="E-mail">
          <Input type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Heslo" error={login.isError ? errorMessage(login.error) : null}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={login.isPending}>
          Prihlásiť sa
        </Button>
        <p className="text-xs text-subtle">
          Demo autoškola: <code className="rounded bg-sunken px-1 font-mono text-fg">jana@demo.sk</code> (správca) alebo{' '}
          <code className="rounded bg-sunken px-1 font-mono text-fg">peter@demo.sk</code> (inštruktor), heslo{' '}
          <code className="rounded bg-sunken px-1 font-mono text-fg">driver</code>.
        </p>
      </form>
    </main>
  )
}
