import assert from 'node:assert/strict'
import test from 'node:test'

import { listingAvailabilityRequestIdempotencyKey } from '../src/utils/listing-availability-request.mjs'

const listingId = '4e2be39d-6390-409a-8304-ae16b1239fc1'
const confirmationId = 'a9f9ff96-8cec-4724-a2a7-241937732be7'

test('an unconfirmed listing gets one stable initial request key', () => {
  assert.equal(
    listingAvailabilityRequestIdempotencyKey(listingId),
    `listing-availability-request-${listingId}-initial`,
  )
})

test('a later confirmation opens exactly one new request cycle', () => {
  assert.equal(
    listingAvailabilityRequestIdempotencyKey(listingId, confirmationId),
    `listing-availability-request-${listingId}-${confirmationId}`,
  )
})

test('request keys reject free-form identifiers', () => {
  assert.throws(() => listingAvailabilityRequestIdempotencyKey('not-a-listing'), /invalid listing/i)
  assert.throws(() => listingAvailabilityRequestIdempotencyKey(listingId, 'not-a-confirmation'), /invalid confirmation/i)
})
