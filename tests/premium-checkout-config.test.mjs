import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPremiumCheckoutParams } from '../src/utils/premium-checkout-config.mjs'

test('Premium checkout configuration is bound to AeroTrade product, price and trusted returns', () => {
  const params = buildPremiumCheckoutParams({
    userId: 'test-user',
    userEmail: 'test@example.invalid',
    origin: 'https://aerotrade.app',
    source: 'pricing',
    successPath: '/dashboard?upgraded=true',
    cancelPath: '/dashboard?premium_payment=canceled',
  })
  assert.equal(params.line_items[0].price_data.unit_amount, 999)
  assert.equal(params.line_items[0].price_data.product_data.name, 'AeroTrade Buyer Early Access')
  assert.equal(params.line_items[0].price_data.recurring.interval, 'year')
  assert.equal(params.metadata.type, 'premium_subscription')
  assert.equal(params.metadata.intent_version, '1')
  assert.deepEqual(params.subscription_data.metadata, params.metadata)
  assert.equal(params.success_url, 'https://aerotrade.app/dashboard?upgraded=true')
})

test('Premium checkout configuration rejects unknown sources and external return URLs', () => {
  assert.throws(() => buildPremiumCheckoutParams({ userId: 'u', origin: 'https://aerotrade.app', source: 'other' }), /Invalid Premium checkout source/)
  const params = buildPremiumCheckoutParams({
    userId: 'test-user',
    userEmail: 'test@example.invalid',
    origin: 'https://aerotrade.app/path',
    source: 'dashboard',
    successPath: '//attacker.example',
    cancelPath: 'https://attacker.example',
  })
  assert.equal(params.success_url, 'https://aerotrade.app/dashboard?premium_payment=processing')
  assert.equal(params.cancel_url, 'https://aerotrade.app/dashboard?premium_payment=canceled')
})

test('admin-created buyer early-access checkout uses the same durable metadata contract', () => {
  const params = buildPremiumCheckoutParams({ userId: 'test-user', userEmail: 'test@example.invalid', origin: 'https://aerotrade.app', source: 'admin' })
  assert.equal(params.metadata.checkout_source, 'admin')
  assert.equal(params.metadata.intent_version, '1')
  assert.equal(params.subscription_data.metadata.user_id, 'test-user')
})
