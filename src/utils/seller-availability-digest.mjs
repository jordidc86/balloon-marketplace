import { createHash } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const sellerAvailabilityDigestChangeCooldownMs = 30 * 86_400_000

export function sellerAvailabilityDigestIdempotencyKey(sellerId, listingCycles) {
  if (!uuidPattern.test(String(sellerId || ''))) throw new Error('Invalid seller identifier')
  if (!Array.isArray(listingCycles) || listingCycles.length === 0 || listingCycles.length > 100) {
    throw new Error('Availability digest requires between 1 and 100 listing cycles')
  }

  const normalizedCycles = listingCycles.map((cycle) => {
    if (!uuidPattern.test(String(cycle?.listingId || ''))) throw new Error('Invalid listing identifier')
    if (cycle.confirmationId !== null && !uuidPattern.test(String(cycle.confirmationId || ''))) {
      throw new Error('Invalid confirmation identifier')
    }
    return `${String(cycle.listingId).toLowerCase()}:${cycle.confirmationId ? String(cycle.confirmationId).toLowerCase() : 'initial'}`
  })
  if (new Set(normalizedCycles).size !== normalizedCycles.length) throw new Error('Duplicate listing cycle')

  const fingerprint = createHash('sha256').update(normalizedCycles.sort().join('|')).digest('hex').slice(0, 32)
  return `seller-availability-digest-${String(sellerId).toLowerCase()}-${fingerprint}`
}

export function changedSellerAvailabilityDigestIsCoolingDown(latestReceipt, currentKey, now = new Date()) {
  if (!latestReceipt || latestReceipt.idempotency_key === currentKey) return false
  const createdAt = new Date(latestReceipt.created_at)
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(now.getTime())) return true
  const ageMs = now.getTime() - createdAt.getTime()
  return ageMs >= 0 && ageMs < sellerAvailabilityDigestChangeCooldownMs
}
