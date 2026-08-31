import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMarketplaceInventoryFeed,
  getPublicInventoryFeedListings,
} from '../src/utils/marketplace-feed.mjs'

const generatedAt = new Date('2026-08-31T18:00:00.000Z')
const publicListing = {
  id: 'public-listing',
  title: 'Schroeder G42 & basket',
  category: 'complete',
  condition: 'Used - excellent',
  price: 45_000,
  currency: 'eur',
  location_country: 'Portugal',
  details: { manufacturer: 'Schroeder', model: 'G42' },
  status: 'ACTIVE_PUBLIC',
  public_at: null,
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-30T12:00:00.000Z',
}

test('inventory feed includes only currently public active listings', () => {
  const inventory = getPublicInventoryFeedListings([
    publicListing,
    { ...publicListing, id: 'mature-premium', status: 'ACTIVE_PREMIUM', public_at: '2026-08-31T17:00:00.000Z' },
    { ...publicListing, id: 'private-premium', status: 'ACTIVE_PREMIUM', public_at: '2026-09-01T17:00:00.000Z' },
    { ...publicListing, id: 'sold', status: 'SOLD' },
    { ...publicListing, id: 'draft', status: 'DRAFT' },
  ], generatedAt)

  assert.deepEqual(inventory.map((listing) => listing.id), ['public-listing', 'mature-premium'])
})

test('inventory feed exposes canonical inventory fields without seller PII', () => {
  const feed = buildMarketplaceInventoryFeed({
    siteUrl: 'https://aerotrade.app/',
    generatedAt,
    listings: [{
      ...publicListing,
      title: 'Schroeder G42 seller@example.com +34 600 123 456 <ready>',
      details: { manufacturer: 'Schroeder seller@example.com', model: 'G42' },
    }],
  })

  assert.match(feed, /<rss version="2\.0"/)
  assert.match(feed, /https:\/\/aerotrade\.app\/catalog\/public-listing/)
  assert.match(feed, /Schroeder G42/)
  assert.match(feed, /EUR 45000/)
  assert.match(feed, /Portugal/)
  assert.equal(feed.includes('seller@example.com'), false)
  assert.equal(feed.includes('+34 600 123 456'), false)
  assert.equal(feed.includes('<ready>'), false)
  assert.match(feed, /&lt;ready&gt;/)
})

test('sold, draft and future Premium inventory never appear in the feed', () => {
  const feed = buildMarketplaceInventoryFeed({
    siteUrl: 'https://aerotrade.app',
    generatedAt,
    listings: [
      { ...publicListing, id: 'sold-id', title: 'Sold balloon', status: 'SOLD' },
      { ...publicListing, id: 'draft-id', title: 'Draft balloon', status: 'DRAFT' },
      { ...publicListing, id: 'future-id', title: 'Private Premium balloon', status: 'ACTIVE_PREMIUM', public_at: '2026-09-01T17:00:00.000Z' },
    ],
  })

  for (const forbidden of ['sold-id', 'Sold balloon', 'draft-id', 'Draft balloon', 'future-id', 'Private Premium balloon']) {
    assert.equal(feed.includes(forbidden), false)
  }
})
