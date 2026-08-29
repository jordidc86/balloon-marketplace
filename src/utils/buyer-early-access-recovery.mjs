export const buyerEarlyAccessRecoveryDelayMs = 24 * 60 * 60 * 1000
const buyerInitiatedSources = new Set(['signup', 'pricing', 'dashboard'])

export function isBuyerEarlyAccessRecoveryCandidate(
  { status, source, isPremium, createdAt },
  now = new Date(),
  delayMs = buyerEarlyAccessRecoveryDelayMs,
) {
  if (status !== 'EXPIRED' || isPremium || !buyerInitiatedSources.has(source)) return false
  const created = new Date(createdAt).getTime()
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(created) && Number.isFinite(current) && current - created >= delayMs
}
