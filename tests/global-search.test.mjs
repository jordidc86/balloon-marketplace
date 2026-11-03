import test from 'node:test'
import assert from 'node:assert/strict'
import { GLOBAL_SEARCH_SOURCES, getGlobalSearchSource, safeListingUrl, registrationFromText, normalizeSearchText, filterGlobalListings } from '../src/utils/global-search/sources.mjs'
import { parseSourcePage } from '../src/utils/global-search/parse.mjs'
import { robotsPolicy } from '../src/utils/global-search/robots.mjs'
import { fetchSourceSnapshot } from '../src/utils/global-search/fetch.mjs'

test('six selected portals; Cameron France excluded and Hot Air remains manual', () => {
  assert.equal(GLOBAL_SEARCH_SOURCES.length, 6)
  assert.equal(getGlobalSearchSource('cameron-france'), undefined)
  assert.equal(getGlobalSearchSource('hotair').manual, true)
})

test('listing URLs cannot escape the source, become actions, or carry tracking parameters', () => {
  const source = getGlobalSearchSource('balloons4sale')
  for (const href of ['javascript:alert(1)', '//evil.example/article/1/test', 'https://user:pass@www.balloons4sale.eu/article/1/test', '/contact', 'https://www.balloons4sale.eu.evil.example/article/1/test', '/article/../contact', undefined]) assert.equal(safeListingUrl(href, source), null)
  assert.equal(safeListingUrl('/article/1/Test balloon?tracking=1#x', source), 'https://www.balloons4sale.eu/article/1/Test%20balloon')
})

test('model numbers do not become aircraft registrations; matching tolerates accents and punctuation', () => {
  assert.equal(registrationFromText('Cameron N77'), null)
  assert.equal(registrationFromText('Ultramagic B26 G-ABCD'), 'G-ABCD')
  assert.equal(normalizeSearchText('Schröder — G-ABCD'), 'schroder gabcd')
})

test('combined text and portal filters keep distinct adverts and never search private descriptions', () => {
  const items = [
    { title: 'Ultramagic B-26', registration: 'G-ABCD', sourceId: 'zebedee' },
    { title: 'G-ABCD Ultramagic B26', registration: 'G-ABCD', sourceId: 'balloons4sale' },
    { title: 'Cameron N77', registration: null, sourceId: 'zebedee' },
  ]
  assert.equal(filterGlobalListings(items, 'ultramagic g-abcd').length, 2)
  assert.equal(filterGlobalListings(items, 'ultramagic b26').length, 2)
  assert.equal(filterGlobalListings(items, 'g-abcd', 'zebedee').length, 1)
  assert.equal(filterGlobalListings(items, 'not listed').length, 0)
  assert.equal(filterGlobalListings(items, '', 'hotair').length, 0)
  assert.equal(items[0].title, 'Ultramagic B-26')
})

const fixtures = {
  balloons4sale: '<div class="article_clickable"><a href="/article/123/G-ABCD"><strong>G-ABCD Balloon</strong></a><div class="cat_content">Built 2000, can be sold with new ARC.</div></div>',
  zebedee: '<div class="listing-item"><a class="title" href="/zebedee_list/example/">Balloon</a><span class="excerpt">G-ABCD. £12,900 (Private Person – 0123456789 private@example.test)</span></div>',
  secondhand: '<article class="shb-archive-ad"><h2><a href="/ad/example/">Balloon</a></h2><div class="shb-archive-price">5.000 €</div><div class="shb-archive-seller">Private Person</div></article>',
  swapballoon: '<li class="wc-block-grid__product"><a href="/4sale/example/"><div class="wc-block-grid__product-title">Balloon</div></a><div class="price">€ 1.200,00 (excl-tax)</div></li>',
  barnstormers: '<div class="classified_single"><a class="listing_header" href="/classified-123-BALLOON.html?catid=20502">Balloon</a><span class="price">$2,500</span><span class="contact">Private Person, 0123456789</span></div>',
}
for (const [id, html] of Object.entries(fixtures)) test(`${id}: source layout produces minimal metadata and unique links`, () => {
  const results = parseSourcePage(html + html, getGlobalSearchSource(id))
  assert.equal(results.length, 1)
  assert.deepEqual(Object.keys(results[0]).sort(), ['price', 'registration', 'sourceId', 'title', 'url'])
  assert.doesNotMatch(JSON.stringify(results), /private@example|012345|Private Person/)
})

