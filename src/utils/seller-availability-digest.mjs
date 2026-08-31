import { createHash } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digestKeyPattern = /^seller-availability-digest-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[0-9a-f]{32}(?:-[0-9]{8})?$/i
export const sellerAvailabilityDigestChangeCooldownMs = 30 * 86_400_000
export const sellerAvailabilityDigestRequestLifetimeMs = 14 * 86_400_000

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

export function sellerAvailabilityDigestInventoryKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!digestKeyPattern.test(key)) return null
  return key.replace(/-[0-9]{8}$/, '')
}

export function sellerAvailabilityDigestRequestKey(baseKey, latestReceipt, now = new Date()) {
  const inventoryKey = sellerAvailabilityDigestInventoryKey(baseKey)
  if (!inventoryKey || inventoryKey !== baseKey.toLowerCase()) throw new Error('Invalid availability digest base key')
  if (!latestReceipt) return inventoryKey

  const latestInventoryKey = sellerAvailabilityDigestInventoryKey(latestReceipt.idempotency_key)
  if (latestInventoryKey !== inventoryKey) return inventoryKey
  if (latestReceipt.status !== 'accepted') return latestReceipt.idempotency_key

  const acceptedAt = new Date(latestReceipt.accepted_at)
  const current = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(acceptedAt.getTime()) || !Number.isFinite(current.getTime())) return latestReceipt.idempotency_key
  if (current.getTime() - acceptedAt.getTime() < sellerAvailabilityDigestRequestLifetimeMs) return latestReceipt.idempotency_key
  const cycleDate = current.toISOString().slice(0, 10).replaceAll('-', '')
  return `${inventoryKey}-${cycleDate}`
}

export function changedSellerAvailabilityDigestIsCoolingDown(latestReceipt, currentKey, now = new Date()) {
  if (!latestReceipt) return false
  const latestInventoryKey = sellerAvailabilityDigestInventoryKey(latestReceipt.idempotency_key)
  const currentInventoryKey = sellerAvailabilityDigestInventoryKey(currentKey)
  if (latestInventoryKey && currentInventoryKey && latestInventoryKey === currentInventoryKey) return false
  if (latestReceipt.idempotency_key === currentKey) return false
  const createdAt = new Date(latestReceipt.created_at)
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(now.getTime())) return true
  const ageMs = now.getTime() - createdAt.getTime()
  return ageMs >= 0 && ageMs < sellerAvailabilityDigestChangeCooldownMs
}

/**
 * @param {{
 *   hasContact?: boolean,
 *   currentKey?: string,
 *   latestReceipt?: {idempotency_key?: string, status?: string, accepted_at?: string | null, created_at?: string | null, next_attempt_at?: string | null} | null,
 *   now?: Date
 * }} input
 */
export function sellerAvailabilityDigestReadiness({ hasContact, currentKey, latestReceipt, now = new Date() } = {}) {
  const current = now instanceof Date ? now : new Date(now)
  const currentInventoryKey = sellerAvailabilityDigestInventoryKey(currentKey)
  if (!hasContact) return { status: 'missing_contact', actionable: false }
  if (!currentInventoryKey || !Number.isFinite(current.getTime())) return { status: 'invalid_inventory', actionable: false }
  if (!latestReceipt) return { status: 'ready_new', actionable: true }

  if (changedSellerAvailabilityDigestIsCoolingDown(latestReceipt, currentInventoryKey, current)) {
    return { status: 'cooling_down', actionable: false }
  }

  const sameInventory = sellerAvailabilityDigestInventoryKey(latestReceipt.idempotency_key) === currentInventoryKey
  if (sameInventory && latestReceipt.status === 'accepted') {
    if (!latestReceipt.accepted_at) return { status: 'invalid_receipt', actionable: false }
    const acceptedAt = new Date(latestReceipt.accepted_at)
    if (!Number.isFinite(acceptedAt.getTime())) return { status: 'invalid_receipt', actionable: false }
    const ageMs = current.getTime() - acceptedAt.getTime()
    if (ageMs >= 0 && ageMs < sellerAvailabilityDigestRequestLifetimeMs) {
      return { status: 'current', actionable: false }
    }
    return { status: 'ready_reissue', actionable: true }
  }

  const retryAt = latestReceipt.next_attempt_at ? new Date(latestReceipt.next_attempt_at) : null
  if (sameInventory && retryAt && Number.isFinite(retryAt.getTime()) && retryAt.getTime() > current.getTime()) {
    return { status: 'retry_pending', actionable: false }
  }

  return { status: sameInventory ? 'ready_retry' : 'ready_new', actionable: true }
}
