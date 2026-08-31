import test from 'node:test'
import assert from 'node:assert/strict'
import { buildListingShareText, buildListingShareUrl } from '../src/utils/listing-share.mjs'

const listingId = '123e4567-e89b-42d3-a456-426614174000'

test('listing share links are canonical and measurable by channel', () => {
  const url = new URL(buildListingShareUrl({ baseUrl: 'https://aerotrade.app/path', listingId, source: 'seller_share', medium: 'whatsapp' }))
  assert.equal(url.origin, 'https://aerotrade.app')
  assert.equal(url.pathname, '/catalog/' + listingId)
  assert.equal(url.searchParams.get('utm_source'), 'seller_share')
  assert.equal(url.searchParams.get('utm_medium'), 'whatsapp')
  assert.equal(url.searchParams.get('utm_campaign'), 'listing_distribution')
  for (const medium of ['linkedin', 'facebook']) {
    assert.equal(new URL(buildListingShareUrl({ baseUrl: 'https://aerotrade.app', listingId, source: 'seller_share', medium })).searchParams.get('utm_medium'), medium)
  }
})

test('listing share links reject unsafe identifiers, origins and campaign values', () => {
  assert.throws(() => buildListingShareUrl({ baseUrl: 'javascript:alert(1)', listingId, medium: 'copy' }))
  assert.throws(() => buildListingShareUrl({ baseUrl: 'https://aerotrade.app', listingId: '../admin', medium: 'copy' }))
  assert.throws(() => buildListingShareUrl({ baseUrl: 'https://aerotrade.app', listingId, source: 'spoofed', medium: 'copy' }))
  assert.throws(() => buildListingShareUrl({ baseUrl: 'https://aerotrade.app', listingId, medium: 'telegram' }))
})

test('listing share text is bounded and removes excess whitespace', () => {
  const text = buildListingShareText('  Cameron   ' + 'Z'.repeat(300) + '  ')
  assert.match(text, /^See Cameron Z+/)
  assert.ok(text.length < 250)
})
