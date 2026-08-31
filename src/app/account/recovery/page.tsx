import type { Metadata } from 'next'
import { KeyRound } from 'lucide-react'
import { minimumAccountPasswordLength } from '@/utils/account-recovery.mjs'
import { completeAccountRecovery } from './actions'

export const metadata: Metadata = {
  title: 'Confirm account recovery | AeroTrade',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AccountRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; expires?: string; request?: string; token?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <section className="rounded-2xl border bg-background p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Recover your AeroTrade account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Choose a new password for the AeroTrade account that requested recovery. Opening this page has not changed anything.</p>
          </div>
        </div>
        {params.error ? <p className="mt-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{params.error}</p> : null}
        <form action={completeAccountRecovery} className="mt-6 space-y-4">
          <input type="hidden" name="id" value={params.id || ''} />
          <input type="hidden" name="expires" value={params.expires || ''} />
          <input type="hidden" name="request" value={params.request || ''} />
          <input type="hidden" name="token" value={params.token || ''} />
          <label className="block space-y-2 text-sm font-medium" htmlFor="password">
            New password
            <input id="password" name="password" type="password" required minLength={minimumAccountPasswordLength} maxLength={128} autoComplete="new-password" className="w-full rounded-lg border bg-input/50 px-3 py-2.5 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <label className="block space-y-2 text-sm font-medium" htmlFor="password_confirmation">
            Confirm new password
            <input id="password_confirmation" name="password_confirmation" type="password" required minLength={minimumAccountPasswordLength} maxLength={128} autoComplete="new-password" className="w-full rounded-lg border bg-input/50 px-3 py-2.5 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">Save new password</button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Use at least {minimumAccountPasswordLength} characters. The link is one-time and expires after 30 minutes. Email scanners cannot change the account by opening this page.</p>
      </section>
    </main>
  )
}
