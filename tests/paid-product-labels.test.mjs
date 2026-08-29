import test from 'node:test'
import assert from 'node:assert/strict'
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
