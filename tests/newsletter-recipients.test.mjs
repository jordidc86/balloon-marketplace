import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNewsletterRecipients, isActivePublicNewsletterConsent } from '../src/utils/newsletter-recipients.mjs'

const activeAccount = (id, email) => ({
  id,
  email,
  newsletter_consent_status: 'ACTIVE',
  newsletter_consented_at: '2026-08-31T12:00:00Z',
  newsletter_unsubscribed_at: null,
})

const activePublic = (id, email) => ({
  id,
  email,
  status: 'ACTIVE',
  confirmed_at: '2026-08-31T12:00:00Z',
  unsubscribed_at: null,
})

test('account and public newsletter consent are combined without duplicate delivery', () => {
  const result = buildNewsletterRecipients({
    users: [activeAccount('5c1d1bca-5c56-4c96-bab1-bf537ad9b93a', ' Pilot@Example.com ')],
    publicSubscriptions: [
      activePublic('3c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'pilot@example.com'),
      activePublic('4c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'buyer@example.com'),
    ],
  })
  assert.deepEqual(result.recipients, [
    { id: '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a', email: 'pilot@example.com', kind: 'account' },
    { id: '4c1d1bca-5c56-4c96-bab1-bf537ad9b93a', email: 'buyer@example.com', kind: 'public' },
  ])
  assert.equal(result.duplicateRecipients, 1)
  assert.equal(result.skippedInvalidRecipients, 1)
})

test('pending, stopped and malformed public subscriptions are never recipients', () => {
  const result = buildNewsletterRecipients({
    publicSubscriptions: [
      { ...activePublic('3c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'pending@example.com'), status: 'PENDING', confirmed_at: null },
      { ...activePublic('4c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'stopped@example.com'), status: 'UNSUBSCRIBED', unsubscribed_at: '2026-08-31T13:00:00Z' },
      activePublic('5c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'not-an-email'),
    ],
  })
  assert.deepEqual(result.recipients, [])
  assert.equal(result.skippedInvalidRecipients, 3)
  assert.equal(isActivePublicNewsletterConsent(activePublic('6c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'ok@example.com')), true)
})

test('test delivery never mixes with live consent rows', () => {
  const result = buildNewsletterRecipients({
    users: [activeAccount('5c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'pilot@example.com')],
    publicSubscriptions: [activePublic('4c1d1bca-5c56-4c96-bab1-bf537ad9b93a', 'buyer@example.com')],
    testEmail: ' TEST@Example.com ',
  })
  assert.deepEqual(result.recipients, [{ id: null, email: 'test@example.com', kind: 'test' }])
})
