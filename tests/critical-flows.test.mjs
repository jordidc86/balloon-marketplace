import test from 'node:test'
import assert from 'node:assert/strict'

import { getApplicationOrigin, getSafeRedirectPath } from '../src/utils/navigation.mjs'
import {
  canRevealSellerContact,
  getInitialListingPublication,
  maxListingImages,
  parseListingImageUrls,
} from '../src/utils/listing-safety.mjs'
import {
  assessMetaTokenData,
  classifyMetaError,
  createMissingEmailProviderResult,
  reconcileEmailProviderDeliveries,
  shouldTryNextMetaCredential,
  withBoundedRetry,
} from '../src/utils/delivery-safety.mjs'
import {
  duplicateNewsletterRunResult,
  newsletterBatchIdempotencyKey,
} from '../src/utils/newsletter-safety.mjs'
import {
  buildPaymentNotification,
  formatPaymentAmount,
  paymentNotificationIdempotencyKey,
} from '../src/utils/payment-notification.mjs'

test('redirects only accept local application paths', () => {
  assert.equal(getSafeRedirectPath('/pricing'), '/pricing')
  assert.equal(getSafeRedirectPath(' /catalog/123 '), '/catalog/123')
  assert.equal(getSafeRedirectPath('https://attacker.example'), '/dashboard')
  assert.equal(getSafeRedirectPath('//attacker.example'), '/dashboard')
  assert.equal(getSafeRedirectPath(null), '/dashboard')
})

test('production Stripe returns always use the configured public origin', () => {
  assert.equal(
    getApplicationOrigin('https://attacker.example', 'https://aerotrade.app', 'production'),
    'https://aerotrade.app',
  )
  assert.equal(
    getApplicationOrigin('http://localhost:3000', 'https://aerotrade.app', 'development'),
    'http://localhost:3000',
  )
  assert.equal(
    getApplicationOrigin('https://attacker.example', 'https://aerotrade.app', 'development'),
    'https://aerotrade.app',
  )
})

test('successful AeroTrade payments create one safe, useful admin notification', () => {
  const notification = buildPaymentNotification({
    eventId: 'evt_payment_123',
    amount: 999,
    currency: 'eur',
    createdAt: '2026-08-09T18:11:25.000Z',
    customerEmail: 'buyer@example.com',
    paymentType: 'premium_subscription',
    product: 'AeroTrade Premium Club',
    dashboardUrl: 'https://dashboard.stripe.com/payments/ch_safe',
  })

  assert.equal(formatPaymentAmount(999, 'eur'), '9,99 €')
  assert.match(notification.subject, /9,99/)
  assert.match(notification.subject, /suscripción Premium Club/)
  assert.match(notification.html, /AeroTrade Premium Club/)
  assert.match(notification.html, /buyer@example\.com/)
  assert.match(notification.html, /evento firmado de Stripe/)
  assert.equal(notification.idempotencyKey, 'aerotrade-payment-evt_payment_123')
  assert.equal(paymentNotificationIdempotencyKey('evt_payment_123'), notification.idempotencyKey)
  assert.throws(() => paymentNotificationIdempotencyKey('not-an-event'), /valid Stripe event id/i)
})

test('premium listings always wait for their own payment', () => {
  const now = new Date('2026-07-11T10:00:00.000Z')
  assert.deepEqual(getInitialListingPublication('premium', now), {
    status: 'PENDING_PAYMENT',
    publicAt: null,
  })
  assert.deepEqual(getInitialListingPublication('free', now), {
    status: 'ACTIVE_PUBLIC',
    publicAt: '2026-07-11T10:00:00.000Z',
  })
})

test('listing images are required, unique and bounded', () => {
  assert.deepEqual(
    parseListingImageUrls('["https://cdn.example/one.jpg", "https://cdn.example/one.jpg"]'),
    ['https://cdn.example/one.jpg'],
  )
  assert.throws(() => parseListingImageUrls('[]'), /at least one/i)
  assert.throws(() => parseListingImageUrls('["javascript:alert(1)"]'), /valid URLs/i)
  assert.throws(
    () => parseListingImageUrls(JSON.stringify(Array.from({ length: maxListingImages + 1 }, (_, index) => `https://cdn.example/${index}.jpg`))),
    /at most/i,
  )
})

test('seller contact is public only for active eligible listings', () => {
  const now = new Date('2026-07-11T10:00:00.000Z')
  const publicListing = { status: 'ACTIVE_PUBLIC', sellerId: 'seller', publicAt: null }
  const exclusiveListing = { status: 'ACTIVE_PREMIUM', sellerId: 'seller', publicAt: '2026-07-12T10:00:00.000Z' }
  const expiredPremiumListing = { status: 'ACTIVE_PREMIUM', sellerId: 'seller', publicAt: '2026-07-10T10:00:00.000Z' }
  const draftListing = { status: 'DRAFT', sellerId: 'seller', publicAt: null }

  assert.equal(canRevealSellerContact(publicListing, { userId: null, isPremium: false }, now), true)
  assert.equal(canRevealSellerContact(exclusiveListing, { userId: null, isPremium: false }, now), false)
  assert.equal(canRevealSellerContact(exclusiveListing, { userId: 'buyer', isPremium: true }, now), true)
  assert.equal(canRevealSellerContact(expiredPremiumListing, { userId: null, isPremium: false }, now), true)
  assert.equal(canRevealSellerContact(draftListing, { userId: null, isPremium: false }, now), false)
  assert.equal(canRevealSellerContact(draftListing, { userId: 'seller', isPremium: false }, now), true)
})

