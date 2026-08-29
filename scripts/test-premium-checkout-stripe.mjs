#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'
import { buildPremiumCheckoutParams } from '../src/utils/premium-checkout-config.mjs'

if (process.env.CONFIRM_STRIPE_TEST_MODE !== '1') throw new Error('Explicit Stripe test-mode confirmation is required.')
const key = process.env.STRIPE_TEST_SECRET_KEY
if (!key?.startsWith('sk_test_')) throw new Error('A Stripe test-mode secret key is required.')

const stripe = new Stripe(key)
const params = buildPremiumCheckoutParams({
  userId: '00000000-0000-0000-0000-000000000000',
  userEmail: 'stripe-test@aerotrade.app',
  origin: 'https://aerotrade.app',
  source: 'dashboard',
  successPath: '/dashboard?upgraded=true',
  cancelPath: '/dashboard?premium_payment=canceled',
})
const created = await stripe.checkout.sessions.create(params)
if (created.livemode || created.status !== 'open' || !created.url) throw new Error('Stripe test checkout did not open safely.')
const expired = await stripe.checkout.sessions.expire(created.id)
const readback = await stripe.checkout.sessions.retrieve(created.id)
if (expired.status !== 'expired' || readback.status !== 'expired') throw new Error('Stripe test checkout expiry readback failed.')

const report = {
  version: 1,
  projectId: 'aerotrade',
  testMode: true,
  containsPii: false,
  completedAt: new Date().toISOString(),
  checkout: {
    createdOpen: created.status === 'open',
    subscriptionMode: created.mode === 'subscription',
    amountTotalMinor: created.amount_total,
    currency: created.currency,
    expiredReadback: readback.status === 'expired',
    metadataContract: created.metadata?.type === 'premium_subscription' && created.metadata?.intent_version === '1',
    trustedSuccessReturn: created.success_url === 'https://aerotrade.app/dashboard?upgraded=true',
    trustedCancelReturn: created.cancel_url === 'https://aerotrade.app/dashboard?premium_payment=canceled',
  },
  economicActionsPerformed: 0,
}
const output = path.resolve(process.cwd(), process.argv[2] || 'reviews/premium-checkout-test.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Stripe test-mode checkout verified and expired safely: ${output}`)
