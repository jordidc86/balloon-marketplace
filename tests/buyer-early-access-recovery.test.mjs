import assert from 'node:assert/strict'
import test from 'node:test'
import { isBuyerEarlyAccessRecoveryCandidate } from '../src/utils/buyer-early-access-recovery.mjs'

test('buyer checkout recovery targets only a buyer-initiated expired annual checkout', () => {
  const now = new Date('2026-08-29T12:00:00Z')
  const candidate = { status: 'EXPIRED', source: 'pricing', isPremium: false, createdAt: '2026-08-28T11:59:59Z' }
  assert.equal(isBuyerEarlyAccessRecoveryCandidate(candidate, now), true)
  assert.equal(isBuyerEarlyAccessRecoveryCandidate({ ...candidate, source: 'admin' }, now), false)
  assert.equal(isBuyerEarlyAccessRecoveryCandidate({ ...candidate, status: 'STARTED' }, now), false)
  assert.equal(isBuyerEarlyAccessRecoveryCandidate({ ...candidate, isPremium: true }, now), false)
  assert.equal(isBuyerEarlyAccessRecoveryCandidate({ ...candidate, createdAt: '2026-08-28T12:00:01Z' }, now), false)
})
