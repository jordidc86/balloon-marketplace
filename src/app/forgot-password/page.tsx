import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, CheckCircle, KeyRound } from 'lucide-react'
import { requestPasswordReset } from './actions'

export const metadata: Metadata = {
  title: 'Recover your account | AeroTrade',
  description: 'Request a secure password-reset link for your AeroTrade account.',
  robots: { index: false, follow: false },
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const params = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-7 text-center">
          <KeyRound className="mx-auto mb-3 h-9 w-9 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Recover your AeroTrade account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter the email used for the account. We will send a secure link to choose a new password.</p>
        </div>

        {params.error ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {params.error}
          </div>
        ) : null}
        {params.message ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> {params.message}
          </div>
        ) : null}

        <form action={requestPasswordReset} className="space-y-4">
          <label className="block space-y-2 text-sm font-medium" htmlFor="email">
            Email
            <input id="email" name="email" type="email" required autoComplete="email" className="w-full rounded-lg border bg-input/50 px-3 py-2.5 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">Send secure reset link</button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground"><Link href="/login" className="font-medium text-primary hover:underline">Return to log in</Link></p>
      </section>
    </main>
  )
}
