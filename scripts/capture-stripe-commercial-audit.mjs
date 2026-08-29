#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_STRIPE !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_STRIPE=1 only after explicit approval for a read-only Stripe audit.')
}

const stripeKey = process.env.STRIPE_SECRET_KEY
if (!stripeKey) throw new Error('Missing Stripe production configuration.')

const outputPath = path.resolve(process.cwd(), process.argv[2] || 'reviews/stripe-commercial-audit.json')
const stripe = new Stripe(stripeKey)
const capturedAt = new Date()
const since = Math.floor((capturedAt.getTime() - 90 * 86_400_000) / 1000)
const [endpointPage, chargePage, sessionPage] = await Promise.all([
  stripe.webhookEndpoints.list({ limit: 100 }),
  stripe.charges.list({ limit: 100, created: { gte: since } }),
  stripe.checkout.sessions.list({ limit: 100, created: { gte: since } }),
])

const countBy = (items, key) => items.reduce((counts, item) => {
  const value = String(key(item) || 'unknown')
  counts[value] = (counts[value] || 0) + 1
  return counts
}, {})
const sumByCurrency = (items, amount) => items.reduce((totals, item) => {
  const currency = String(item.currency || 'unknown').toLowerCase()
  totals[currency] = (totals[currency] || 0) + Number(amount(item) || 0)
  return totals
}, {})

const relevantEndpoints = endpointPage.data.filter((endpoint) => /aerotrade|netlify/i.test(endpoint.url))
const successfulCharges = chargePage.data.filter((charge) => charge.paid && charge.status === 'succeeded')
const requiredEvents = [
  'checkout.session.completed',
  'checkout.session.expired',
  'charge.succeeded',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]

let internalEvidence = null
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  const [{ count: paymentReceipts, error: receiptError }, { count: processedEvents, error: eventError }] = await Promise.all([
    supabase.from('payment_notification_receipts').select('charge_id', { count: 'exact', head: true }).eq('livemode', true),
    supabase.from('stripe_webhook_events').select('event_id', { count: 'exact', head: true }).eq('status', 'processed'),
  ])
  if (receiptError || eventError) throw receiptError || eventError
  internalEvidence = { livePaymentReceipts: paymentReceipts || 0, processedStripeEvents: processedEvents || 0 }
}

const report = {
  version: 1,
  projectId: 'aerotrade',
  readOnly: true,
  containsPii: false,
  capturedAt: capturedAt.toISOString(),
  period: { rollingDays: 90, since: new Date(since * 1000).toISOString() },
  stripeMode: stripeKey.startsWith('sk_live_') ? 'live' : stripeKey.startsWith('sk_test_') ? 'test' : 'restricted_or_unknown',
  webhooks: {
    relevantEndpoints: relevantEndpoints.length,
    enabledEndpoints: relevantEndpoints.filter((endpoint) => endpoint.status === 'enabled').length,
    requiredEventCoverage: Object.fromEntries(requiredEvents.map((event) => [
      event,
      relevantEndpoints.some((endpoint) => endpoint.status === 'enabled' && (endpoint.enabled_events.includes('*') || endpoint.enabled_events.includes(event))),
    ])),
  },
  charges: {
    total: chargePage.data.length,
    successful: successfulCharges.length,
    grossMinorByCurrency: sumByCurrency(successfulCharges, (charge) => charge.amount),
    refundedMinorByCurrency: sumByCurrency(successfulCharges, (charge) => charge.amount_refunded),
  },
  checkouts: {
    total: sessionPage.data.length,
    complete: sessionPage.data.filter((session) => session.status === 'complete').length,
    paid: sessionPage.data.filter((session) => session.payment_status === 'paid').length,
    byType: countBy(sessionPage.data, (session) => session.metadata?.type),
    byStatus: countBy(sessionPage.data, (session) => session.status),
  },
  internalEvidence,
  caveat: 'Stripe gross charges are not net revenue. Historical charges without current metadata are not assigned to a product by inference.',
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Read-only Stripe commercial audit written to ${outputPath}`)
