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
const completedPaidSessions = sessionPage.data.filter((session) => session.status === 'complete' && session.payment_status === 'paid')
const completedSessionUserIds = [...new Set(completedPaidSessions.map((session) => String(session.metadata?.user_id || '').trim()).filter(Boolean))]
const completedSessionIds = completedPaidSessions.map((session) => session.id)
const completedSessionEmails = [...new Set(completedPaidSessions.map((session) => String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()).filter(Boolean))]
const completedSubscriptionIds = [...new Set(completedPaidSessions.map((session) => typeof session.subscription === 'string' ? session.subscription : session.subscription?.id).filter(Boolean))]
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
  const [{ count: paymentReceipts, error: receiptError }, { count: processedEvents, error: eventError }, stripePremiumUserResult, completedUserResult, completedEmailUserResult, completedSubscriptionUserResult, completedIntentResult] = await Promise.all([
    supabase.from('payment_notification_receipts').select('charge_id', { count: 'exact', head: true }).eq('livemode', true),
    supabase.from('stripe_webhook_events').select('event_id', { count: 'exact', head: true }).eq('status', 'processed'),
    supabase.from('users').select('id,stripe_subscription_id').eq('is_premium', true).eq('premium_source', 'stripe'),
    completedSessionUserIds.length > 0
      ? supabase.from('users').select('id,is_premium,premium_source').in('id', completedSessionUserIds)
      : Promise.resolve({ data: [], error: null }),
    completedSessionEmails.length > 0
      ? supabase.from('users').select('id,is_premium,premium_source,email').in('email', completedSessionEmails)
      : Promise.resolve({ data: [], error: null }),
    completedSubscriptionIds.length > 0
      ? supabase.from('users').select('id,is_premium,premium_source,stripe_subscription_id').in('stripe_subscription_id', completedSubscriptionIds)
      : Promise.resolve({ data: [], error: null }),
    completedSessionIds.length > 0
      ? supabase.from('premium_checkout_intents').select('stripe_session_id,status,source').in('stripe_session_id', completedSessionIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (receiptError || eventError || stripePremiumUserResult.error || completedUserResult.error || completedEmailUserResult.error || completedSubscriptionUserResult.error || completedIntentResult.error) {
    throw receiptError || eventError || stripePremiumUserResult.error || completedUserResult.error || completedEmailUserResult.error || completedSubscriptionUserResult.error || completedIntentResult.error
  }
  const stripePremiumRows = stripePremiumUserResult.data || []
  const entitlementSubscriptionIds = [...new Set(stripePremiumRows.map((user) => String(user.stripe_subscription_id || '').trim()).filter(Boolean))]
  const entitlementSubscriptions = await Promise.all(entitlementSubscriptionIds.map((subscriptionId) => stripe.subscriptions.retrieve(subscriptionId)))
  const completedUsers = completedUserResult.data || []
  const completedEmailUsers = completedEmailUserResult.data || []
  const completedSubscriptionUsers = completedSubscriptionUserResult.data || []
  const completedIntents = completedIntentResult.data || []
  internalEvidence = {
    livePaymentReceipts: paymentReceipts || 0,
    processedStripeEvents: processedEvents || 0,
    stripePremiumUsers: stripePremiumRows.length,
    stripePremiumUsersWithSubscription: entitlementSubscriptionIds.length,
    stripePremiumSubscriptionStatuses: countBy(entitlementSubscriptions, (subscription) => subscription.status),
    stripePremiumUsersWithoutSubscription: stripePremiumRows.length - entitlementSubscriptionIds.length,
    completedPaidSessionsWithUserMetadata: completedSessionUserIds.length,
    completedPaidSessionsLinkedToPremiumEntitlement: completedUsers.filter((user) => user.is_premium && user.premium_source === 'stripe').length,
    completedPaidSessionsWithCustomerEmail: completedSessionEmails.length,
    completedPaidSessionsLinkedByEmailToAccount: completedEmailUsers.length,
    completedPaidSessionsLinkedByEmailToPremiumEntitlement: completedEmailUsers.filter((user) => user.is_premium && user.premium_source === 'stripe').length,
    completedPaidSessionsWithSubscription: completedSubscriptionIds.length,
    completedPaidSessionsLinkedBySubscriptionToPremiumEntitlement: completedSubscriptionUsers.filter((user) => user.is_premium && user.premium_source === 'stripe').length,
    completedPaidSessionsInCheckoutIntentLedger: completedIntents.length,
    completedPaidSessionsInCompletedCheckoutIntentLedger: completedIntents.filter((intent) => intent.status === 'COMPLETED').length,
  }
}

const report = {
  version: 2,
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
    successfulCreatedAt: successfulCharges.map((charge) => new Date(charge.created * 1000).toISOString()).sort(),
  },
  checkouts: {
    total: sessionPage.data.length,
    complete: sessionPage.data.filter((session) => session.status === 'complete').length,
    paid: sessionPage.data.filter((session) => session.payment_status === 'paid').length,
    byType: countBy(sessionPage.data, (session) => session.metadata?.type),
    byStatus: countBy(sessionPage.data, (session) => session.status),
    completedPaidCreatedAt: completedPaidSessions.map((session) => new Date(session.created * 1000).toISOString()).sort(),
    completedPaidWithUserMetadata: completedSessionUserIds.length,
    completedPaidWithListingMetadata: completedPaidSessions.filter((session) => Boolean(String(session.metadata?.listing_id || '').trim())).length,
    completedPaidPredatingReceiptLedgerMigrationDate: completedPaidSessions.filter((session) => session.created < Date.parse('2026-08-28T00:00:00.000Z') / 1000).length,
    completedPaidPredatingCheckoutIntentLedgerMigrationDate: completedPaidSessions.filter((session) => session.created < Date.parse('2026-08-29T00:00:00.000Z') / 1000).length,
  },
  internalEvidence,
  caveat: 'Stripe gross charges are not net revenue. Historical charges without current metadata are not assigned to a product by inference. Subscription status is provider state at capture time, not proof of future collection.',
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Read-only Stripe commercial audit written to ${outputPath}`)
