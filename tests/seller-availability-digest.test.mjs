import assert from 'node:assert/strict'
import test from 'node:test'

import {
  changedSellerAvailabilityDigestIsCoolingDown,
  sellerAvailabilityDigestChangeCooldownMs,
  sellerAvailabilityDigestIdempotencyKey,
  sellerAvailabilityDigestInventoryKey,
  sellerAvailabilityDigestRequestKey,
} from '../src/utils/seller-availability-digest.mjs'

const sellerId = '69f6d7c2-f063-4b1f-aa74-4149f61c5039'
const listingOne = 'a595685b-ddca-4ec4-990b-6f681bf0c434'
const listingTwo = 'd736323d-35dd-46cd-8518-662299244c4e'
const confirmation = '26a9ad63-aa8e-4b08-9a5b-d5152f82e2e8'

test('seller availability digest is stable across listing order and changes after genuine confirmation', () => {
  const first = sellerAvailabilityDigestIdempotencyKey(sellerId, [
    { listingId: listingOne, confirmationId: null },
    { listingId: listingTwo, confirmationId: null },
  ])
  const reordered = sellerAvailabilityDigestIdempotencyKey(sellerId, [
    { listingId: listingTwo, confirmationId: null },
    { listingId: listingOne, confirmationId: null },
  ])
  const nextCycle = sellerAvailabilityDigestIdempotencyKey(sellerId, [
    { listingId: listingOne, confirmationId: confirmation },
    { listingId: listingTwo, confirmationId: null },
  ])
  assert.equal(first, reordered)
  assert.notEqual(first, nextCycle)
})

test('an ignored accepted digest can be explicitly reissued after its 14-day capability expires', () => {
  const baseKey = sellerAvailabilityDigestIdempotencyKey(sellerId, [{ listingId: listingOne, confirmationId: null }])
  const now = new Date('2026-08-31T12:00:00Z')
  const recent = { idempotency_key: baseKey, status: 'accepted', accepted_at: '2026-08-20T12:00:00Z' }
  const expired = { idempotency_key: baseKey, status: 'accepted', accepted_at: '2026-08-16T11:59:59Z' }
  const failedReissue = { idempotency_key: `${baseKey}-20260831`, status: 'failed', accepted_at: null }
  assert.equal(sellerAvailabilityDigestRequestKey(baseKey, recent, now), baseKey)
  assert.equal(sellerAvailabilityDigestRequestKey(baseKey, expired, now), `${baseKey}-20260831`)
  assert.equal(sellerAvailabilityDigestRequestKey(baseKey, failedReissue, now), `${baseKey}-20260831`)
  assert.equal(sellerAvailabilityDigestInventoryKey(`${baseKey}-20260831`), baseKey)
})

test('seller availability digest rejects duplicate or untrusted identifiers', () => {
  assert.throws(() => sellerAvailabilityDigestIdempotencyKey('seller', [{ listingId: listingOne, confirmationId: null }]), /seller identifier/i)
  assert.throws(() => sellerAvailabilityDigestIdempotencyKey(sellerId, []), /between 1 and 100/i)
  assert.throws(() => sellerAvailabilityDigestIdempotencyKey(sellerId, [
    { listingId: listingOne, confirmationId: null },
    { listingId: listingOne, confirmationId: null },
  ]), /duplicate/i)
})

test('a changed digest is held during the bounded anti-churn window but the same cycle may safely retry', () => {
  const now = new Date('2026-08-29T18:00:00.000Z')
  const currentKey = 'seller-availability-digest-current'
  assert.equal(changedSellerAvailabilityDigestIsCoolingDown({ idempotency_key: currentKey, created_at: now.toISOString() }, currentKey, now), false)
  assert.equal(changedSellerAvailabilityDigestIsCoolingDown({ idempotency_key: 'older-cycle', created_at: new Date(now.getTime() - 1_000).toISOString() }, currentKey, now), true)
  assert.equal(changedSellerAvailabilityDigestIsCoolingDown({ idempotency_key: 'older-cycle', created_at: new Date(now.getTime() - sellerAvailabilityDigestChangeCooldownMs).toISOString() }, currentKey, now), false)
  assert.equal(changedSellerAvailabilityDigestIsCoolingDown({ idempotency_key: 'older-cycle', created_at: 'invalid' }, currentKey, now), true)
  const realBaseKey = sellerAvailabilityDigestIdempotencyKey(sellerId, [{ listingId: listingOne, confirmationId: null }])
  assert.equal(changedSellerAvailabilityDigestIsCoolingDown({ idempotency_key: `${realBaseKey}-20260815`, created_at: now.toISOString() }, realBaseKey, now), false)
})
