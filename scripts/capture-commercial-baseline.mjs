#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readAllRows, readMatchingRows, readOnlyFetch } from './lib/read-only-audit.mjs'
import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 only after explicit approval for a read-only production baseline.')
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: readOnlyFetch } })
const capturedAt = new Date()
const until = capturedAt.toISOString()
const since = new Date(capturedAt.getTime() - 30 * 86_400_000).toISOString()

async function exactCount(table, configure = (query) => query) {
  const { count, error } = await configure(supabase.from(table).select('*', { count: 'exact', head: true }))
  if (error) throw new Error(`${table}: ${error.message}`)
  if (!Number.isSafeInteger(count)) throw new Error(`${table}: exact count unavailable`)
  return count
}


const [users, premiumUsers, stripePremiumUsers, adminPremiumUsers, legacyPremiumUsers, activeListings, views30d, contactReveals30d, quoteRequests30d, wonQuoteRequests, chargeEvents30d] = await Promise.all([
  exactCount('users'),
  exactCount('users', (query) => query.eq('is_premium', true)),
  exactCount('users', (query) => query.eq('is_premium', true).eq('premium_source', 'stripe')),
  exactCount('users', (query) => query.eq('is_premium', true).eq('premium_source', 'admin')),
  exactCount('users', (query) => query.eq('is_premium', true).eq('premium_source', 'legacy')),
  exactCount('listings', (query) => query.in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])),
  exactCount('listing_events', (query) => query.eq('event_type', 'VIEW').gte('created_at', since).lt('created_at', until)),
  exactCount('listing_events', (query) => query.eq('event_type', 'CONTACT_REVEAL').gte('created_at', since).lt('created_at', until)),
  exactCount('quote_requests', (query) => query.gte('created_at', since).lt('created_at', until)),
  exactCount('quote_requests', (query) => query.eq('status', 'WON')),
  readAllRows(() => supabase.from('stripe_webhook_events').select('event_id,stripe_created_at', { count: 'exact' }).eq('event_type', 'charge.succeeded').gte('stripe_created_at', since).lt('stripe_created_at', until).order('event_id')),
])

const succeededCharges30d = chargeEvents30d.length
const paymentReceipts30d = await readMatchingRows(supabase, 'payment_notification_receipts', 'charge_id,stripe_event_id,amount_minor,currency,payment_type,livemode,accepted_at', 'stripe_event_id', chargeEvents30d.map((event) => event.event_id), 'charge_id')
const coveredEventIds = new Set(paymentReceipts30d.filter((receipt) => receipt.accepted_at).map((receipt) => receipt.stripe_event_id))
const unmatchedEvents = chargeEvents30d.filter((event) => !coveredEventIds.has(event.event_id)).length

const livePaymentReceipts30d = paymentReceipts30d.filter((receipt) => receipt.livemode === true)
const testPaymentReceipts30d = paymentReceipts30d.filter((receipt) => receipt.livemode !== true)
const grossAcceptedByCurrency = livePaymentReceipts30d.reduce((totals, receipt) => {
  const currency = String(receipt.currency || '').toLowerCase()
  totals[currency] = (totals[currency] || 0) + Number(receipt.amount_minor || 0)
  return totals
}, {})
const receiptsByType = paymentReceipts30d.reduce((totals, receipt) => {
  const type = String(receipt.payment_type || 'other')
  totals[type] = (totals[type] || 0) + 1
  return totals
}, {})

const payload = {
  version: 1,
  projectId: 'aerotrade',
  readOnly: true,
  capturedAt: until,
  period: { rollingDays: 30, since, until },
  stages: {
    acquisition: {
      status: 'verified',
      label: 'Intención observada en 30 días',
      metrics: [
        { name: 'vistas de anuncio', value: views30d },
        { name: 'usuarios registrados totales', value: users },
      ],
      caveat: 'Las vistas no son usuarios únicos ni demuestran intención de compra.',
    },
    activation: {
      status: 'verified',
      label: 'Oferta y adopción disponibles',
      metrics: [
        { name: 'anuncios activos', value: activeListings },
        { name: 'usuarios premium', value: premiumUsers },
        { name: 'premium gestionado por Stripe', value: stripePremiumUsers },
        { name: 'premium concedido por administración', value: adminPremiumUsers },
        { name: 'premium legado', value: legacyPremiumUsers },
      ],
      caveat: 'Premium puede proceder de Stripe, administración o legado; este conteo no equivale a ingresos cobrados.',
    },
    conversion: {
      status: 'verified',
      label: 'Acciones comerciales observadas',
      metrics: [
        { name: 'contactos revelados en 30 días', value: contactReveals30d },
        { name: 'solicitudes de presupuesto en 30 días', value: quoteRequests30d },
        { name: 'presupuestos ganados históricos', value: wonQuoteRequests },
      ],
      caveat: 'Un contacto revelado o una solicitud no demuestra una venta; WON depende del registro manual del estado.',
    },
    revenue: {
      status: unmatchedEvents ? 'attention_required' : 'unverified',
      reconciliationBasis: 'stripe_event_id; charge-level verification requires audit:stripe-commercial',
      paginationComplete: true,
      label: 'Cobros aceptados y notificación verificable en 30 días',
      metrics: [
        { name: 'eventos charge.succeeded', value: succeededCharges30d },
        { name: 'recibos de notificación persistidos', value: paymentReceipts30d.length },
        { name: 'recibos live', value: livePaymentReceipts30d.length },
        { name: 'recibos test', value: testPaymentReceipts30d.length },
        { name: 'cobertura pendiente', value: unmatchedEvents },
        { name: 'importe bruto live por moneda (minor units)', value: grossAcceptedByCurrency },
        { name: 'recibos por tipo', value: receiptsByType },
      ],
      caveat: 'Los recibos se relacionan por stripe_event_id con eventos del mismo periodo, incluso si la notificación llegó después. El registro de eventos no conserva charge_id ni modo; esta observación no verifica cobertura por cargo. Importe bruto notificado: no descuenta comisiones, reembolsos, disputas ni impuestos y no debe interpretarse como ingreso neto.',
    },
  },
  integrity: {
    queryProfile: crypto.createHash('sha256').update('aerotrade-commercial-baseline-v3-read-only-event-window').digest('hex'),
  },
}

const output = path.resolve(process.argv[2] || 'reviews/commercial-baseline.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
const temporary = `${output}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
fs.renameSync(temporary, output)
console.log(`Read-only commercial baseline written to ${output}`)
