import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getGlobalSearchSource, canonicalCountry, GLOBAL_SEARCH_SOURCES, safeThumbnailUrl } from '../src/utils/global-search/sources.mjs'
import { fetchSourceSnapshot } from '../src/utils/global-search/fetch.mjs'
import { categoryForPath, parseSourcePageData } from '../src/utils/global-search/parse.mjs'
import { hasCurrentExternalPages, matchesCatalogText, reconcileSnapshot, visibleExternalListings, searchExternalListings, externalPrice } from '../src/utils/global-search/index.mjs'
import { authorizedRefresh, refreshExternalCatalog } from '../src/utils/global-search/refresh.mjs'

const source = getGlobalSearchSource('zebedee')
const now = Date.parse('2026-11-03T12:00:00Z')
const date = new Date(now).toISOString()
const advert = (slug = 'example') => ({ sourceId: 'zebedee', url: `${source.origin}/zebedee_list/${slug}/`, title: 'Schroeder G-ABCD', price: '£12,900', registration: 'G-ABCD', category: 'complete', country: 'Spain', firstSeenAt: date })
const page = (listings = [advert()], checkedAt = date, path = source.pages[0]) => ({ path, checkedAt, listings })
const snapshot = (pages = [page()]) => ({ sourceId: source.id, pages })

test('review 1: the existing catalogue owns the search, cards and mobile navigation', () => {
  const catalog = readFileSync(new URL('../src/app/catalog/page.tsx', import.meta.url), 'utf8')
  assert.ok(catalog.indexOf('catalogListings as ListingWithImages[]') < catalog.indexOf('externalListings.map'))
  assert.match(catalog, /totalResults === 0/)
  assert.match(catalog, /resultCount: totalResults/)
  assert.doesNotMatch(catalog, /href="\/global-search"|Sources and coverage|selected portals|Beta/)
  assert.doesNotMatch(readFileSync(new URL('../src/components/MobileNavigation.tsx', import.meta.url), 'utf8'), /global-search/)
  assert.match(readFileSync(new URL('../src/app/global-search/page.tsx', import.meta.url), 'utf8'), /permanentRedirect/)
})

test('review 2: model punctuation, accents and multiple words match in one search', () => {
  assert.equal(matchesCatalogText({ title: 'Schröder G-ABCD' }, 'schroeder g abcd'), true)
  assert.equal(matchesCatalogText({ title: 'Ultramagic B-26' }, 'ultramagic b26'), true)
  assert.equal(matchesCatalogText({ title: 'Cameron N77' }, 'cameron 105'), false)
  assert.equal(matchesCatalogText({ title: 'Cameron' }, '%,title.eq.secret'), false)
})

test('review 2: country and category filters never invent unknown metadata', () => {
  const known = advert(); const unknown = { ...advert('unknown'), category: null, country: null }
  assert.equal(searchExternalListings([known, unknown], { category: 'complete', country: 'Spain' }).length, 1)
  assert.equal(searchExternalListings([known, unknown], { country: 'unknown' }).length, 0)
  assert.equal(categoryForPath('/list/envelopes/'), 'envelopes')
  assert.equal(categoryForPath('/shop/last-added/'), null)
  assert.equal(canonicalCountry('Sprundel'), null)
  assert.equal(canonicalCountry('UK'), 'United Kingdom')
  assert.equal(canonicalCountry('Czech Republic'), canonicalCountry('Czechia'))
  assert.equal(canonicalCountry('Turkey'), canonicalCountry('Türkiye'))
})

test('review 2: price parsing preserves currencies, zero and unknown prices', () => {
  assert.deepEqual(externalPrice({ price: '€ 1.200,00 (excl-tax)' }), { currency: 'EUR', amount: 1200 })
  assert.deepEqual(externalPrice(advert()), { currency: 'GBP', amount: 12900 })
  assert.deepEqual(externalPrice({ price: '0 €' }), { currency: 'EUR', amount: 0 })
  assert.deepEqual(externalPrice({ price: '$100', sourceId: 'unknown' }), { currency: null, amount: null })
  const rows = [{ ...advert('high'), price: '£20,000' }, { ...advert('low'), price: '£1,000' }, { ...advert('unknown'), price: null }]
  assert.equal(searchExternalListings(rows, { sort: 'price_asc' })[0].price, '£1,000')
  assert.equal(searchExternalListings(rows, { sort: 'price_desc' })[0].price, '£20,000')
  assert.equal(searchExternalListings(rows, { sort: 'price_desc' }).at(-1).price, null)
})

test('review 3: successful page replaces disappeared ads and preserves discovery dates', () => {
  const old = snapshot([page([advert(), advert('gone')])])
  const incoming = { status: 'ok', pages: [page([{ ...advert(), price: '£10,000' }])] }
  const next = reconcileSnapshot(old, incoming, source, now)
  const rows = visibleExternalListings([next], now)
  assert.equal(rows.length, 1); assert.equal(rows[0].price, '£10,000'); assert.equal(rows[0].firstSeenAt, date)
})

