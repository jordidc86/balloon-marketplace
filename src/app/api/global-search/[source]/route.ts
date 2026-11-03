import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { getGlobalSearchSource } from '@/utils/global-search/sources.mjs'
import { fetchSourceSnapshot } from '@/utils/global-search/fetch.mjs'

export const runtime = 'nodejs'
export const maxDuration = 60

// No search term, URL, credentials or user data is sent to external portals.
// A shared cache bounds requests independently of the number of searches.
const pending = new Map<string, ReturnType<typeof fetchSourceSnapshot>>()
const snapshot = unstable_cache(async (id: string) => {
  const source = getGlobalSearchSource(id)
  if (!source) throw new Error('Unknown source')
  const existing = pending.get(id)
  if (existing) return existing
  const request = fetchSourceSnapshot(source)
  pending.set(id, request)
  try { return await request } finally { pending.delete(id) }
}, ['global-search-v1'], { revalidate: 3600 })

export async function GET(_request: Request, context: { params: Promise<{ source: string }> }) {
  const { source } = await context.params
  if (!getGlobalSearchSource(source)) return NextResponse.json({ error: 'Unknown source' }, { status: 404 })
  try {
    // Session middleware may refresh a cookie. Cache only the anonymous source
    // snapshot above, never a browser response carrying a user's auth cookies.
    return NextResponse.json(await snapshot(source), { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
  } catch {
    return NextResponse.json({ error: 'Source temporarily unavailable' }, { status: 503 })
  }
}
