import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeSellerFunnelStage,
  sellerFunnelEventKey,
  sellerFunnelStageOrder,
} from '../src/utils/seller-funnel.mjs'

test('seller funnel accepts only the closed stage vocabulary', () => {
  assert.equal(normalizeSellerFunnelStage('FORM_STARTED'), 'FORM_STARTED')
  assert.equal(normalizeSellerFunnelStage('PAYMENT_CONFIRMED', true), null)
  assert.equal(normalizeSellerFunnelStage('send_everyone_an_email'), null)
})

test('seller intent is daily-deduplicated without retaining seller identifiers in the key', () => {
  const first = sellerFunnelEventKey({ sellerId: 'seller-123', stage: 'FORM_STARTED', date: new Date('2026-08-29T08:00:00Z') })
  const duplicate = sellerFunnelEventKey({ sellerId: 'seller-123', stage: 'FORM_STARTED', date: new Date('2026-08-29T20:00:00Z') })
  const nextDay = sellerFunnelEventKey({ sellerId: 'seller-123', stage: 'FORM_STARTED', date: new Date('2026-08-30T08:00:00Z') })
  assert.equal(first, duplicate)
  assert.notEqual(first, nextDay)
  assert.equal(first.length, 64)
  assert.doesNotMatch(first, /seller-123/)
})

test('durable listing stages are unique per listing and ordered', () => {
  const key = sellerFunnelEventKey({ sellerId: 'seller-123', listingId: 'listing-456', stage: 'LISTING_PUBLISHED' })
  assert.equal(key.length, 64)
  assert.ok(sellerFunnelStageOrder('LISTING_SUBMITTED') < sellerFunnelStageOrder('LISTING_PUBLISHED'))
  assert.equal(sellerFunnelEventKey({ sellerId: 'seller-123', stage: 'LISTING_PUBLISHED' }), null)
})

test('checkout recovery is measured once per listing per day', () => {
  const first = sellerFunnelEventKey({ sellerId: 'seller-123', listingId: 'listing-456', stage: 'CHECKOUT_RESUMED', date: new Date('2026-08-29T08:00:00Z') })
  const duplicate = sellerFunnelEventKey({ sellerId: 'seller-123', listingId: 'listing-456', stage: 'CHECKOUT_RESUMED', date: new Date('2026-08-29T22:00:00Z') })
  const otherListing = sellerFunnelEventKey({ sellerId: 'seller-123', listingId: 'listing-789', stage: 'CHECKOUT_RESUMED', date: new Date('2026-08-29T22:00:00Z') })
  assert.equal(first, duplicate)
  assert.notEqual(first, otherListing)
})
