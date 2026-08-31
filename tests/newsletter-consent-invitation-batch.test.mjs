import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  newsletterConsentInvitationBatchKey,
  normalizeNewsletterConsentInvitationIds,
} from '../src/utils/newsletter-consent-invitation.mjs'

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
]

test('consent invitation batch keys are exact, normalized and order independent', () => {
  assert.deepEqual(normalizeNewsletterConsentInvitationIds([ids[1], ids[0], ids[1]]), ids)
  assert.equal(newsletterConsentInvitationBatchKey(ids), newsletterConsentInvitationBatchKey([...ids].reverse()))
  assert.notEqual(newsletterConsentInvitationBatchKey(ids), newsletterConsentInvitationBatchKey([ids[0]]))
  assert.equal(newsletterConsentInvitationBatchKey([]), null)
  assert.equal(newsletterConsentInvitationBatchKey(['not-an-id']), null)
})

test('blanket live consent delivery is disabled and exact admin approval is required', async () => {
  const [route, actions, migration] = await Promise.all([
    readFile(new URL('../src/app/api/cron/newsletter-consent-invitation/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/admin/actions.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20260831740000_newsletter_consent_invitation_exclusions.sql', import.meta.url), 'utf8'),
  ])
  assert.match(route, /blanket cron delivery is disabled/)
  assert.doesNotMatch(route, /sendCommercialReceiptEmail/)
  assert.match(route, /alreadyInvitedCount/)
  assert.match(route, /newsletter_consent_invitation_exclusions/)
  assert.match(actions, /newsletter_consent_batch_authorization/)
  assert.match(actions, /The reviewed consent batch changed\. No email was sent/)
  assert.match(actions, /Provider acceptance readback failed/)
  assert.match(migration, /reason in \('NON_CUSTOMER', 'TEST_ACCOUNT', 'OPERATOR_EXCLUDED'\)/)
  assert.match(migration, /enable row level security/)
})