test('sold and fake ads are excluded without confusing “can be sold with ARC”', () => {
  assert.equal(parseSourcePage(fixtures.balloons4sale, getGlobalSearchSource('balloons4sale')).length, 1)
  assert.equal(parseSourcePage(fixtures.swapballoon.replace('wc-block-grid__product"', 'wc-block-grid__product outofstock"'), getGlobalSearchSource('swapballoon')).length, 0)
  assert.equal(parseSourcePage(fixtures.secondhand.replace('>Balloon</a>', '>Test Complete balloon</a>'), getGlobalSearchSource('secondhand')).length, 0)
  assert.throws(() => parseSourcePage('<html>Sign in to continue</html>', getGlobalSearchSource('secondhand')), /format/)
})

test('changed advert links are a parser failure, not a successful empty catalogue', () => {
  assert.throws(() => parseSourcePage(fixtures.barnstormers.replace('listing_header', 'new_header'), getGlobalSearchSource('barnstormers')), /format/)
})

test('robots longest matching allow wins, named groups override wildcard and crawl delay is honoured', () => {
  const text = 'User-agent: *\nDisallow: /private/\nAllow: /private/public$\nCrawl-delay: 5'
  assert.deepEqual(robotsPolicy(text, 'https://example.test/last'), { allowed: true, delay: 5 })
  assert.equal(robotsPolicy(text, 'https://example.test/private/x').allowed, false)
  assert.equal(robotsPolicy(text, 'https://example.test/private/public').allowed, true)
  assert.equal(robotsPolicy(text, 'https://example.test/private/public/more').allowed, false)
  assert.equal(robotsPolicy('User-agent: *\nAllow: /\nUser-agent: AeroTradeSearch\nDisallow: /', 'https://example.test/').allowed, false)
  assert.equal(robotsPolicy('User-agent: *\nDisallow: /*?*', 'https://example.test/last?q=x').allowed, false)
  assert.equal(robotsPolicy('<html>Challenge</html>', 'https://example.test/').allowed, false)
})

test('manual sources make zero network requests', async () => {
  const result = await fetchSourceSnapshot(getGlobalSearchSource('hotair'), { fetcher: () => { throw new Error('Must not fetch') } })
  assert.equal(result.status, 'manual')
})

test('robots refusal stops catalogue fetching', async () => {
  const urls = []
  const result = await fetchSourceSnapshot(getGlobalSearchSource('balloons4sale'), { fetcher: async url => { urls.push(url); return new Response('User-agent: *\nDisallow: /') }, sleep: async () => {} })
  assert.equal(result.status, 'blocked')
  assert.equal(urls.length, 1)
})

test('bounded fetch reports partial results, dates checks, and never follows redirects', async () => {
  const source = { ...getGlobalSearchSource('zebedee'), pages: ['/one', '/two'] }
  const delays = []
  const result = await fetchSourceSnapshot(source, {
    fetcher: async (url, options) => {
      assert.equal(options.redirect, 'error')
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nCrawl-delay: 5')
      if (url.endsWith('/two')) return new Response('Denied', { status: 403 })
      return new Response(fixtures.zebedee)
    }, sleep: async ms => { delays.push(ms) }, now: () => 100000,
  })
  assert.deepEqual(delays, [5000, 5000])
  assert.equal(result.status, 'partial')
  assert.equal(result.pagesRead, 1)
  assert.equal(result.listings.length, 1)
  assert.equal(result.checkedAt, new Date(100000).toISOString())
})

test('robots network errors and oversized catalogues are unavailable, not empty success', async () => {
  assert.equal((await fetchSourceSnapshot(getGlobalSearchSource('balloons4sale'), { fetcher: async () => new Response('', { status: 503 }) })).status, 'unavailable')
  const result = await fetchSourceSnapshot(getGlobalSearchSource('balloons4sale'), { fetcher: async url => url.endsWith('/robots.txt') ? new Response('') : new Response('x', { headers: { 'content-length': '3000000' } }), sleep: async () => {} })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.checkedAt, null)
})
