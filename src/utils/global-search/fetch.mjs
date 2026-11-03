import { parseSourcePageData } from './parse.mjs'
import { robotsPolicy } from './robots.mjs'

const USER_AGENT = 'AeroTradeSearch/1.0 (+https://aerotrade.app/catalog)'
const MAX_BYTES = 2_000_000
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function readText(url, fetcher) {
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain;q=0.9' },
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Source too large')
  if (!response.body) throw new Error('Empty response')
  const reader = response.body.getReader()
  let size = 0
  const chunks = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('Source too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchSourceSnapshot(source, { fetcher = fetch, sleep = wait, now = Date.now, budgetMs = 240000 } = {}) {
  const started = now()
  const base = { sourceId: source.id, checkedAt: null, pagesRead: 0, pagesPlanned: source.pages.length, listings: [] }
  let robots
  try { robots = await readText(`${source.origin}/robots.txt`, fetcher) }
  catch { return { ...base, status: 'unavailable' } }
  let failures = 0
  let blocked = false
  let pagesRead = 0
  const listings = []
  const pages = []
  const removedUrls = []
  const failedPaths = []
  for (const path of source.pages) {
    const url = source.origin + path
    const policy = robotsPolicy(robots, url)
    if (!policy.allowed || policy.delay > 10) { blocked = true; continue }
    // Leave a margin under the function deadline. Report partial coverage rather
    // than claiming that a timed-out category contains no adverts.
    if (now() - started + policy.delay * 1000 + 10000 > budgetMs) { failures++; break }
    await sleep(policy.delay * 1000)
    try {
      let html
      try { html = await readText(url, fetcher) }
      catch (error) {
        const transient = ['TimeoutError', 'AbortError'].includes(error?.name) || /fetch failed|Source HTTP 5\d\d/.test(error?.message || '')
        if (!transient || now() - started + policy.delay * 1000 + 10000 > budgetMs) throw error
        await sleep(policy.delay * 1000)
        html = await readText(url, fetcher)
      }
      const parsed = parseSourcePageData(html, source, path)
      listings.push(...parsed.listings)
      removedUrls.push(...parsed.removedUrls)
      pages.push({ path, checkedAt: new Date(now()).toISOString(), listings: parsed.listings })
      pagesRead++
    } catch { failures++; failedPaths.push(path) }
  }
  return {
    ...base, pages, removedUrls, failedPaths, checkedAt: pagesRead ? new Date(now()).toISOString() : null, pagesRead,
    status: pagesRead ? (failures || blocked ? 'partial' : 'ok') : (blocked ? 'blocked' : 'unavailable'),
    listings: [...new Map(listings.map(listing => [listing.url, listing])).values()].slice(0, 500),
  }
}
