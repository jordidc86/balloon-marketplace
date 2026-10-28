// One-off, explicitly approved preference invitations. Never scheduled.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { sendCommercialReceiptEmail } from '../src/utils/commercial-notification'
import { selectNewsletterRenewalRecipients, buildNewsletterRenewal } from '../src/utils/newsletter-renewal.mjs'

async function main() {
  const [mode, output] = process.argv.slice(2)
  assert.ok(['--plan', '--apply'].includes(mode) && output && process.argv.length === 4)
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://vqdpveyshgvdhbsgskns.supabase.co')
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  async function rows(table: string, select: string) {
    const all: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let offset = 0; offset < 10000; offset += 500) {
      const { data, error } = await db.from(table).select(select).order(table === 'newsletter_consent_invitation_exclusions' ? 'user_id' : 'id').range(offset, offset + 499)
      if (error) throw new Error(`Cannot read ${table}`)
      all.push(...data)
      if (data.length < 500) return all
    }
    throw new Error('Incomplete pagination')
  }
  async function eligible() {
    const [users, publicSubscriptions, exclusions] = await Promise.all([
      rows('users', 'id,email,role,newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at'),
      rows('newsletter_public_subscriptions', 'id,email,status,confirmed_at,unsubscribed_at'),
      rows('newsletter_consent_invitation_exclusions', 'user_id'),
    ])
    return selectNewsletterRenewalRecipients({ users, publicSubscriptions, exclusions })
  }
  const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
  if (mode === '--plan') {
    const plan = { campaign: '2026-10-28', expiresAt: Date.now() + 30 * 86400000, recipients: await eligible() }
    assert.ok(plan.recipients.length > 0 && plan.recipients.length <= 100)
    fs.writeFileSync(output, JSON.stringify({ ...plan, fingerprint: digest(plan) }, null, 2), { mode: 0o600, flag: 'wx' })
    console.log(JSON.stringify({ mode, count: plan.recipients.length, fingerprint: digest(plan), emailsSent: 0 }))
    return
  }
  const { fingerprint, ...plan } = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.equal(digest(plan), fingerprint)
  assert.equal(process.env.CONFIRM_AEROTRADE_CONSENT_BATCH, fingerprint)
  assert.equal(plan.campaign, '2026-10-28')
  assert.ok(plan.expiresAt > Date.now() && plan.expiresAt <= Date.now() + 30 * 86400000)
  assert.ok(process.env.RESEND_API_KEY)
  assert.match(process.env.EXPECTED_DEPLOY_COMMIT || '', /^[a-f0-9]{40}$/)
  const site = JSON.parse(execFileSync('netlify', ['api', 'getSite', '--data', JSON.stringify({ site_id: '6ad581ff-91c2-4c73-b091-43d9ff7a480b' })], { encoding: 'utf8' }))
  assert.equal(site.published_deploy?.commit_ref, process.env.EXPECTED_DEPLOY_COMMIT)
  const receiptPath = output + '.results.json'
  const results: { id: string; status: string; providerMessageId?: string }[] = []
  const persist = () => fs.writeFileSync(receiptPath, JSON.stringify({ campaign: plan.campaign, fingerprint, results }, null, 2), { mode: 0o600 })
  for (const target of plan.recipients) {
    if (!(await eligible()).some(x => x.id === target.id && x.email === target.email)) {
      results.push({ id: target.id, status: 'skipped_preference_changed' }); persist(); continue
    }
    const message = buildNewsletterRenewal({ ...target, campaign: plan.campaign, expiresAt: plan.expiresAt, secret: process.env.SUPABASE_SERVICE_ROLE_KEY })
    // Reuse persisted claims and provider idempotency; uncertain sends are never retried here.
    const delivery = await sendCommercialReceiptEmail(db, { notificationType: 'newsletter_consent_invitation', entityType: 'user', entityId: target.id, recipientRole: 'buyer', to: target.email, ...message })
    if (!delivery.success || !delivery.providerMessageId) {
      results.push({ id: target.id, status: 'stopped_unconfirmed' }); persist(); throw new Error('Delivery not confirmed; inspect before retrying')
    }
    const { data, error } = await db.from('commercial_notification_receipts').select('status,provider_message_id').eq('idempotency_key', message.idempotencyKey).single()
    assert.ok(!error && data?.status === 'accepted' && data.provider_message_id === delivery.providerMessageId)
    results.push({ id: target.id, status: delivery.duplicate ? 'already_accepted' : 'accepted', providerMessageId: delivery.providerMessageId }); persist()
    await new Promise(resolve => setTimeout(resolve, 700))
  }
  console.log(JSON.stringify({ mode, planned: plan.recipients.length, accepted: results.filter(x => x.status === 'accepted').length, alreadyAccepted: results.filter(x => x.status === 'already_accepted').length, skipped: results.filter(x => x.status.startsWith('skipped')).length, subscriptionsActivated: 0 }))
}
main().catch(() => { console.error('Consent renewal stopped. Inspect the private plan and receipt evidence before retrying.'); process.exitCode = 1 })
