#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 only after explicit approval for a read-only production baseline.')
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const since = new Date(Date.now() - 30 * 86_400_000).toISOString()

async function exactCount(table, configure = (query) => query) {
  const { count, error } = await configure(supabase.from(table).select('*', { count: 'exact', head: true }))
  if (error) throw new Error(`${table}: ${error.message}`)
  return Number(count || 0)
}

const [users, premiumUsers, stripePremiumUsers, adminPremiumUsers, legacyPremiumUsers, activeListings, views30d, contactReveals30d, quoteRequests30d, wonQuoteRequests] = await Promise.all([
  exactCount('users'),
  exactCount('users', (query) => query.eq('is_premium', true)),
  exactCount('users', (query) => query.eq('is_premium', true).eq('premium_source', 'stripe')),
  exactCount('users', (query) => query.eq('is_premium', true).eq('premium_source', 'admin')),
  exactCount('users', (query) => query.eq('is_premium', true).eq('premium_source', 'legacy')),
  exactCount('listings', (query) => query.in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])),
  exactCount('listing_events', (query) => query.eq('event_type', 'VIEW').gte('created_at', since)),
  exactCount('listing_events', (query) => query.eq('event_type', 'CONTACT_REVEAL').gte('created_at', since)),
  exactCount('quote_requests', (query) => query.gte('created_at', since)),
  exactCount('quote_requests', (query) => query.eq('status', 'WON')),
])

const payload = {
  version: 1,
  projectId: 'aerotrade',
  readOnly: true,
  capturedAt: new Date().toISOString(),
  period: { rollingDays: 30, since },
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
  },
  integrity: {
    queryProfile: crypto.createHash('sha256').update('aerotrade-commercial-baseline-v1-read-only').digest('hex'),
  },
}

const output = path.resolve(process.argv[2] || 'reviews/commercial-baseline.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
const temporary = `${output}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
fs.renameSync(temporary, output)
console.log(`Read-only commercial baseline written to ${output}`)
