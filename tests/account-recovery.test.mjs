import assert from 'node:assert/strict'
import test from 'node:test'

import {
  accountRecoveryCapabilityLifetimeMs,
  minimumAccountPasswordLength,
  normalizeAccountRecoveryEmail,
  signAccountRecoveryCapability,
  validateAccountPasswordChange,
  verifyAccountRecoveryCapability,
} from '../src/utils/account-recovery.mjs'

const userId = '6d35b941-3795-4ebc-8b22-9ba586986db1'
const secret = 'account-recovery-test-secret-with-safe-length'

test('account recovery normalizes valid email without accepting malformed input', () => {
  assert.equal(normalizeAccountRecoveryEmail(' Seller@Example.com '), 'seller@example.com')
  assert.equal(normalizeAccountRecoveryEmail('missing-at.example.com'), null)
  assert.equal(normalizeAccountRecoveryEmail('seller@example'), null)
})

test('password recovery requires a bounded matching password', () => {
  const password = 'correct horse battery staple'
  assert.equal(validateAccountPasswordChange(password, password).valid, true)
  assert.equal(validateAccountPasswordChange('short', 'short').valid, false)
  assert.equal(validateAccountPasswordChange(password, `${password}!`).valid, false)
  assert.equal(validateAccountPasswordChange('x'.repeat(129), 'x'.repeat(129)).valid, false)
  assert.equal(minimumAccountPasswordLength, 10)
})

test('account recovery capability is account, email and expiry bound', () => {
  const now = Date.parse('2026-08-31T08:00:00Z')
  const expiresAt = now + accountRecoveryCapabilityLifetimeMs
  const token = signAccountRecoveryCapability({ userId, email: ' Seller@example.com ', expiresAt, secret })
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(verifyAccountRecoveryCapability({ userId, email: 'seller@example.com', expiresAt, token, secret, now }), true)
  assert.equal(verifyAccountRecoveryCapability({ userId, email: 'other@example.com', expiresAt, token, secret, now }), false)
  assert.equal(verifyAccountRecoveryCapability({ userId, email: 'seller@example.com', expiresAt, token, secret, now: expiresAt + 1 }), false)
})
