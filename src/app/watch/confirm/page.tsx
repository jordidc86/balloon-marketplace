import type { Metadata } from 'next'
import WatchDecisionForm from '../WatchDecisionForm'

export const metadata: Metadata = { title: 'Confirm listing updates | AeroTrade', robots: { index: false, follow: false } }

export default async function ConfirmWatchPage({ searchParams }: { searchParams: Promise<{ id?: string; token?: string }> }) {
  const params = await searchParams
  return <main className="mx-auto max-w-xl px-4 py-16"><WatchDecisionForm mode="confirm" id={params.id || ''} token={params.token || ''} /></main>
}
