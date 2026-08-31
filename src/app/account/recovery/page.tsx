import type { Metadata } from 'next'
import { KeyRound } from 'lucide-react'
import { beginAccountRecovery } from './actions'

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
  searchParams: Promise<{ id?: string; expires?: string; token?: string }>
}) {
  const params = await searchParams
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <section className="rounded-2xl border bg-background p-8 shadow-sm">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Recover your AeroTrade account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Opening this page has not changed your password. Continue only if you requested account recovery.</p>
          </div>
        </div>
        <form action={beginAccountRecovery} className="mt-6">
          <input type="hidden" name="id" value={params.id || ''} />
          <input type="hidden" name="expires" value={params.expires || ''} />
          <input type="hidden" name="token" value={params.token || ''} />
          <button className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90">Continue and choose a new password</button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">This confirmation is one-time and expires after 30 minutes. Automated email scanners cannot change the account by opening this page.</p>
      </section>
    </main>
  )
}
