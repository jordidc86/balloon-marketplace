import assert from 'node:assert/strict'
import test from 'node:test'

import {
  minimumAccountPasswordLength,
  normalizeAccountRecoveryEmail,
  validateAccountPasswordChange,
} from '../src/utils/account-recovery.mjs'

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
