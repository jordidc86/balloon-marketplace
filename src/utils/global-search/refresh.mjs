import { timingSafeEqual } from 'node:crypto'
import { GLOBAL_SEARCH_SOURCES } from './sources.mjs'
import { fetchSourceSnapshot } from './fetch.mjs'
import { reconcileSnapshot, visibleExternalListings } from './index.mjs'

export function authorizedRefresh(request, secret) {
  const actual = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return Boolean(secret && request.method === 'POST' && actual.length === expected.length && timingSafeEqual(actual, expected))
}

export async function refreshExternalCatalog(client, { crawl = fetchSourceSnapshot, now = Date.now } = {}) {
  const runKey = new Date(now()).toISOString().slice(0, 10)
  const results = await Promise.allSettled(GLOBAL_SEARCH_SOURCES.map(async source => {
    const { data: token, error: claimError } = await client.rpc('claim_external_catalog_refresh', { p_source: source.id, p_run_key: runKey })
    if (claimError) throw new Error(`Could not claim ${source.id}`)
    if (!token) return { source: source.id, status: 'already_claimed' }
    const { data: row, error: readError } = await client.from('external_catalog_sources').select('snapshot').eq('source_id', source.id).single()
    if (readError) throw new Error(`Could not read ${source.id}`)
    const incoming = await crawl(source)
    const snapshot = reconcileSnapshot(row.snapshot, incoming, source, now())
    const { data: saved, error: writeError } = await client.from('external_catalog_sources').update({
      snapshot, last_completed_at: new Date(now()).toISOString(), last_run_key: runKey, lease_until: null, lease_token: null,
    }).eq('source_id', source.id).eq('lease_token', token).select('source_id')
    if (writeError || saved?.length !== 1) throw new Error(`Could not persist ${source.id}`)
    return { source: source.id, status: incoming.status, pagesRead: incoming.pagesRead, adverts: visibleExternalListings([snapshot], now()).length }
  }))
  return results.map((result, index) => result.status === 'fulfilled' ? result.value : { source: GLOBAL_SEARCH_SOURCES[index].id, status: 'error' })
}
