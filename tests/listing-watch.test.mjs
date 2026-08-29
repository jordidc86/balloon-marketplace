import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createListingWatchSnapshot,
  createListingWatchSubmissionKey,
  isListingWatchDispatchRetryable,
  parseListingWatchRequest,
  signListingWatchAction,
  verifyListingWatchAction,
} from '../src/utils/listing-watch.mjs'

const listingId = '4e2be39d-6390-409a-8304-ae16b1239fc1'
const secret = 'a-production-length-secret-for-tests'

test('listing watch intake is consented, normalized and bot resistant', () => {
  const data = new FormData()
  data.set('email', ' Buyer@Example.com ')
  data.set('privacy_consent', 'yes')
  assert.deepEqual(parseListingWatchRequest(data), {
    email: 'buyer@example.com',
    normalized_email: 'buyer@example.com',
  })

  data.set('website', 'https://spam.example')
  assert.throws(() => parseListingWatchRequest(data), /Unable to record/)
})

test('material listing state produces stable snapshots without depending on update timestamps', () => {
  const first = createListingWatchSnapshot({ id: listingId, status: 'ACTIVE_PUBLIC', title: ' Cameron   Z-105 ', price: 25000, currency: 'eur', condition: 'Used', location_country: 'Spain', updated_at: '2026-01-01' })
  const same = createListingWatchSnapshot({ id: listingId, status: 'ACTIVE_PUBLIC', title: 'Cameron Z-105', price: 25000.001, currency: 'EUR', condition: 'Used', location_country: 'Spain', updated_at: '2026-08-29' })
  const changed = createListingWatchSnapshot({ id: listingId, status: 'ACTIVE_PUBLIC', title: 'Cameron Z-105', price: 24000, currency: 'EUR', condition: 'Used', location_country: 'Spain' })
  assert.equal(first.hash, same.hash)
  assert.notEqual(first.hash, changed.hash)
  assert.equal(first.title, 'Cameron Z-105')
})

test('confirmation and unsubscribe tokens are purpose-bound and tamper evident', () => {
  const confirm = signListingWatchAction(listingId, 'confirm', secret)
  assert.equal(confirm?.length, 64)
  assert.equal(verifyListingWatchAction(listingId, 'confirm', confirm, secret), true)
  assert.equal(verifyListingWatchAction(listingId, 'unsubscribe', confirm, secret), false)
  assert.equal(verifyListingWatchAction(listingId, 'confirm', '0'.repeat(64), secret), false)
})

test('watch submission limits are pseudonymous and dispatch retries are bounded', () => {
  const key = createListingWatchSubmissionKey('192.0.2.1', 'Browser', secret)
  assert.equal(key?.length, 64)
  assert.equal(key?.includes('192.0.2.1'), false)
  assert.equal(createListingWatchSubmissionKey('', 'Browser', secret), null)

  assert.equal(isListingWatchDispatchRetryable({ status: 'FAILED', updated_at: new Date().toISOString() }), true)
  assert.equal(isListingWatchDispatchRetryable({ status: 'ACCEPTED', updated_at: '2020-01-01' }), false)
  assert.equal(isListingWatchDispatchRetryable({ status: 'PENDING', updated_at: '2026-08-29T00:00:00Z' }, new Date('2026-08-29T00:31:00Z')), true)
  assert.equal(isListingWatchDispatchRetryable({ status: 'PENDING', updated_at: '2026-08-29T00:10:00Z' }, new Date('2026-08-29T00:31:00Z')), false)
})
