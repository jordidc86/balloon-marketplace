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
