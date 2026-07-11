import test from 'node:test'
import assert from 'node:assert/strict'

import { getApplicationOrigin, getSafeRedirectPath } from '../src/utils/navigation.mjs'
import {
  canRevealSellerContact,
  getInitialListingPublication,
  maxListingImages,
  parseListingImageUrls,
} from '../src/utils/listing-safety.mjs'

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
