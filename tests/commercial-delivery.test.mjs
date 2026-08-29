import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commercialDeliveryMaxAttempts,
  getCommercialDeliveryDecision,
  getNextCommercialAttemptAt,
} from '../src/utils/commercial-delivery.mjs'

test('transactional delivery never repeats an accepted provider receipt', () => {
  const decision = getCommercialDeliveryDecision({
    status: 'accepted',
    provider_message_id: 'provider-evidence',
    delivery_attempts: 1,
    next_attempt_at: null,
  }, new Date('2026-08-29T12:00:00.000Z'))
  assert.equal(decision, 'duplicate')
})

test('transactional delivery waits for its retry window and stops after two attempts', () => {
  const now = new Date('2026-08-29T12:00:00.000Z')
  assert.equal(commercialDeliveryMaxAttempts, 2)
  assert.equal(getCommercialDeliveryDecision({ status: 'failed', delivery_attempts: 1, next_attempt_at: '2026-08-29T12:00:01.000Z' }, now), 'deferred')
  assert.equal(getCommercialDeliveryDecision({ status: 'failed', delivery_attempts: 1, next_attempt_at: '2026-08-29T11:59:59.000Z' }, now), 'send')
  assert.equal(getCommercialDeliveryDecision({ status: 'failed', delivery_attempts: 2, next_attempt_at: null }, now), 'exhausted')
  assert.equal(getNextCommercialAttemptAt(1, now), '2026-08-29T18:00:00.000Z')
  assert.equal(getNextCommercialAttemptAt(2, now), null)
})
