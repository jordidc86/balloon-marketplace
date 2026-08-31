#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 only for an approved read-only production audit.')
}

const origin = String(process.env.AEROTRADE_PRODUCTION_URL || 'https://aerotrade.app').replace(/\/+$/, '')
const cronSecret = process.env.CRON_SECRET
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!cronSecret || !supabaseUrl || !serviceRoleKey) throw new Error('Production automation audit configuration is incomplete.')

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const stateSpecs = {
  listings: ['listings', 'id,status,public_at,updated_at'],
  listingQuality: ['listing_quality_state', 'listing_id,status,consecutive_failures,last_checked_at,notification_status'],
  commercialNotifications: ['commercial_notification_receipts', 'id,status,delivery_attempts,next_attempt_at,attempted_at,accepted_at'],
  indexingReceipts: ['indexing_submission_receipts', 'id,status,attempts,attempted_at,accepted_at'],
  listingWatchDispatches: ['listing_watch_dispatches', 'id,status,attempted_at,accepted_at,updated_at'],
  wantedMatchDispatches: ['wanted_match_dispatches', 'id,status,attempted_at,accepted_at,updated_at'],
  newsletterRuns: ['newsletter_runs', 'id,status,started_at,completed_at,provider_dispatch_started_at'],
  newsletterRecipients: ['newsletter_recipients', 'run_id,status,resend_id'],
  socialPublicationReceipts: ['social_publication_receipts', 'id,status,attempt_count,claimed_at,next_attempt_at,accepted_at,updated_at'],
}

async function captureState() {
  return Object.fromEntries(await Promise.all(Object.entries(stateSpecs).map(async ([name, [table, columns]]) => {
    const { data, error } = await supabase.from(table).select(columns).order(columns.split(',')[0])
    if (error) throw new Error(`Could not fingerprint ${name}.`)
    return [name, { rows: data?.length || 0, fingerprint: fingerprint(data || []) }]
  })))
}

const endpointSpecs = [
  ['catalogQuality', '/api/cron/catalog-quality?commit=0'],
  ['indexing', '/api/cron/indexing?commit=0'],
  ['listingWatch', '/api/cron/listing-watch?commit=0'],
  ['newsletterConsentInvitation', '/api/cron/newsletter-consent-invitation?commit=0'],
  ['opportunityFollowup', '/api/cron/opportunity-followup?commit=0'],
  ['social', '/api/cron/social?dryRun=1&limit=1'],
  ['wantedMatch', '/api/cron/wanted-match?commit=0'],
]

const safeCounterKeys = new Set([
  'activeWatchers', 'actionable', 'accepted', 'alreadyAccepted', 'cancelled', 'changed', 'checked',
  'committed', 'configurationBlocked', 'dryRun', 'due', 'eligibleCount', 'failed', 'failedCount',
  'healthy', 'inconclusive', 'notificationsAccepted', 'notificationsFailed', 'pendingRecovery',
  'primaryImagesRepaired', 'quarantined', 'resolved', 'sentCount', 'skipped', 'suspected', 'urlCount',
])

const safeCounters = (body) => Object.fromEntries(Object.entries(body && typeof body === 'object' ? body : {})
  .filter(([key, value]) => safeCounterKeys.has(key) && ['boolean', 'number'].includes(typeof value)))

async function callDryRun([name, route]) {
  let response
  let text
  try {
    response = await fetch(`${origin}${route}`, {
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(45_000),
    })
    text = await response.text()
  } catch {
    return [name, { ok: false, status: null, classification: 'network_or_timeout', responseFingerprint: null, responseBytes: 0, counters: {} }]
  }

  let body = null
  try { body = JSON.parse(text) } catch { body = null }
  const classification = response.ok
    ? 'ok'
    : response.status === 401 || response.status === 403
      ? 'authentication_error'
      : response.status >= 500
        ? 'server_error'
        : 'request_error'
  return [name, {
    ok: response.ok,
    status: response.status,
    classification,
    responseFingerprint: fingerprint(text),
    responseBytes: Buffer.byteLength(text),
    counters: safeCounters(body),
  }]
}

const before = await captureState()
const endpoints = Object.fromEntries(await Promise.all(endpointSpecs.map(callDryRun)))
const after = await captureState()
const stateChanges = Object.fromEntries(Object.keys(before).map((name) => [name, {
  rowsBefore: before[name].rows,
  rowsAfter: after[name].rows,
  changed: before[name].fingerprint !== after[name].fingerprint,
}]))
const changedDatasets = Object.entries(stateChanges).filter(([, state]) => state.changed).map(([name]) => name)

const result = {
  schemaVersion: 1,
  kind: 'aerotrade_production_automation_dry_run_audit',
  capturedAt: new Date().toISOString(),
  containsPii: false,
  readOnlyRequested: true,
  productionMutated: changedDatasets.length > 0,
  externalMessagesSent: 0,
  endpoints,
  newsletter: {
    executed: false,
    reason: 'The deployed newsletter dry-run persists audit rows. The release candidate removes that mutation; live simulation waits for the explicit consolidated release.',
  },
  stateChanges,
  changedDatasets,
}

const output = path.resolve(process.argv[2] || 'reviews/production-automation-dry-run.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
const temporary = `${output}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
fs.renameSync(temporary, output)
console.log(JSON.stringify({
  output,
  endpointsOk: Object.values(endpoints).filter((endpoint) => endpoint.ok).length,
  endpointsTotal: Object.keys(endpoints).length,
  productionMutated: result.productionMutated,
  changedDatasets,
}, null, 2))

if (result.productionMutated) process.exitCode = 2
