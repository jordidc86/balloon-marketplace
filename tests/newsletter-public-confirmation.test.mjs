import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPublicNewsletterConfirmation } from '../src/utils/newsletter-public-confirmation.mjs'

test('public newsletter confirmation builder is deterministic in scope and scanner safe', () => {
  const notification = buildPublicNewsletterConfirmation({
    subscriptionId: '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a',
    email: 'pilot@example.com',
    confirmationCycle: 3,
    secret: 'public-newsletter-test-secret-long-enough',
    baseUrl: 'https://aerotrade.app/path-is-ignored',
    now: Date.parse('2026-08-31T10:00:00Z'),
  })
  assert.ok(notification)
  assert.equal(notification.idempotencyKey, 'newsletter-public-optin-v1-5c1d1bca-5c56-4c96-bab1-bf537ad9b93a-3')
  assert.match(notification.confirmationUrl, /^https:\/\/aerotrade\.app\/newsletter\/subscribe\?/) 
  assert.match(notification.html, /Opening the link does not subscribe you/)
  assert.equal(buildPublicNewsletterConfirmation({ subscriptionId: 'bad', email: 'pilot@example.com', confirmationCycle: 1, secret: 'public-newsletter-test-secret-long-enough', baseUrl: 'http://unsafe.example' }), null)
})
