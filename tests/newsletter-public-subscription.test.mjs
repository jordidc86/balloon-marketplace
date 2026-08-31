import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parsePublicNewsletterOptIn,
  parsePublicNewsletterConfirmationIdempotencyKey,
  publicNewsletterConfirmationIdempotencyKey,
  publicNewsletterConfirmationLifetimeMs,
  publicNewsletterEmailHash,
  publicNewsletterSubmissionKey,
  normalizePublicNewsletterSourceContext,
  signPublicNewsletterConfirmation,
  signPublicNewsletterUnsubscribe,
  verifyPublicNewsletterConfirmation,
  verifyPublicNewsletterUnsubscribe,
} from '../src/utils/newsletter-public-subscription.mjs'

const secret = 'public-newsletter-test-secret-long-enough'
const subscriptionId = '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a'

test('public newsletter request is explicit, normalized and bot resistant', () => {
  const form = new FormData()
  form.set('email', ' Pilot@Example.com ')
  form.set('privacy_consent', 'yes')
  form.set('source_context', 'catalog')
  assert.deepEqual(parsePublicNewsletterOptIn(form), { email: 'pilot@example.com', source_context: 'catalog' })
  assert.equal(normalizePublicNewsletterSourceContext('https://attacker.example'), 'unknown')
  assert.equal(publicNewsletterEmailHash('pilot@example.com', secret)?.length, 64)
  assert.equal(publicNewsletterSubmissionKey('203.0.113.1', 'test-agent', secret)?.length, 64)

  form.set('website', 'bot')
  assert.throws(() => parsePublicNewsletterOptIn(form), /Unable/)
})

test('public confirmation is subscription, cycle, email and expiry bound', () => {
  const now = Date.parse('2026-08-31T10:00:00Z')
  const expiresAt = now + publicNewsletterConfirmationLifetimeMs
  const token = signPublicNewsletterConfirmation({ subscriptionId, email: 'pilot@example.com', confirmationCycle: 2, expiresAt, secret })
  assert.equal(verifyPublicNewsletterConfirmation({ subscriptionId, email: 'pilot@example.com', confirmationCycle: 2, expiresAt, token, secret, now }), true)
  assert.equal(verifyPublicNewsletterConfirmation({ subscriptionId, email: 'other@example.com', confirmationCycle: 2, expiresAt, token, secret, now }), false)
  assert.equal(verifyPublicNewsletterConfirmation({ subscriptionId, email: 'pilot@example.com', confirmationCycle: 3, expiresAt, token, secret, now }), false)
  assert.equal(verifyPublicNewsletterConfirmation({ subscriptionId, email: 'pilot@example.com', confirmationCycle: 2, expiresAt, token, secret, now: expiresAt + 1 }), false)
  assert.equal(publicNewsletterConfirmationIdempotencyKey(subscriptionId, 2), `newsletter-public-optin-v1-${subscriptionId}-2`)
  assert.deepEqual(parsePublicNewsletterConfirmationIdempotencyKey(`newsletter-public-optin-v1-${subscriptionId}-2`), { subscriptionId, confirmationCycle: 2 })
  assert.equal(parsePublicNewsletterConfirmationIdempotencyKey(`newsletter-public-optin-v1-${subscriptionId}-0`), null)
})

test('public unsubscribe is independent from account newsletter authority', () => {
  const token = signPublicNewsletterUnsubscribe({ subscriptionId, email: 'pilot@example.com', secret })
  assert.equal(verifyPublicNewsletterUnsubscribe({ subscriptionId, email: 'pilot@example.com', token, secret }), true)
  assert.equal(verifyPublicNewsletterUnsubscribe({ subscriptionId, email: 'other@example.com', token, secret }), false)
  assert.equal(signPublicNewsletterUnsubscribe({ subscriptionId: 'bad', email: 'pilot@example.com', secret }), null)
})
