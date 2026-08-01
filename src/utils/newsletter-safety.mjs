export function duplicateNewsletterRunResult(run, periodKey) {
  const failedCount = Number.isFinite(Number(run?.failed_count)) ? Number(run.failed_count) : null
  const success = run?.status === 'sent' && failedCount === 0

  return {
    success,
    skipped: true,
    duplicate: true,
    runId: run?.id || null,
    failedCount,
    message: success
      ? `Newsletter for period ${periodKey} was already sent successfully.`
      : `Newsletter for period ${periodKey} already has a ${run?.status || 'unknown'} run; automatic retry remains blocked.`,
    run: run || null,
  }
}

export function newsletterBatchIdempotencyKey(prefix, chunkIndex) {
  const normalizedPrefix = String(prefix || '').trim()
  const normalizedChunkIndex = Number(chunkIndex)

  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,220}$/.test(normalizedPrefix)) {
    throw new Error('Newsletter idempotency prefix is invalid.')
  }
  if (!Number.isInteger(normalizedChunkIndex) || normalizedChunkIndex < 0) {
    throw new Error('Newsletter chunk index is invalid.')
  }

  const key = `${normalizedPrefix}/chunk-${normalizedChunkIndex + 1}`
  if (key.length > 256) {
    throw new Error('Newsletter idempotency key exceeds the provider limit.')
  }
  return key
}
