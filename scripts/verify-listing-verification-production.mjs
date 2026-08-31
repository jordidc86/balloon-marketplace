#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 for this read-only production verification.')
}

const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://aerotrade.app').replace(/\/$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const cronSecret = process.env.CRON_SECRET
if (!supabaseUrl || !serviceKey || !cronSecret) throw new Error('Missing production verification configuration.')

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const [privacyResponse, dryRunResponse, verificationResult, instructionReceiptResult] = await Promise.all([
  fetch(`${baseUrl}/privacy`, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(15_000) }),
  fetch(`${baseUrl}/api/cron/opportunity-followup`, {
    headers: { Authorization: `Bearer ${cronSecret}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  }),
  supabase.from('listing_verifications').select('status'),
  supabase
    .from('commercial_notification_receipts')
    .select('status')
    .eq('notification_type', 'listing_verification_evidence_instructions'),
])

if (!privacyResponse.ok) throw new Error(`Privacy route returned ${privacyResponse.status}.`)
if (!dryRunResponse.ok) throw new Error(`Opportunity dry-run returned ${dryRunResponse.status}.`)
if (verificationResult.error) throw new Error(`Verification states could not be read: ${verificationResult.error.message}`)
if (instructionReceiptResult.error) throw new Error(`Instruction receipts could not be read: ${instructionReceiptResult.error.message}`)

const privacy = await privacyResponse.text()
const dryRun = await dryRunResponse.json()
if (dryRun.dryRun !== true || typeof dryRun.dueListingVerificationInstructionRetries !== 'number') {
  throw new Error('Opportunity follow-up does not expose the verification-instruction dry-run contract.')
}

const countByStatus = (rows) => (rows || []).reduce((counts, row) => {
  counts[row.status] = (counts[row.status] || 0) + 1
  return counts
}, {})

console.log(JSON.stringify({
  schemaVersion: 1,
  kind: 'aerotrade_listing_verification_handoff_production_check',
  capturedAt: new Date().toISOString(),
  containsPii: false,
  runtime: {
    privacyStatus: privacyResponse.status,
    privacyExplainsReplyEnabledHandoff: privacy.includes('transactional, reply-enabled checklist'),
    privacyConfirmsNoDocumentCopiesInMarketplaceDatabase: privacy.includes('does not upload or retain copies'),
    opportunityDryRunStatus: dryRunResponse.status,
    opportunityDryRun: dryRun.dryRun,
    dueInstructionRetries: dryRun.dueListingVerificationInstructionRetries,
  },
  database: {
    verificationStates: countByStatus(verificationResult.data),
    instructionReceipts: countByStatus(instructionReceiptResult.data),
  },
  mutationsPerformed: 0,
  outboundMessagesSent: 0,
}, null, 2))
