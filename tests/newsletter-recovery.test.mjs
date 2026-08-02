import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNewsletterRecoveryPlan,
  classifyNewsletterFailure,
  parseNewsletterRecoveryRequest,
  shouldReconcileStaleRecoveries,
} from '../src/utils/newsletter-recovery.mjs'

const run = {
  id: '58c750e5-d1c0-43bd-a05d-6608d20e79ee',
  status: 'partial',
  dry_run: false,
  test_email: null,
  sent_count: 2,
  failed_count: 1,
  subject: 'Newsletter',
  html_body: '<p>Original body</p>',
  content_sha256: 'a'.repeat(64),
}

const recipients = [
  { email: 'accepted-1@example.test', status: 'sent', resend_id: 'provider-1' },
  { email: 'failed@example.test', status: 'failed', error_message: 'Recipient rejected' },
  { email: 'accepted-2@example.test', status: 'sent', resend_id: 'provider-2' },
]

test('live newsletter recovery requires exact explicit confirmation', () => {
  const invalid = parseNewsletterRecoveryRequest({
    runId: run.id,
    expectedFailedCount: 1,
    dryRun: false,
    reason: 'Controlled recovery',
  })
  assert.equal(invalid.ok, false)
  assert.match(invalid.errors.join(' '), /recover_failed_only/)

  const valid = parseNewsletterRecoveryRequest({
    runId: run.id,
    expectedFailedCount: 1,
    dryRun: false,
    reason: 'Controlled recovery',
    confirmation: 'recover_failed_only',
    expectedContentSha256: 'a'.repeat(64),
  })
  assert.equal(valid.ok, true)
})

test('dry-run recovery never authorizes stale-state reconciliation', () => {
  assert.equal(shouldReconcileStaleRecoveries(true), false)
  assert.equal(shouldReconcileStaleRecoveries(false), true)
  assert.equal(shouldReconcileStaleRecoveries(undefined), false)
})

test('recovery targets only failed recipients and reconciles the original ledger', () => {
  const request = parseNewsletterRecoveryRequest({
    runId: run.id,
    expectedFailedCount: 1,
    reason: 'Dry-run inspection',
  }).request
  const plan = buildNewsletterRecoveryPlan(run, recipients, request)

  assert.equal(plan.ok, true)
  assert.deepEqual(plan.failedRecipients, [{
    email: 'failed@example.test',
    error: 'Recipient rejected',
  }])
  assert.equal(plan.summary.originallySent, 2)
  assert.equal(plan.summary.targetFailedCount, 1)
  assert.deepEqual(plan.summary.failureCategories, { recipient: 1 })
})

test('live recovery is bound to a production run and the exact verified content', () => {
  const request = parseNewsletterRecoveryRequest({
    runId: run.id,
    expectedFailedCount: 1,
    expectedContentSha256: run.content_sha256,
    dryRun: false,
    reason: 'Approved failed-only recovery',
    confirmation: 'recover_failed_only',
  }).request

  assert.equal(buildNewsletterRecoveryPlan(run, recipients, request).ok, true)
  assert.equal(buildNewsletterRecoveryPlan(
    { ...run, dry_run: true },
    recipients,
    request,
  ).ok, false)
  assert.equal(buildNewsletterRecoveryPlan(
    { ...run, test_email: 'test@example.test' },
    recipients,
    request,
  ).ok, false)
  assert.equal(buildNewsletterRecoveryPlan(
    run,
    recipients,
    { ...request, expectedContentSha256: 'b'.repeat(64) },
  ).ok, false)
})

test('recovery fails closed on ledger drift, missing snapshots or existing live attempts', () => {
  const request = { expectedFailedCount: 1 }

  assert.equal(buildNewsletterRecoveryPlan(
    { ...run, html_body: null },
    recipients,
    request,
  ).ok, false)
  assert.equal(buildNewsletterRecoveryPlan(
    run,
    recipients.slice(0, 2),
    request,
  ).ok, false)
  assert.equal(buildNewsletterRecoveryPlan(
    run,
    recipients,
    request,
    { status: 'sent' },
  ).ok, false)
  assert.equal(buildNewsletterRecoveryPlan(
    run,
    recipients,
    request,
    { status: 'audit_uncertain' },
  ).ok, false)
})

test('provider failure categories remain aggregate and contain no recipient data', () => {
  assert.equal(classifyNewsletterFailure('Mailbox suppressed after complaint'), 'suppression')
  assert.equal(classifyNewsletterFailure('Temporary gateway timeout'), 'transient')
  assert.equal(classifyNewsletterFailure('Unexpected provider response'), 'unknown')
})
