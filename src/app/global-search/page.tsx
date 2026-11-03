import type { Metadata } from 'next'
import Link from 'next/link'
import GlobalSearch from './GlobalSearch'

export const metadata: Metadata = {
  title: 'Global Balloon Search | AeroTrade',
  description: 'Explore used balloons and equipment across selected specialist marketplaces, with links to the original adverts.',
  alternates: { canonical: '/global-search' },
  robots: { index: false, follow: true },
}

export default function GlobalSearchPage() {
  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <div className="max-w-3xl">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">AeroTrade · Global search · Beta</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">One search. More places to look.</h1>
      <p className="mt-4 text-lg text-muted-foreground">Find used balloons and equipment across specialist portals. Compare the results here, then visit the original advert.</p>
      <p className="mt-3 text-sm text-muted-foreground">This is a selection of public catalogue pages, not a complete inventory of every portal. Availability and prices must be confirmed with the seller.</p>
      <Link href="/catalog" className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4">Browse listings on AeroTrade →</Link>
    </div>
    <GlobalSearch />
  </main>
}
