import test from 'node:test'
import assert from 'node:assert/strict'
import {
  inquiryBuyerCapabilityLifetimeMs,
  inquiryBuyerPortalCapabilityLifetimeMs,
  isInquiryBuyerResponseWindowOpen,
  signInquiryBuyerCapability,
  signInquiryBuyerPortalCapability,
  verifyInquiryBuyerCapability,
  verifyInquiryBuyerPortalCapability,
} from '../src/utils/inquiry-buyer-capability.mjs'
import { parseBuyerInquiryResponse } from '../src/utils/inquiry-safety.mjs'

const inquiryId = '4e2be39d-6390-409a-8304-ae16b1239fc1'
const eventId = '7b086db4-ae43-4dc4-b603-f722b52a84fb'
const secret = 'a-production-length-secret-for-tests'
const now = new Date('2026-08-29T12:00:00Z')
const expiresAt = new Date(now.getTime() + inquiryBuyerCapabilityLifetimeMs)

test('buyer negotiation capability is email, inquiry, event and expiry bound', () => {
  const token = signInquiryBuyerCapability({ inquiryId, eventId, buyerEmail: ' Buyer@Example.com ', expiresAt, secret })
  assert.match(token, /^\d{10}\.[0-9a-f]{64}$/)
  assert.equal(verifyInquiryBuyerCapability({ inquiryId, eventId, buyerEmail: 'buyer@example.com', expiresAt, secret, token }, now), true)
  assert.equal(verifyInquiryBuyerCapability({ inquiryId, eventId: inquiryId, buyerEmail: 'buyer@example.com', expiresAt, secret, token }, now), false)
  assert.equal(verifyInquiryBuyerCapability({ inquiryId, eventId, buyerEmail: 'other@example.com', expiresAt, secret, token }, now), false)
  assert.equal(verifyInquiryBuyerCapability({ inquiryId, eventId, buyerEmail: 'buyer@example.com', expiresAt, secret, token }, new Date(expiresAt.getTime() + 1000)), false)
})

test('buyer deal-room capability is inquiry, email and 90-day expiry bound', () => {
  const portalExpiry = new Date(now.getTime() + inquiryBuyerPortalCapabilityLifetimeMs)
  const token = signInquiryBuyerPortalCapability({ inquiryId, buyerEmail: ' Buyer@Example.com ', expiresAt: portalExpiry, secret })
  assert.match(token, /^\d{10}\.[0-9a-f]{64}$/)
  assert.equal(verifyInquiryBuyerPortalCapability({ inquiryId, buyerEmail: 'buyer@example.com', secret, token }, now), true)
  assert.equal(verifyInquiryBuyerPortalCapability({ inquiryId: eventId, buyerEmail: 'buyer@example.com', secret, token }, now), false)
  assert.equal(verifyInquiryBuyerPortalCapability({ inquiryId, buyerEmail: 'other@example.com', secret, token }, now), false)
  assert.equal(verifyInquiryBuyerPortalCapability({ inquiryId, buyerEmail: 'buyer@example.com', secret, token }, new Date(portalExpiry.getTime() + 1000)), false)
})

test('buyer response window closes exactly after its signed expiry', () => {
  assert.equal(isInquiryBuyerResponseWindowOpen(expiresAt, now), true)
  assert.equal(isInquiryBuyerResponseWindowOpen(expiresAt, new Date(expiresAt.getTime() + 1)), false)
  assert.equal(isInquiryBuyerResponseWindowOpen('invalid', now), false)
})

test('buyer response accepts only one closed action contract', () => {
  const data = new FormData()
  data.set('response', 'counter')
  data.set('counter_amount', '24,500.00')
  assert.throws(() => parseBuyerInquiryResponse(data), /invalid/)
  data.set('counter_amount', '24500.00')
  data.set('response_note', 'Subject to an independent technical inspection.')
  assert.deepEqual(parseBuyerInquiryResponse(data), {
    response: 'COUNTER',
    amount_minor: 2450000,
    note: 'Subject to an independent technical inspection.',
  })
  data.set('response', 'DECLINE')
  assert.throws(() => parseBuyerInquiryResponse(data), /only allowed/)
})
