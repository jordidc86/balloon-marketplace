import assert from 'node:assert/strict'
import test from 'node:test'

import {
  sellerAvailabilityCapabilityLifetimeMs,
  signSellerAvailabilityCapability,
  verifySellerAvailabilityCapability,
} from '../src/utils/seller-availability-capability.mjs'

const input = {
  sellerId: '69f6d7c2-f063-4b1f-aa74-4149f61c5039',
  sellerEmail: 'Seller@Example.com',
  digestKey: 'seller-availability-digest-69f6d7c2-f063-4b1f-aa74-4149f61c5039-1234567890abcdef1234567890abcdef',
  secret: 'a-test-secret-that-is-long-enough',
}
const now = new Date('2026-08-29T18:00:00.000Z')

test('seller availability capability is seller, email, digest and expiry bound', () => {
  const expiresAt = new Date(now.getTime() + sellerAvailabilityCapabilityLifetimeMs)
  const token = signSellerAvailabilityCapability({ ...input, expiresAt })
  assert.ok(token)
  assert.equal(verifySellerAvailabilityCapability({ ...input, expiresAt, token }, now), true)
  assert.equal(verifySellerAvailabilityCapability({ ...input, sellerEmail: 'other@example.com', expiresAt, token }, now), false)
  assert.equal(verifySellerAvailabilityCapability({ ...input, digestKey: input.digestKey.replace(/.$/, '0'), expiresAt, token }, now), false)
  assert.equal(verifySellerAvailabilityCapability({ ...input, sellerId: 'a595685b-ddca-4ec4-990b-6f681bf0c434', expiresAt, token }, now), false)
})

test('seller availability capability expires and rejects malformed authority', () => {
  const expiresAt = new Date(now.getTime() + sellerAvailabilityCapabilityLifetimeMs)
  const token = signSellerAvailabilityCapability({ ...input, expiresAt })
  assert.equal(verifySellerAvailabilityCapability({ ...input, expiresAt, token }, new Date(expiresAt.getTime() + 1_000)), false)
  assert.equal(signSellerAvailabilityCapability({ ...input, sellerEmail: 'invalid', expiresAt }), null)
  assert.equal(signSellerAvailabilityCapability({ ...input, digestKey: 'digest', expiresAt }), null)
  assert.equal(signSellerAvailabilityCapability({ ...input, secret: 'short', expiresAt }), null)
})

test('seller availability capability rejects tokens with an excessive future lifetime', () => {
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const token = signSellerAvailabilityCapability({ ...input, expiresAt })
  assert.ok(token)
  assert.equal(verifySellerAvailabilityCapability({ ...input, expiresAt, token }, now), false)
})
