export const commercialDeliveryMaxAttempts = 2
export const commercialDeliveryRetryDelayMs = 6 * 60 * 60 * 1000

export function getCommercialDeliveryDecision(receipt, now = new Date(), maxAttempts = commercialDeliveryMaxAttempts) {
  if (receipt?.status === 'accepted' && receipt?.provider_message_id) return 'duplicate'
  const attempts = Number(receipt?.delivery_attempts || 0)
  if (attempts >= maxAttempts) return 'exhausted'
  const nextAttempt = receipt?.next_attempt_at ? new Date(receipt.next_attempt_at).getTime() : Number.NaN
  if (Number.isFinite(nextAttempt) && nextAttempt > now.getTime()) return 'deferred'
  return 'send'
}

export function getNextCommercialAttemptAt(
  attemptNumber,
  now = new Date(),
  maxAttempts = commercialDeliveryMaxAttempts,
  retryDelayMs = commercialDeliveryRetryDelayMs,
) {
  if (attemptNumber >= maxAttempts) return null
  return new Date(now.getTime() + retryDelayMs).toISOString()
}
