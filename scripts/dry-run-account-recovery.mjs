import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  accountRecoveryCapabilityLifetimeMs,
  signAccountRecoveryCapability,
} from '../src/utils/account-recovery.mjs'

const siteUrl = String(process.env.AEROTRADE_SITE_URL || '').replace(/\/$/, '')
const supabaseUrl = process.env.AEROTRADE_SUPABASE_URL
const serviceKey = process.env.AEROTRADE_SUPABASE_SERVICE_KEY
assert.ok(siteUrl.startsWith('https://'), 'AEROTRADE_SITE_URL must be HTTPS')
assert.ok(supabaseUrl && serviceKey, 'Production Supabase credentials are required')

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const nonce = `${Date.now()}-${randomBytes(4).toString('hex')}`
const email = `aerotrade-recovery-dry-run-${nonce}@example.invalid`
const initialPassword = `Initial-${randomBytes(18).toString('base64url')}`
const replacementPassword = `Replacement-${randomBytes(18).toString('base64url')}`
let userId = null
let receiptId = null

const parseActionName = (html) => html.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1] || null

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
  })
  if (createError || !created.user?.id) throw createError || new Error('Dry-run user was not created')
  userId = created.user.id

  const recoveryWindow = Math.floor(Date.now() / (15 * 60 * 1000))
  const requestId = `account-password-recovery-${userId}-${recoveryWindow}`
  const expiresAt = Date.now() + accountRecoveryCapabilityLifetimeMs
  const token = signAccountRecoveryCapability({
    userId,
    email,
    expiresAt,
    requestId,
    secret: serviceKey,
  })
  assert.ok(token, 'Signed dry-run capability was not generated')

  const { data: receipt, error: receiptError } = await admin
    .from('commercial_notification_receipts')
    .insert({
      notification_type: 'account_password_recovery',
      entity_type: 'user',
      entity_id: userId,
      recipient_role: 'seller',
      status: 'accepted',
      idempotency_key: requestId,
      provider_message_id: `dry-run-${nonce}`,
      delivery_attempts: 1,
      attempted_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (receiptError || !receipt?.id) throw receiptError || new Error('Dry-run receipt was not created')
  receiptId = receipt.id

  const params = new URLSearchParams({ id: userId, expires: String(expiresAt), request: requestId, token })
  const recoveryUrl = `${siteUrl}/account/recovery?${params.toString()}`
  const pageResponse = await fetch(recoveryUrl, { redirect: 'manual' })
  const pageHtml = await pageResponse.text()
  assert.equal(pageResponse.status, 200)
  assert.match(pageHtml, /Save new password/)
  const actionName = parseActionName(pageHtml)
  assert.ok(actionName, 'Production recovery form has no Server Action')

  const form = new FormData()
  form.set(actionName, '')
  form.set('id', userId)
  form.set('expires', String(expiresAt))
  form.set('request', requestId)
  form.set('token', token)
  form.set('password', replacementPassword)
  form.set('password_confirmation', replacementPassword)
  const updateResponse = await fetch(recoveryUrl, {
    method: 'POST',
    headers: { origin: siteUrl },
    body: form,
    redirect: 'manual',
  })
  assert.equal(updateResponse.status, 303)
  assert.match(updateResponse.headers.get('location') || '', /^\/login\?message=/)

  const loginClient = createClient(supabaseUrl, process.env.AEROTRADE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: signedIn, error: signInError } = await loginClient.auth.signInWithPassword({ email, password: replacementPassword })
  assert.ifError(signInError)
  assert.equal(signedIn.user?.id, userId)
  await loginClient.auth.signOut()

  const reusedForm = new FormData()
  reusedForm.set(actionName, '')
  reusedForm.set('id', userId)
  reusedForm.set('expires', String(expiresAt))
  reusedForm.set('request', requestId)
  reusedForm.set('token', token)
  reusedForm.set('password', replacementPassword)
  reusedForm.set('password_confirmation', replacementPassword)
  const reusedResponse = await fetch(recoveryUrl, {
    method: 'POST',
    headers: { origin: siteUrl },
    body: reusedForm,
    redirect: 'manual',
  })
  assert.equal(reusedResponse.status, 303)
  assert.match(reusedResponse.headers.get('location') || '', /^\/forgot-password\?error=/)

  const { data: readback, error: readbackError } = await admin
    .from('commercial_notification_receipts')
    .select('status,provider_message_id,consumed_at')
    .eq('id', receiptId)
    .single()
  assert.ifError(readbackError)
  assert.equal(readback.status, 'accepted')
  assert.ok(readback.provider_message_id)
  assert.ok(readback.consumed_at)

  console.log(JSON.stringify({
    kind: 'aerotrade_account_recovery_dry_run',
    containsPii: false,
    productionRouteTested: true,
    passwordChanged: true,
    newPasswordLoginVerified: true,
    replayRejected: true,
    receiptReadbackVerified: true,
    customerEmailSent: false,
    testDataCleanup: 'pending',
  }, null, 2))
} finally {
  if (receiptId) await admin.from('commercial_notification_receipts').delete().eq('id', receiptId)
  if (userId) {
    await admin.from('users').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
  }
  if (userId) {
    const [{ data: authReadback }, { data: profileReadback }, { data: receiptReadback }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from('users').select('id').eq('id', userId).maybeSingle(),
      admin.from('commercial_notification_receipts').select('id').eq('entity_id', userId),
    ])
    assert.equal(authReadback.user, null)
    assert.equal(profileReadback, null)
    assert.deepEqual(receiptReadback, [])
    console.log(JSON.stringify({
      kind: 'aerotrade_account_recovery_dry_run_cleanup',
      containsPii: false,
      authUserRemoved: true,
      profileRemoved: true,
      receiptsRemoved: true,
    }, null, 2))
  }
}
