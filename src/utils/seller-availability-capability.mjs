import { createHmac, timingSafeEqual } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const digestKeyPattern = /^seller-availability-digest-[0-9a-f-]{36}-[0-9a-f]{32}$/i
export const sellerAvailabilityCapabilityLifetimeMs = 14 * 24 * 60 * 60 * 1000
const maximumFutureLifetimeMs = 15 * 24 * 60 * 60 * 1000

const normalizedEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export function signSellerAvailabilityCapability({ sellerId, sellerEmail, digestKey, expiresAt, secret }) {
  const email = normalizedEmail(sellerEmail)
  const normalizedDigestKey = typeof digestKey === 'string' ? digestKey.trim().toLowerCase() : ''
  const expiryMs = new Date(expiresAt).getTime()
  if (!uuidPattern.test(String(sellerId || ''))) return null
  if (!emailPattern.test(email) || email.length > 320) return null
  if (!digestKeyPattern.test(normalizedDigestKey)) return null
  if (!Number.isFinite(expiryMs) || typeof secret !== 'string' || secret.length < 20) return null
  const expirySeconds = Math.floor(expiryMs / 1000)
  const signature = createHmac('sha256', secret)
    .update(`seller-availability-confirmation|v1|${String(sellerId).toLowerCase()}|${email}|${normalizedDigestKey}|${expirySeconds}`)
    .digest('hex')
  return `${expirySeconds}.${signature}`
}

export function verifySellerAvailabilityCapability(input, now = new Date()) {
  const token = typeof input?.token === 'string' ? input.token.trim().toLowerCase() : ''
  const match = token.match(/^(\d{10})\.([0-9a-f]{64})$/)
  if (!match) return false
  const expiryMs = Number(match[1]) * 1000
  const currentMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(currentMs) || expiryMs < currentMs || expiryMs - currentMs > maximumFutureLifetimeMs) return false
  const expected = signSellerAvailabilityCapability({ ...input, expiresAt: new Date(expiryMs) })
  if (!expected) return false
  return timingSafeEqual(Buffer.from(expected.split('.')[1], 'hex'), Buffer.from(match[2], 'hex'))
}
