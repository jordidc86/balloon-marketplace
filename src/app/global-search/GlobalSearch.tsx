'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { GLOBAL_SEARCH_SOURCES, filterGlobalListings } from '@/utils/global-search/sources.mjs'

type Listing = { sourceId: string; title: string; url: string; price: string | null; registration: string | null }
type Snapshot = { sourceId: string; status: string; checkedAt: string | null; pagesRead: number; pagesPlanned: number; listings: Listing[] }

export default function GlobalSearch() {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({})
  const [query, setQuery] = useState('')
  const [portal, setPortal] = useState('all')
  useEffect(() => {
    const controller = new AbortController()
    for (const source of GLOBAL_SEARCH_SOURCES) {
      fetch(`/api/global-search/${source.id}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Unavailable')
          const data: Snapshot = await response.json()
          // An old cache entry must never look like a fresh check after a long outage.
          if (data.checkedAt && Date.now() - Date.parse(data.checkedAt) > 48 * 60 * 60 * 1000) {
            data.status = 'stale'; data.listings = []
          }
          setSnapshots(previous => ({ ...previous, [source.id]: data }))
        }).catch(() => {
          if (!controller.signal.aborted) setSnapshots(previous => ({ ...previous, [source.id]: { sourceId: source.id, status: 'unavailable', checkedAt: null, pagesRead: 0, pagesPlanned: source.pages.length, listings: [] } }))
        })
    }
    return () => controller.abort()
  }, [])
  const listings = useMemo(() => Object.values(snapshots).flatMap(s => s.listings), [snapshots])
  const matches: Listing[] = useMemo(() => filterGlobalListings(listings, query, portal), [listings, query, portal])
  const duplicates = useMemo(() => {
    const groups = new Map<string, Set<string>>()
    for (const listing of listings) if (listing.registration) {
      const sources = groups.get(listing.registration) || new Set<string>()
      sources.add(listing.sourceId); groups.set(listing.registration, sources)
    }
    return groups
  }, [listings])
  const loading = Object.keys(snapshots).length < GLOBAL_SEARCH_SOURCES.length
  return <>
    <div className="mt-8 grid gap-4 rounded-2xl border bg-secondary/30 p-4 sm:grid-cols-[1fr_16rem] sm:p-6">
      <div><label htmlFor="global-query" className="mb-2 block text-sm font-semibold">Model, manufacturer or registration</label>
        <div className="relative"><Search aria-hidden="true" size={20} className="absolute left-3 top-3.5 text-muted-foreground" />
          <input id="global-query" type="search" maxLength={100} placeholder="Try Schroeder, Ultramagic or G-CLOX" value={query} onChange={e => setQuery(e.target.value)} className="min-h-12 w-full rounded-lg border bg-background pl-10 pr-3 text-base focus-visible:outline-2 focus-visible:outline-primary" /></div>
      </div>
      <div><label htmlFor="global-portal" className="mb-2 block text-sm font-semibold">Portal</label>
        <select id="global-portal" value={portal} onChange={e => setPortal(e.target.value)} className="min-h-12 w-full rounded-lg border bg-background px-3 text-base">
          <option value="all">All portals</option>{GLOBAL_SEARCH_SOURCES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </div>
    <details className="mt-5 rounded-xl border p-4" open>
      <summary className="cursor-pointer font-semibold">Sources and coverage · {GLOBAL_SEARCH_SOURCES.length} selected portals</summary>
      <p className="mt-3 text-sm text-muted-foreground">Results are cached for about an hour and refreshed when someone visits. A catalogue check does not confirm that an item is still for sale. We do not copy seller contact details or photos.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{GLOBAL_SEARCH_SOURCES.map(source => {
        const data = snapshots[source.id]
        const status = source.manual ? 'Direct link only' : !data ? 'Checking…' : data.status === 'ok' ? `${data.listings.length} adverts retrieved` : data.status === 'partial' ? `Partial results · ${data.listings.length} adverts` : data.status === 'blocked' ? 'Automated access restricted' : data.status === 'stale' ? 'Results too old to display' : 'Could not retrieve this source'
        return <div key={source.id} className="rounded-lg bg-secondary/40 p-3 text-sm">
          <a href={source.origin + source.path} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-2 font-semibold underline underline-offset-4">{source.name}<ExternalLink size={14} aria-hidden="true" /></a>
          <p className="mt-1 font-medium">{status}</p><p className="mt-1 text-xs text-muted-foreground">{source.coverage}</p>
          {data?.checkedAt ? <p className="mt-2 text-xs text-muted-foreground">Checked {new Date(data.checkedAt).toLocaleString()} · {data.pagesRead}/{data.pagesPlanned} pages read</p> : null}
        </div>
      })}</div>
    </details>
    <div className="my-6 flex flex-wrap items-center justify-between gap-3"><p role="status" aria-live="polite" className="font-semibold">{matches.length} matching adverts{loading ? ' · More sources loading…' : ''}</p><p className="text-sm text-muted-foreground">Sorted by title · Prices in original currency</p></div>
    {!matches.length ? <div className="rounded-xl border p-8 text-center"><p className="font-semibold">{loading ? 'Checking the selected catalogues…' : 'No matching adverts in the retrieved pages.'}</p><p className="mt-2 text-sm text-muted-foreground">Try a shorter model name, choose another portal, or use the source links above to browse beyond this selection.</p></div> : null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{matches.map(listing => {
      const source = GLOBAL_SEARCH_SOURCES.find(s => s.id === listing.sourceId)!
      const related = listing.registration && (duplicates.get(listing.registration)?.size || 0) > 1
      return <article key={listing.url} className="flex flex-col rounded-xl border bg-background p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{source.name}</p>
        <h2 className="mt-2 break-words text-lg font-bold">{listing.title}</h2>
        <p className="mt-3 font-semibold text-primary">{listing.price || 'See advert for price'}</p>
        {listing.registration ? <p className="mt-2 text-sm text-muted-foreground">{listing.registration}</p> : null}
        {related ? <p className="mt-2 text-xs text-muted-foreground">This registration also appears on another portal. Compare what each advert includes.</p> : null}
        <a href={listing.url} target="_blank" rel="noopener noreferrer" className="mt-auto flex min-h-12 items-center gap-2 pt-5 font-semibold text-primary underline underline-offset-4">View original advert<ExternalLink size={16} aria-hidden="true" /></a>
      </article>
    })}</div>
  </>
}
