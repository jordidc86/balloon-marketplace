const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sha256Pattern = /^[0-9a-f]{64}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const activeRecoveryStatuses = new Set(['running', 'sent', 'partial', 'failed', 'audit_uncertain'])

const text = value => typeof value === 'string' ? value.trim() : ''

export function shouldReconcileStaleRecoveries(dryRun) {
  return dryRun === false
}

export function parseNewsletterRecoveryRequest(value) {
  const candidate = value && typeof value === 'object' ? value : {}
  const request = {
    runId: text(candidate.runId),
    expectedFailedCount: Number(candidate.expectedFailedCount),
    dryRun: candidate.dryRun !== false,
    reason: text(candidate.reason),
    confirmation: text(candidate.confirmation),
  }
  const errors = []

  if (!uuidPattern.test(request.runId)) errors.push('runId must be a UUID.')
  if (!Number.isInteger(request.expectedFailedCount) || request.expectedFailedCount < 1 || request.expectedFailedCount > 100) {
    errors.push('expectedFailedCount must be an integer between 1 and 100.')
  }
  if (!request.reason || request.reason.length > 500) {
    errors.push('reason is required and must be 500 characters or fewer.')
  }
  if (!request.dryRun && request.confirmation !== 'recover_failed_only') {
    errors.push('Live recovery requires confirmation=recover_failed_only.')
  }

  return { ok: errors.length === 0, errors, request }
}

export function classifyNewsletterFailure(message) {
  const normalized = text(message).toLowerCase()

  if (/suppress|bounce|complaint|unsubscribe|blocked/.test(normalized)) return 'suppression'
  if (/invalid|malformed|recipient|mailbox|domain|address/.test(normalized)) return 'recipient'
  if (/rate|quota|too many/.test(normalized)) return 'rate_limit'
  if (/auth|api key|permission|forbidden/.test(normalized)) return 'authentication'
  if (/timeout|temporar|network|unavailable|gateway|connection/.test(normalized)) return 'transient'
  return 'unknown'
}

/**
 * @param {any} run
 * @param {any[]} recipientRows
 * @param {any} request
 * @param {any} [existingRecovery]
 */
export function buildNewsletterRecoveryPlan(run, recipientRows, request, existingRecovery = null) {
  const errors = []
  const recipients = Array.isArray(recipientRows) ? recipientRows : []
  const failedRows = recipients.filter(row => row?.status === 'failed')
  const sentRows = recipients.filter(row => row?.status === 'sent')
  const normalizedFailed = failedRows.map(row => ({
    email: text(row?.email).toLowerCase(),
    error: text(row?.error_message),
  }))
  const uniqueFailedEmails = new Set(normalizedFailed.map(row => row.email))

  if (!run || run.status !== 'partial') errors.push('Only a partial newsletter run can be recovered.')
  if (Number(run?.failed_count) !== request.expectedFailedCount) {
    errors.push('The current failed count does not match expectedFailedCount.')
  }
  if (failedRows.length !== Number(run?.failed_count)) {
    errors.push('Recipient evidence does not reconcile with the run failed count.')
  }
  if (sentRows.length !== Number(run?.sent_count)) {
    errors.push('Recipient evidence does not reconcile with the run sent count.')
  }
  if (normalizedFailed.some(row => !emailPattern.test(row.email))) {
    errors.push('A failed-recipient row contains an invalid email address.')
  }
  if (uniqueFailedEmails.size !== normalizedFailed.length) {
    errors.push('Failed-recipient rows contain duplicate email addresses.')
  }
  if (!text(run?.subject) || !text(run?.html_body) || !sha256Pattern.test(text(run?.content_sha256))) {
    errors.push('The original newsletter has no complete content snapshot; recovery is blocked.')
  }
  if (existingRecovery && activeRecoveryStatuses.has(existingRecovery.status)) {
    errors.push(`A ${existingRecovery.status} live recovery already exists for this run.`)
  }

  const failureCategories = normalizedFailed.reduce((counts, row) => {
    const category = classifyNewsletterFailure(row.error)
    counts[category] = (counts[category] || 0) + 1
    return counts
  }, {})

  return {
    ok: errors.length === 0,
    errors,
    failedRecipients: normalizedFailed,
    summary: {
      originalRunId: run?.id || null,
      originalStatus: run?.status || null,
      originallySent: Number(run?.sent_count || 0),
      targetFailedCount: normalizedFailed.length,
      contentSha256: text(run?.content_sha256) || null,
      failureCategories,
    },
  }
}