test('review 3: failed pages keep data without refreshing the observation timestamp', () => {
  const yesterday = new Date(now - 86400000).toISOString()
  const next = reconcileSnapshot(snapshot([page([advert()], yesterday)]), { status: 'unavailable' }, source, now)
  assert.equal(visibleExternalListings([next], now)[0].checkedAt, yesterday)
  assert.equal(visibleExternalListings([next], now + 3 * 86400000).length, 0)
})

test('review 1: an unavailable index is distinguished from a fresh but empty catalogue', () => {
  assert.equal(hasCurrentExternalPages([], now), false)
  assert.equal(hasCurrentExternalPages([snapshot([page([])])], now), true)
  assert.equal(hasCurrentExternalPages([snapshot()], now + 4 * 86400000), false)
})

test('review 3: explicit sold markers remove an advert even from another failed category', () => {
  const old = snapshot([page(), page([advert()], date, source.pages[1])])
  const next = reconcileSnapshot(old, { status: 'partial', pages: [page([])], removedUrls: [advert().url] }, source, now)
  assert.equal(visibleExternalListings([next], now).length, 0)
  const parsed = parseSourcePageData('<div class="listing-item sold"><a class="title" href="/zebedee_list/example/">Balloon</a></div>', source, source.pages[0])
  assert.deepEqual(parsed.removedUrls, [advert().url]); assert.equal(parsed.listings.length, 0)
})

test('review 3: sold suffix is removed while a sales urgency phrase is not a sale confirmation', () => {
  const sold = '<div class="listing-item"><a class="title" href="/zebedee_list/example/">Balloon — SOLD</a></div>'
  assert.equal(parseSourcePageData(sold, source).listings.length, 0)
  const forSale = '<div class="classified_single"><a class="listing_header" href="/classified-123-BALLOON.html">Balloon</a><span class="action_phrase">MUST BE SOLD</span></div>'
  assert.equal(parseSourcePageData(forSale, getGlobalSearchSource('barnstormers')).listings.length, 1)
})

test('review 3: partial success updates only successful pages', () => {
  const yesterday = new Date(now - 86400000).toISOString()
  const old = snapshot([page([advert()], yesterday), page([advert('other')], yesterday, source.pages[1])])
  const next = reconcileSnapshot(old, { status: 'partial', pages: [page()] }, source, now)
  assert.equal(next.pages[0].checkedAt, date); assert.equal(next.pages[1].checkedAt, yesterday)
})

test('review 3: an explicit zero category count clears its last saved advert', () => {
  const parsed = parseSourcePageData('<nav><a href="/burners">Burners(0)</a></nav><main><h1>Burners</h1></main>', getGlobalSearchSource('balloons4sale'), '/burners')
  assert.deepEqual(parsed.listings, [])
  assert.throws(() => parseSourcePageData('<nav><a href="/burners">Burners(12)</a></nav>', getGlobalSearchSource('balloons4sale'), '/burners'), /format/)
})

test('review 3: partial updates cannot resurrect a previously sold advert', () => {
  const sold = reconcileSnapshot(snapshot(), { status: 'ok', pages: [page([])], removedUrls: [advert().url] }, source, now)
  const partial = reconcileSnapshot(sold, { status: 'partial', pages: [page()] }, source, now)
  assert.equal(visibleExternalListings([partial], now).length, 0)
  const relisted = reconcileSnapshot(partial, { status: 'ok', pages: [page()], removedUrls: [] }, source, now)
  assert.equal(visibleExternalListings([relisted], now).length, 1)
})

test('review 4: saved data is revalidated and public output excludes internal fields', () => {
  const rows = visibleExternalListings([snapshot([page([{ ...advert(), email: 'private@example.test' }, { ...advert('evil'), url: 'https://evil.test/' }])]), { sourceId: 'hotair', pages: [page()] }], now)
  assert.equal(rows.length, 1); assert.ok(!JSON.stringify(rows).includes('private@example'))
  assert.equal(visibleExternalListings([snapshot([page([advert()], 'not a date')])], now).length, 0)
})

test('review 4: thumbnails only load observed source image paths without tracking queries', () => {
  assert.equal(safeThumbnailUrl('https://www.zebedeelist.co.uk/wp-content/uploads/2026/example.jpg?tracking=1', source), 'https://www.zebedeelist.co.uk/wp-content/uploads/2026/example.jpg')
  for (const url of ['http://www.zebedeelist.co.uk/wp-content/uploads/image.jpg', 'https://evil.test/image.jpg', '/wp-admin/image.jpg', '/wp-content/uploads/active.svg', 'data:image/png;base64,abc']) assert.equal(safeThumbnailUrl(url, source), null)
})

