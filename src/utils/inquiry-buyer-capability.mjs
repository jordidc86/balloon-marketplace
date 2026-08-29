import { createHmac, timingSafeEqual } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const inquiryBuyerCapabilityLifetimeMs = 30 * 24 * 60 * 60 * 1000
export const inquiryBuyerPortalCapabilityLifetimeMs = 90 * 24 * 60 * 60 * 1000
const maximumFutureLifetimeMs = 31 * 24 * 60 * 60 * 1000
const maximumFuturePortalLifetimeMs = 91 * 24 * 60 * 60 * 1000

const normalizedEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export function signInquiryBuyerCapability({ inquiryId, eventId, buyerEmail, expiresAt, secret }) {
  const email = normalizedEmail(buyerEmail)
  const expiryMs = new Date(expiresAt).getTime()
  if (!uuidPattern.test(String(inquiryId || '')) || !uuidPattern.test(String(eventId || ''))) return null
  if (!emailPattern.test(email) || email.length > 320) return null
  if (!Number.isFinite(expiryMs) || typeof secret !== 'string' || secret.length < 20) return null
  const expirySeconds = Math.floor(expiryMs / 1000)
  const signature = createHmac('sha256', secret)
    .update(`inquiry-buyer-response|v1|${inquiryId}|${eventId}|${email}|${expirySeconds}`)
    .digest('hex')
  return `${expirySeconds}.${signature}`
}

export function verifyInquiryBuyerCapability(input, now = new Date()) {
  const token = typeof input?.token === 'string' ? input.token.trim().toLowerCase() : ''
  const match = token.match(/^(\d{10})\.([0-9a-f]{64})$/)
  if (!match) return false
  const expiryMs = Number(match[1]) * 1000
  const currentMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(currentMs) || expiryMs < currentMs || expiryMs - currentMs > maximumFutureLifetimeMs) return false
  const expected = signInquiryBuyerCapability({ ...input, expiresAt: new Date(expiryMs) })
  if (!expected) return false
  const expectedSignature = expected.split('.')[1]
  return timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(match[2], 'hex'))
}

export function signInquiryBuyerPortalCapability({ inquiryId, buyerEmail, expiresAt, secret }) {
  const email = normalizedEmail(buyerEmail)
  const expiryMs = new Date(expiresAt).getTime()
  if (!uuidPattern.test(String(inquiryId || ''))) return null
  if (!emailPattern.test(email) || email.length > 320) return null
  if (!Number.isFinite(expiryMs) || typeof secret !== 'string' || secret.length < 20) return null
  const expirySeconds = Math.floor(expiryMs / 1000)
  const signature = createHmac('sha256', secret)
    .update(`inquiry-buyer-portal|v1|${inquiryId}|${email}|${expirySeconds}`)
    .digest('hex')
  return `${expirySeconds}.${signature}`
}

export function verifyInquiryBuyerPortalCapability(input, now = new Date()) {
  const token = typeof input?.token === 'string' ? input.token.trim().toLowerCase() : ''
  const match = token.match(/^(\d{10})\.([0-9a-f]{64})$/)
  if (!match) return false
  const expiryMs = Number(match[1]) * 1000
  const currentMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(currentMs) || expiryMs < currentMs || expiryMs - currentMs > maximumFuturePortalLifetimeMs) return false
  const expected = signInquiryBuyerPortalCapability({ ...input, expiresAt: new Date(expiryMs) })
  if (!expected) return false
  const expectedSignature = expected.split('.')[1]
  return timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(match[2], 'hex'))
}

export function isInquiryBuyerResponseWindowOpen(expiresAt, now = new Date()) {
  const expiryMs = new Date(expiresAt).getTime()
  const currentMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(expiryMs) && Number.isFinite(currentMs) && expiryMs >= currentMs
}
