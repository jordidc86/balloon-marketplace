import test from 'node:test'
import assert from 'node:assert/strict'
import { selectNewsletterListings } from '../src/utils/newsletter-listing-rotation.mjs'

const listing = (id, createdAt) => ({ id, created_at: createdAt })

test('a paid promotion never included in a newsletter outranks repeatedly exposed recent inventory', () => {
  const rotation = selectNewsletterListings({
    listings: [
      listing('old-unfulfilled', '2026-06-01T00:00:00.000Z'),
      listing('recent-exposed', '2026-08-30T00:00:00.000Z'),
    ],
    priorRuns: [
      { listing_ids: ['recent-exposed'] },
      { listing_ids: ['recent-exposed'] },
    ],
    days: 15,
    mixWithLatest: false,
    now: new Date('2026-08-31T00:00:00.000Z'),
  })

  assert.deepEqual(rotation.selected.map((item) => item.id), ['old-unfulfilled', 'recent-exposed'])
  assert.equal(rotation.neverIncludedCount, 1)
  assert.equal(rotation.recentCount, 1)
})

test('newsletter exposure rotates toward the least included promoted listings', () => {
  const rotation = selectNewsletterListings({
    listings: [
      listing('three-times', '2026-08-30T00:00:00.000Z'),
      listing('once-newer', '2026-08-29T00:00:00.000Z'),
      listing('once-older', '2026-08-28T00:00:00.000Z'),
    ],
    priorRuns: [
      { listing_ids: ['three-times', 'once-newer', 'once-older'] },
      { listing_ids: ['three-times'] },
      { listing_ids: ['three-times'] },
    ],
    days: 15,
    mixWithLatest: true,
    now: '2026-08-31T00:00:00.000Z',
    limit: 2,
  })

  assert.deepEqual(rotation.selected.map((item) => item.id), ['once-newer', 'once-older'])
})

test('duplicate ids inside one run count as one exposure and malformed inventory fails closed', () => {
  const rotation = selectNewsletterListings({
    listings: [listing('valid', '2026-08-30T00:00:00.000Z'), { id: 'bad', created_at: 'not-a-date' }],
    priorRuns: [{ listing_ids: ['valid', 'valid', null] }],
    days: null,
    now: '2026-08-31T00:00:00.000Z',
  })
  assert.equal(rotation.inclusionCounts.get('valid'), 1)
  assert.deepEqual(rotation.selected.map((item) => item.id), ['valid'])
})
