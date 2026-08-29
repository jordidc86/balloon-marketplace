import assert from 'node:assert/strict'
import test from 'node:test'

import { buildIndexNowSubmission, buildPublicIndexingUrls } from '../src/utils/indexing.mjs'

const now = new Date('2026-08-29T10:00:00Z')
const listings = [
  { id: 'public-complete', category: 'complete', status: 'ACTIVE_PUBLIC', public_at: null },
  { id: 'mature-premium', category: 'burners', status: 'ACTIVE_PREMIUM', public_at: '2026-08-28T10:00:00Z' },
  { id: 'locked-premium', category: 'envelopes', status: 'ACTIVE_PREMIUM', public_at: '2026-08-30T10:00:00Z' },
  { id: 'draft', category: 'baskets', status: 'DRAFT', public_at: null },
]

test('public indexing includes commercial routes and only releasable inventory', () => {
  const urls = buildPublicIndexingUrls({ origin: 'https://aerotrade.app', listings, now })
  assert.ok(urls.includes('https://aerotrade.app/new-balloon'))
  assert.ok(urls.includes('https://aerotrade.app/sell/assisted'))
  assert.ok(urls.includes('https://aerotrade.app/sell-hot-air-balloon'))
  assert.ok(urls.includes('https://aerotrade.app/catalog/category/complete'))
  assert.ok(urls.includes('https://aerotrade.app/catalog/category/burners'))
  assert.ok(urls.includes('https://aerotrade.app/catalog/public-complete'))
  assert.ok(urls.includes('https://aerotrade.app/catalog/mature-premium'))
  assert.ok(!urls.some((url) => url.includes('locked-premium')))
  assert.ok(!urls.some((url) => url.includes('draft')))
  assert.ok(!urls.some((url) => /login|dashboard|admin/.test(url)))
})

test('IndexNow batches are stable, same-host and daily deduplicated', () => {
  const urls = buildPublicIndexingUrls({ origin: 'https://aerotrade.app', listings, now })
  const input = { origin: 'https://aerotrade.app', key: '015d1acf191553d5ce837027529a3f7f', urls, date: now }
  const first = buildIndexNowSubmission(input)
  const reordered = buildIndexNowSubmission({ ...input, urls: [...urls].reverse() })
  assert.equal(first.batchKey, reordered.batchKey)
  assert.equal(first.fingerprint, reordered.fingerprint)
  assert.equal(first.payload.host, 'aerotrade.app')
  assert.equal(first.payload.keyLocation, 'https://aerotrade.app/015d1acf191553d5ce837027529a3f7f.txt')
  assert.ok(first.payload.urlList.every((url) => new URL(url).hostname === 'aerotrade.app'))
  assert.notEqual(first.batchKey, buildIndexNowSubmission({ ...input, date: new Date('2026-08-30T10:00:00Z') }).batchKey)
})

test('IndexNow rejects insecure origins, invalid keys and foreign URLs', () => {
  assert.throws(() => buildPublicIndexingUrls({ origin: 'http://aerotrade.app', listings, now }))
  assert.throws(() => buildIndexNowSubmission({ origin: 'https://aerotrade.app', key: 'short', urls: ['https://aerotrade.app/'] }))
  assert.throws(() => buildIndexNowSubmission({ origin: 'https://aerotrade.app', key: '015d1acf191553d5ce837027529a3f7f', urls: ['https://example.com/'] }))
})
