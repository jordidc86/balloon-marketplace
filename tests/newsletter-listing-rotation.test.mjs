import test from 'node:test'
import assert from 'node:assert/strict'
import { getNewsletterCopy, selectNewsletterListings } from '../src/utils/newsletter-listing-rotation.mjs'

const listing = (id, createdAt) => ({ id, created_at: createdAt, public_at: createdAt, status: 'ACTIVE_PUBLIC' })

test('recent public inventory outranks older unfulfilled promotions', () => {
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

  assert.deepEqual(rotation.selected.map((item) => item.id), ['recent-exposed', 'old-unfulfilled'])
  assert.equal(rotation.neverIncludedCount, 1)
  assert.equal(rotation.recentCount, 1)
})

test('the newest listings take the limited slots regardless of prior exposure', () => {
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

  assert.deepEqual(rotation.selected.map((item) => item.id), ['three-times', 'once-newer'])
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

test('free listings and newly public older drafts lead while unavailable inventory is excluded', () => {
  const result = selectNewsletterListings({
    listings: [
      { ...listing('paid-old', '2026-05-16T00:00:00Z'), details: { listing_plan: 'premium' } },
      { ...listing('free-newest', '2026-09-17T00:00:00Z'), public_at: '2026-09-21T00:00:00Z', details: { listing_plan: 'free' } },
      { ...listing('free-second', '2026-08-11T00:00:00Z'), details: { listing_plan: 'free' } },
      { ...listing('old-draft-newly-public', '2026-01-01T00:00:00Z'), public_at: '2026-10-31T00:00:00Z' },
      { ...listing('sold', '2026-11-01T00:00:00Z'), status: 'SOLD' },
      { ...listing('draft', '2026-11-01T00:00:00Z'), status: 'DRAFT' },
      { ...listing('exclusive', '2026-11-01T00:00:00Z'), status: 'ACTIVE_PREMIUM' },
      listing('future', '2026-11-10T00:00:00Z'),
      { ...listing('invalid-date', '2026-11-01T00:00:00Z'), public_at: null },
    ], priorRuns: [], days: 15, mixWithLatest: true, now: '2026-11-02T00:00:00Z',
  })
  assert.deepEqual(result.selected.map(item => item.id), ['old-draft-newly-public', 'free-newest', 'free-second', 'paid-old'])
  assert.equal(result.recentCount, 1)
})

test('an old inventory roundup does not claim new arrivals, including without a date filter', () => {
  for (const days of [15, null]) {
    const result = selectNewsletterListings({ listings: [listing('old', '2026-09-21T00:00:00Z')], priorRuns: [], days, mixWithLatest: true, now: '2026-11-02T00:00:00Z' })
    assert.equal(result.recentCount, 0)
    assert.match(getNewsletterCopy(result.recentCount).subject, /^Available balloons/)
    assert.doesNotMatch(getNewsletterCopy(result.recentCount).introduction, /new arrivals/i)
  }
  assert.match(getNewsletterCopy(1).subject, /^New arrivals/)
})
