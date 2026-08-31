import assert from 'node:assert/strict'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import {
  accountRecoveryCapabilityLifetimeMs,
  signAccountRecoveryCapability,
} from '../src/utils/account-recovery.mjs'

const siteUrl = String(process.env.AEROTRADE_SITE_URL || '').replace(/\/$/, '')
const supabaseUrl = process.env.AEROTRADE_SUPABASE_URL
const serviceKey = process.env.AEROTRADE_SUPABASE_SERVICE_KEY
const resendKey = process.env.AEROTRADE_RESEND_API_KEY
const userId = process.env.AEROTRADE_RECOVERY_USER_ID
assert.ok(siteUrl.startsWith('https://'), 'AEROTRADE_SITE_URL must be HTTPS')
assert.ok(supabaseUrl && serviceKey && resendKey && userId, 'Recovery operator credentials and user ID are required')

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const resend = new Resend(resendKey)
const { data: profile, error: profileError } = await admin.from('users').select('id,email').eq('id', userId).maybeSingle()
if (profileError || !profile?.id || !profile.email) throw profileError || new Error('Recovery account was not found')

const issuedAt = Date.now()
const expiresAt = issuedAt + accountRecoveryCapabilityLifetimeMs
const requestId = `account-password-recovery-${profile.id}-${issuedAt}`
const token = signAccountRecoveryCapability({
  userId: profile.id,
  email: profile.email,
  expiresAt,
  requestId,
  secret: serviceKey,
})
assert.ok(token, 'Replacement recovery capability was not generated')
const params = new URLSearchParams({ id: profile.id, expires: String(expiresAt), request: requestId, token })
const recoveryUrl = `${siteUrl}/account/recovery?${params.toString()}`
const safeRecoveryUrl = recoveryUrl.replaceAll('&', '&amp;')

const attemptStartedAt = new Date().toISOString()
const { data: receipt, error: receiptError } = await admin
  .from('commercial_notification_receipts')
  .insert({
    notification_type: 'account_password_recovery',
    entity_type: 'user',
    entity_id: profile.id,
    recipient_role: 'seller',
    status: 'pending',
    idempotency_key: requestId,
    delivery_attempts: 1,
    attempted_at: attemptStartedAt,
  })
  .select('id')
  .single()
if (receiptError || !receipt?.id) throw receiptError || new Error('Replacement recovery receipt was not created')

const delivery = await resend.emails.send({
  from: 'AeroTrade <noreply@aerotrade.app>',
  to: profile.email,
  subject: 'Recover your AeroTrade account — use this latest email',
  html: `<h2>Recover your AeroTrade account</h2><p>This is the latest recovery email requested for your AeroTrade account. Ignore every earlier recovery message.</p><p><a href="${safeRecoveryUrl}">Choose a new password</a></p><p>The page asks for the new password directly. The link can be used once and expires after 30 minutes.</p><p>If you did not request this, ignore the email.</p>`,
}, { idempotencyKey: requestId })

if (delivery.error || !delivery.data?.id) {
  await admin.from('commercial_notification_receipts').update({
    status: 'failed',
    error_message: 'Provider acceptance was not confirmed.',
  }).eq('id', receipt.id)
  throw delivery.error || new Error('Provider acceptance was not confirmed')
}

const { data: accepted, error: acceptedError } = await admin
  .from('commercial_notification_receipts')
  .update({
    status: 'accepted',
    provider_message_id: delivery.data.id,
    error_message: null,
    accepted_at: attemptStartedAt,
  })
  .eq('id', receipt.id)
  .select('id,status,provider_message_id,consumed_at')
  .single()
if (acceptedError || accepted?.status !== 'accepted' || !accepted.provider_message_id || accepted.consumed_at) {
  throw acceptedError || new Error('Replacement recovery acceptance was not persisted')
}

const invalidatedAt = new Date().toISOString()
const { error: invalidationError } = await admin
  .from('commercial_notification_receipts')
  .update({ consumed_at: invalidatedAt })
  .eq('notification_type', 'account_password_recovery')
  .eq('entity_type', 'user')
  .eq('entity_id', profile.id)
  .neq('id', receipt.id)
  .is('consumed_at', null)
if (invalidationError) throw invalidationError

const { data: current, error: readbackError } = await admin
  .from('commercial_notification_receipts')
  .select('id,status,provider_message_id,consumed_at')
  .eq('id', receipt.id)
  .single()
if (readbackError || current?.status !== 'accepted' || !current.provider_message_id || current.consumed_at) {
  throw readbackError || new Error('Replacement recovery readback failed')
}

console.log(JSON.stringify({
  kind: 'aerotrade_account_recovery_replacement',
  containsPii: false,
  providerAccepted: true,
  receiptReadbackVerified: true,
  previousLinksInvalidated: true,
  currentLinkConsumed: false,
  expiresInMinutes: Math.floor(accountRecoveryCapabilityLifetimeMs / 60_000),
}, null, 2))
