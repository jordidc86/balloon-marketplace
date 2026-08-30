import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isActiveNewsletterConsent,
  newsletterConsentInvitationLifetimeMs,
  newsletterUnsubscribePlaceholder,
  normalizeNewsletterEmail,
  personalizeNewsletterHtml,
  signNewsletterConsentInvitationCapability,
  signNewsletterUnsubscribeCapability,
  verifyNewsletterConsentInvitationCapability,
  verifyNewsletterUnsubscribeCapability,
} from '../src/utils/newsletter-consent.mjs'

const userId = '6d35b941-3795-4ebc-8b22-9ba586986db1'
const secret = 'newsletter-test-secret-with-safe-length'

test('newsletter recipients require explicit current consent', () => {
  assert.equal(isActiveNewsletterConsent({ newsletter_consent_status: 'NOT_REQUESTED' }), false)
  assert.equal(isActiveNewsletterConsent({ newsletter_consent_status: 'UNSUBSCRIBED', newsletter_consented_at: '2026-08-01', newsletter_unsubscribed_at: '2026-08-02' }), false)
  assert.equal(isActiveNewsletterConsent({ newsletter_consent_status: 'ACTIVE', newsletter_consented_at: null }), false)
  assert.equal(isActiveNewsletterConsent({ newsletter_consent_status: 'ACTIVE', newsletter_consented_at: '2026-08-01', newsletter_unsubscribed_at: null }), true)
})

test('newsletter unsubscribe capability is user and normalized-email bound', () => {
  const token = signNewsletterUnsubscribeCapability({ userId, email: ' Pilot@Example.com ', secret })
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(verifyNewsletterUnsubscribeCapability({ userId, email: 'pilot@example.com', token, secret }), true)
  assert.equal(verifyNewsletterUnsubscribeCapability({ userId, email: 'other@example.com', token, secret }), false)
  assert.equal(normalizeNewsletterEmail('bad email'), null)
})

test('newsletter content cannot be sent without one secure unsubscribe destination', () => {
  const template = `<p>Update</p><a href="${newsletterUnsubscribePlaceholder}">Stop emails</a>`
  const html = personalizeNewsletterHtml(template, 'https://aerotrade.app/newsletter/unsubscribe?id=1&token=2')
  assert.match(html, /id=1&amp;token=2/)
  assert.doesNotMatch(html, new RegExp(newsletterUnsubscribePlaceholder))
  assert.throws(() => personalizeNewsletterHtml('<p>No control</p>', 'https://aerotrade.app/newsletter/unsubscribe'), /placeholder/)
  assert.throws(() => personalizeNewsletterHtml(template, 'http://example.com'), /secure/)
})

test('newsletter consent invitation is purpose-bound, expiring and scanner-safe', () => {
  const now = Date.parse('2026-08-30T10:00:00Z')
  const expiresAt = now + newsletterConsentInvitationLifetimeMs
  const token = signNewsletterConsentInvitationCapability({ userId, email: ' USER@example.com ', expiresAt, secret })
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(verifyNewsletterConsentInvitationCapability({ userId, email: 'user@example.com', expiresAt, token, secret, now }), true)
  assert.equal(verifyNewsletterConsentInvitationCapability({ userId, email: 'other@example.com', expiresAt, token, secret, now }), false)
  assert.equal(verifyNewsletterConsentInvitationCapability({ userId, email: 'user@example.com', expiresAt, token, secret, now: expiresAt + 1 }), false)
  assert.equal(verifyNewsletterConsentInvitationCapability({ userId, email: 'user@example.com', expiresAt: expiresAt + 1, token, secret, now }), false)
})
