import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buyerEarlyAccessProduct,
  paidProductByPaymentType,
  sellerLaunchPromotionProduct,
} from '../src/utils/paid-product-labels.mjs'

test('buyer and seller paid products remain explicitly separate', () => {
  assert.equal(buyerEarlyAccessProduct.internalType, 'premium_subscription')
  assert.equal(buyerEarlyAccessProduct.publicName, 'AeroTrade Buyer Early Access')
  assert.equal(sellerLaunchPromotionProduct.internalType, 'listing_fee')
  assert.equal(sellerLaunchPromotionProduct.publicName, 'AeroTrade Seller Launch Promotion')
  assert.notEqual(buyerEarlyAccessProduct.publicName, sellerLaunchPromotionProduct.publicName)
  assert.equal(paidProductByPaymentType.premium_subscription, buyerEarlyAccessProduct)
  assert.equal(paidProductByPaymentType.listing_fee, sellerLaunchPromotionProduct)
})

test('seller promotion checkout is durably linked and fulfillment fails closed', () => {
  const checkoutSource = fs.readFileSync(new URL('../src/utils/listing-checkout.ts', import.meta.url), 'utf8')
  const webhookSource = fs.readFileSync(new URL('../src/app/api/webhooks/stripe/route.ts', import.meta.url), 'utf8')
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260831620000_paid_listing_checkout_traceability.sql', import.meta.url), 'utf8')

  assert.match(checkoutSource, /payment_intent_data:\s*\{ metadata \}/)
  assert.match(checkoutSource, /register_listing_checkout_intent/)
  assert.match(checkoutSource, /currentSession\.status === 'open' && currentSession\.url/)
  assert.match(checkoutSource, /expireOpenStripeListingSessions/)
  assert.match(checkoutSource, /retireListingCheckoutBeforeFreePublication/)
  assert.match(checkoutSource, /checkout\.sessions\.list\(\{ limit: 100 \}\)/)
  assert.match(checkoutSource, /session\.status === 'complete'/)
  assert.match(checkoutSource, /checkout\.sessions\.expire\(session\.id\)/)
  assert.match(migration, /listing_checkout_intents_one_live_per_listing/)
  assert.match(migration, /v_listing\.seller_id <> p_user_id/)
  assert.match(webhookSource, /getStoredListingPlan\(currentListing\.details\) !== 'premium'/)
  assert.match(webhookSource, /Seller Launch Promotion confirmation was not accepted/)
  assert.match(webhookSource, /Paid Premium alert is not fully fulfilled/)
  assert.doesNotMatch(webhookSource, /Failed to send premium listing alert after listing payment/)
})

test('an unpaid Seller Launch listing has one audited free-publication escape', () => {
  const action = fs.readFileSync(new URL('../src/app/catalog/[id]/actions.ts', import.meta.url), 'utf8')
  const dashboard = fs.readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8')
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260831660000_pending_listing_free_recovery.sql', import.meta.url), 'utf8')

  assert.match(dashboard, /Publish free instead/)
  assert.match(action, /retireListingCheckoutBeforeFreePublication/)
  assert.match(action, /publish_pending_listing_free/)
  assert.match(action, /Free listing publication was not verified by readback/)
  assert.match(migration, /for update/)
  assert.match(migration, /status = 'ACTIVE_PUBLIC'/)
  assert.match(migration, /'LISTING_PUBLISHED'/)
  assert.match(migration, /'recovery'/)
  assert.match(migration, /grant execute on function public\.publish_pending_listing_free\(uuid, uuid, text\) to service_role/)
  assert.doesNotMatch(migration, /grant execute[^;]+authenticated/)
})

test('idempotent listing checkout registration returns the same live Stripe session binding', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260831630000_idempotent_listing_checkout_registration.sql', import.meta.url), 'utf8')
  assert.match(migration, /for update/)
  assert.match(migration, /where stripe_session_id = p_stripe_session_id/)
  assert.match(migration, /return v_intent/)
  assert.match(migration, /v_intent\.status <> 'STARTED'/)
})
