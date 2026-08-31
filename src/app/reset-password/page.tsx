import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AlertCircle, KeyRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { minimumAccountPasswordLength } from '@/utils/account-recovery.mjs'
import { setRecoveredPassword } from './actions'

export const metadata: Metadata = {
  title: 'Choose a new password | AeroTrade',
  description: 'Set a new password for your AeroTrade account.',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/forgot-password?error=' + encodeURIComponent('This recovery link is invalid or has expired. Request a new one.'))

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-7 text-center">
          <KeyRound className="mx-auto mb-3 h-9 w-9 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">You are recovering the AeroTrade account for <strong>{user.email}</strong>.</p>
        </div>

        {params.error ? (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {params.error}
          </div>
        ) : null}

        <form action={setRecoveredPassword} className="space-y-4">
          <label className="block space-y-2 text-sm font-medium" htmlFor="password">
            New password
            <input id="password" name="password" type="password" required minLength={minimumAccountPasswordLength} maxLength={128} autoComplete="new-password" className="w-full rounded-lg border bg-input/50 px-3 py-2.5 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="block space-y-2 text-sm font-medium" htmlFor="password_confirmation">
            Confirm new password
            <input id="password_confirmation" name="password_confirmation" type="password" required minLength={minimumAccountPasswordLength} maxLength={128} autoComplete="new-password" className="w-full rounded-lg border bg-input/50 px-3 py-2.5 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <p className="text-xs text-muted-foreground">Use at least {minimumAccountPasswordLength} characters. The link can only reset the account opened from the recovery email.</p>
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">Save new password</button>
        </form>
      </section>
    </main>
  )
}
