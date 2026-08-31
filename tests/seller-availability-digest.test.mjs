import assert from 'node:assert/strict'
import test from 'node:test'

import {
  changedSellerAvailabilityDigestIsCoolingDown,
  sellerAvailabilityBatchKey,
  sellerAvailabilityDigestChangeCooldownMs,
  sellerAvailabilityDigestIdempotencyKey,
  sellerAvailabilityDigestInventoryKey,
  sellerAvailabilityDigestReadiness,
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

test('seller availability batch approval is stable, bounded and rejects duplicate scope', () => {
  const first = sellerAvailabilityDigestIdempotencyKey(sellerId, [{ listingId: listingOne, confirmationId: null }])
  const secondSeller = 'a61e6ad6-22bd-41d6-81ad-94e76b214cad'
  const second = sellerAvailabilityDigestIdempotencyKey(secondSeller, [{ listingId: listingTwo, confirmationId: null }])

  assert.equal(sellerAvailabilityBatchKey([first, second]), sellerAvailabilityBatchKey([second, first]))
  assert.throws(() => sellerAvailabilityBatchKey([]), /between 1 and 100/i)
  assert.throws(() => sellerAvailabilityBatchKey([first, first]), /duplicate/i)
  assert.throws(() => sellerAvailabilityBatchKey([first, 'untrusted']), /invalid seller inventory/i)
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

test('seller availability outreach readiness explains every safe operator state before sending', () => {
  const now = new Date('2026-08-31T18:00:00.000Z')
  const currentKey = sellerAvailabilityDigestIdempotencyKey(sellerId, [{ listingId: listingOne, confirmationId: null }])
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: false, currentKey, now }), { status: 'missing_contact', actionable: false })
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey, now }), { status: 'ready_new', actionable: true })

  const currentAccepted = {
    idempotency_key: currentKey,
    status: 'accepted',
    accepted_at: '2026-08-25T18:00:00.000Z',
    created_at: '2026-08-25T18:00:00.000Z',
    next_attempt_at: null,
  }
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey, latestReceipt: currentAccepted, now }), { status: 'current', actionable: false })
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey, latestReceipt: { ...currentAccepted, accepted_at: '2026-08-10T18:00:00.000Z' }, now }), { status: 'ready_reissue', actionable: true })
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey, latestReceipt: { ...currentAccepted, accepted_at: null }, now }), { status: 'invalid_receipt', actionable: false })

  const retryPending = { ...currentAccepted, status: 'failed', accepted_at: null, next_attempt_at: '2026-08-31T19:00:00.000Z' }
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey, latestReceipt: retryPending, now }), { status: 'retry_pending', actionable: false })
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey, latestReceipt: { ...retryPending, next_attempt_at: null }, now }), { status: 'ready_retry', actionable: true })

  const changedKey = sellerAvailabilityDigestIdempotencyKey(sellerId, [{ listingId: listingOne, confirmationId: confirmation }])
  assert.deepEqual(sellerAvailabilityDigestReadiness({ hasContact: true, currentKey: changedKey, latestReceipt: currentAccepted, now }), { status: 'cooling_down', actionable: false })
})