test('missing Resend credentials fail closed without counting mock deliveries', () => {
  const result = createMissingEmailProviderResult([
    { to: 'buyer@example.com', subject: 'Alert', html: '<p>Alert</p>' },
  ])

  assert.equal(result.success, false)
  assert.equal(result.configurationError, true)
  assert.equal(result.sentCount, 0)
  assert.equal(result.failedCount, 1)
  assert.equal(result.deliveryResults[0].status, 'failed')
  assert.match(result.deliveryResults[0].error, /no email was sent/i)
})

test('partial provider acceptance is reported as partial failure with provider ids', () => {
  const emails = [
    { to: 'accepted@example.com' },
    { to: 'rejected@example.com' },
  ]
  const result = reconcileEmailProviderDeliveries(
    emails,
    [{ id: 'resend-accepted-1' }],
    [{ index: 1, message: 'Recipient rejected' }],
  )

  assert.equal(result.success, false)
  assert.equal(result.sentCount, 1)
  assert.equal(result.failedCount, 1)
  assert.deepEqual(result.deliveryResults, [
    { to: 'accepted@example.com', status: 'sent', resendId: 'resend-accepted-1' },
    { to: 'rejected@example.com', status: 'failed', error: 'Recipient rejected' },
  ])
})

test('duplicate newsletter runs preserve the original delivery outcome', () => {
  const partial = duplicateNewsletterRunResult({
    id: 'run-partial',
    status: 'partial',
    sent_count: 14,
    failed_count: 1,
  }, '2026-08-01')
  assert.equal(partial.success, false)
  assert.equal(partial.failedCount, 1)
  assert.equal(partial.runId, 'run-partial')
  assert.match(partial.message, /automatic retry remains blocked/i)

  const sent = duplicateNewsletterRunResult({
    id: 'run-sent',
    status: 'sent',
    sent_count: 15,
    failed_count: 0,
  }, '2026-08-16')
  assert.equal(sent.success, true)
  assert.equal(sent.failedCount, 0)

  const uncertain = duplicateNewsletterRunResult({
    id: 'run-uncertain',
    status: 'audit_uncertain',
    sent_count: 0,
    failed_count: 0,
  }, '2026-09-01')
  assert.equal(uncertain.success, false)
  assert.match(uncertain.message, /automatic retry remains blocked/i)
})

test('newsletter batch retries use a stable provider idempotency key per chunk', () => {
  assert.equal(
    newsletterBatchIdempotencyKey('newsletter/run-123', 0),
    'newsletter/run-123/chunk-1',
  )
  assert.equal(
    newsletterBatchIdempotencyKey('newsletter/run-123', 1),
    'newsletter/run-123/chunk-2',
  )
  assert.throws(
    () => newsletterBatchIdempotencyKey('newsletter with spaces', 0),
    /prefix is invalid/i,
  )
})

test('provider acceptance without an id is not counted as sent', () => {
  const result = reconcileEmailProviderDeliveries(
    [{ to: 'unverified@example.com' }],
    [{}],
  )

  assert.equal(result.success, false)
  assert.equal(result.sentCount, 0)
  assert.equal(result.failedCount, 1)
  assert.match(result.deliveryResults[0].error, /acceptance identifier/i)
})

test('Meta timeouts retry a bounded number of safe read attempts', async () => {
  let attempts = 0
  const result = await withBoundedRetry(async () => {
    attempts += 1
    if (attempts < 3) {
      const error = new Error('Instagram container was not ready before timeout')
      error.code = 'ETIMEDOUT'
      throw error
    }
    return 'ready'
  }, { attempts: 3 })

  assert.equal(result, 'ready')
  assert.equal(attempts, 3)
  assert.equal(classifyMetaError(new Error('Media was not ready before timeout')).category, 'timeout')
  assert.equal(shouldTryNextMetaCredential(new Error('Media was not ready before timeout')), false)
})

test('expired Meta tokens are classified as non-retryable and stop immediately', async () => {
  let attempts = 0
  const expiredTokenError = Object.assign(new Error('The access token has expired'), {
    code: 190,
    subcode: 463,
  })

  await assert.rejects(
    withBoundedRetry(async () => {
      attempts += 1
      throw expiredTokenError
    }, { attempts: 3 }),
    /expired/i,
  )

  const classification = classifyMetaError(expiredTokenError)
  assert.equal(attempts, 1)
  assert.equal(classification.category, 'token_expired')
  assert.equal(classification.retryable, false)
  assert.match(classification.action, /reauthorize/i)
  assert.equal(shouldTryNextMetaCredential(expiredTokenError), true)
})

test('Meta data-access expiry produces a proactive warning', () => {
  const now = new Date('2026-07-31T10:00:00.000Z')
  const expiry = Math.floor(new Date('2026-08-05T10:00:00.000Z').getTime() / 1000)
  const health = assessMetaTokenData({
    is_valid: true,
    expires_at: 0,
    data_access_expires_at: expiry,
  }, now, 14)

  assert.equal(health.valid, true)
  assert.equal(health.daysRemaining, 5)
  assert.match(health.warning, /5 day/i)
})