test('review 3: retry a transient failure once with crawl delay, but never retry a denial', async () => {
  let requests = 0; const delays = []
  const smallSource = { ...source, pages: [source.pages[0]] }
  const html = '<div class="listing-item"><a class="title" href="/zebedee_list/example/">Balloon</a></div>'
  const result = await fetchSourceSnapshot(smallSource, { fetcher: async url => {
    if (url.endsWith('robots.txt')) return new Response('User-agent: *\nCrawl-delay: 5')
    return ++requests === 1 ? new Response('', { status: 503 }) : new Response(html)
  }, sleep: async ms => { delays.push(ms) }, now: () => now })
  assert.equal(result.status, 'ok'); assert.equal(requests, 2); assert.deepEqual(delays, [5000, 5000])
  requests = 0
  const denied = await fetchSourceSnapshot(smallSource, { fetcher: async url => url.endsWith('robots.txt') ? new Response('') : (requests++, new Response('', { status: 403 })), sleep: async () => {} })
  assert.equal(denied.status, 'unavailable'); assert.equal(requests, 1)
})

test('review 3: refresh persists each source under its lease and a repeated job does no work', async () => {
  const rows = new Map(); let crawls = 0
  const client = {
    rpc: async (_name, args) => {
      if (rows.get(args.p_source)?.done) return { data: null }
      rows.set(args.p_source, { snapshot: { pages: [] }, token: 'lease-' + args.p_source })
      return { data: 'lease-' + args.p_source }
    },
    from: table => {
      assert.equal(table, 'external_catalog_sources')
      let id, token, payload
      return {
        eq(key, value) { if (key === 'source_id') id = value; else if (key === 'lease_token') token = value; return this },
        select() { if (!payload) return this; assert.equal(token, rows.get(id).token); rows.set(id, { ...payload, done: true }); return Promise.resolve({ data: [{ source_id: id }] }) },
        single() { return Promise.resolve({ data: rows.get(id) }) },
        update(value) { payload = value; return this },
      }
    },
  }
  const crawl = async current => { crawls++; return { status: 'ok', pagesRead: 1, pages: [{ path: current.pages[0], checkedAt: date, listings: [] }] } }
  const first = await refreshExternalCatalog(client, { crawl, now: () => now })
  assert.ok(first.every(result => result.status === 'ok')); assert.equal(crawls, 5)
  assert.ok([...rows.values()].every(row => row.last_run_key === '2026-11-03' && row.lease_token === null))
  const second = await refreshExternalCatalog(client, { crawl, now: () => now })
  assert.ok(second.every(result => result.status === 'already_claimed')); assert.equal(crawls, 5)
})

test('review 4: refresh requires POST and the exact existing secret', () => {
  assert.equal(authorizedRefresh(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer test-secret' } }), 'test-secret'), true)
  assert.equal(authorizedRefresh(new Request('https://example.test'), 'test-secret'), false)
  assert.equal(authorizedRefresh(new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer wrong' } }), 'test-secret'), false)
  assert.equal(authorizedRefresh(new Request('https://example.test', { method: 'POST' }), undefined), false)
})

test('review 3: already completed or leased sources never crawl again', async () => {
  let crawls = 0
  const results = await refreshExternalCatalog({ rpc: async () => ({ data: null, error: null }) }, { crawl: async () => { crawls++; throw new Error('No crawl expected') }, now: () => now })
  assert.equal(crawls, 0); assert.equal(results.length, 5); assert.ok(results.every(r => r.status === 'already_claimed'))
})

test('review 3: one failed storage claim does not interrupt other sources', async () => {
  let calls = 0
  const results = await refreshExternalCatalog({ rpc: async () => { calls++; return { data: null, error: calls === 1 ? new Error('offline') : null } } }, { now: () => now })
  assert.equal(results.filter(r => r.status === 'error').length, 1)
  assert.equal(results.filter(r => r.status === 'already_claimed').length, 4)
})

test('review 4: index is service-only, with an atomic lease and no changes to customer tables', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261103080000_external_catalog_index.sql', import.meta.url), 'utf8')
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all on public.external_catalog_sources from public, anon, authenticated/)
  assert.match(sql, /last_run_key is distinct from p_run_key/)
  assert.match(sql, /lease_until < now\(\)/)
  assert.doesNotMatch(sql, /(?:update|alter table|insert into) public\.(?:users|listings|newsletter)/i)
})

test('review 3: only one new daily schedule and no visitor-triggered crawl', () => {
  const scheduled = readFileSync(new URL('../netlify/functions/external-catalog-scheduled.mjs', import.meta.url), 'utf8')
  assert.match(scheduled, /schedule: '0 4 \* \* \*'/)
  assert.match(scheduled, /external-catalog-background/)
  const endpoint = readFileSync(new URL('../src/app/api/global-search/[source]/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(endpoint, /fetchSourceSnapshot|unstable_cache/)
  assert.equal(GLOBAL_SEARCH_SOURCES.some(s => s.id === 'hotair'), false)
})
