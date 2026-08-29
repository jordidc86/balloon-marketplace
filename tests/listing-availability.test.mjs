import assert from 'node:assert/strict'
import test from 'node:test'

import { getListingAvailabilityState, listingAvailabilityFreshDays } from '../src/utils/listing-availability.mjs'

const now = new Date('2026-08-29T12:00:00.000Z')

test('availability is never assumed from listing age or status', () => {
  assert.deepEqual(getListingAvailabilityState(null, now), {
    status: 'never',
    ageDays: null,
    publiclyFresh: false,
  })
})

test('a real seller confirmation is public for the bounded freshness window', () => {
  assert.deepEqual(getListingAvailabilityState('2026-08-29T11:00:00.000Z', now), {
    status: 'fresh',
    ageDays: 0,
    publiclyFresh: true,
  })
  assert.equal(
    getListingAvailabilityState(new Date(now.getTime() - listingAvailabilityFreshDays * 86_400_000), now).publiclyFresh,
    true,
  )
})

test('old, malformed and future confirmations never create public trust evidence', () => {
  assert.equal(getListingAvailabilityState('2026-05-30T11:59:59.000Z', now).status, 'stale')
  assert.equal(getListingAvailabilityState('not-a-date', now).status, 'invalid')
  assert.equal(getListingAvailabilityState('2026-08-30T12:00:00.000Z', now).publiclyFresh, false)
})
