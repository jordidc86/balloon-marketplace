import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getUnnotifiedWantedMatchIds,
  isWantedMatchDispatchRetryable,
  wantedMatchDispatchFingerprint,
} from '../src/utils/wanted-request.mjs'

test('wanted match digests are stable, bounded and order independent', () => {
  const first = wantedMatchDispatchFingerprint('wanted-1', ['listing-b', 'listing-a', 'listing-a'])
  const second = wantedMatchDispatchFingerprint('wanted-1', ['listing-a', 'listing-b'])
  assert.equal(first, second)
  assert.equal(first?.length, 64)
  assert.equal(wantedMatchDispatchFingerprint('', ['listing-a']), null)
  assert.equal(wantedMatchDispatchFingerprint('wanted-1', ['1', '2', '3', '4', '5', '6']), null)
})

test('accepted, pending and failed dispatches cannot create duplicate listing alerts', () => {
  const dispatches = [
    { status: 'ACCEPTED', listing_ids: ['listing-a'] },
    { status: 'PENDING', listing_ids: ['listing-b'] },
    { status: 'FAILED', listing_ids: ['listing-c'] },
    { status: 'CANCELLED', listing_ids: ['listing-d'] },
  ]
  assert.deepEqual(
    getUnnotifiedWantedMatchIds(['listing-e', 'listing-b', 'listing-a', 'listing-d', 'listing-f', 'listing-g'], dispatches, 2),
    ['listing-d', 'listing-e'],
  )
})

test('failed and stale pending digests are retryable without reopening accepted alerts', () => {
  const now = new Date('2026-08-29T12:00:00.000Z')
  assert.equal(isWantedMatchDispatchRetryable({ status: 'FAILED', updated_at: '2026-08-29T11:59:59.000Z' }, now), true)
  assert.equal(isWantedMatchDispatchRetryable({ status: 'PENDING', updated_at: '2026-08-29T11:29:59.000Z' }, now), true)
  assert.equal(isWantedMatchDispatchRetryable({ status: 'PENDING', updated_at: '2026-08-29T11:45:00.000Z' }, now), false)
  assert.equal(isWantedMatchDispatchRetryable({ status: 'ACCEPTED', updated_at: '2026-08-28T00:00:00.000Z' }, now), false)
})
