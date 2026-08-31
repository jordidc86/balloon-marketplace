import { createHmac, timingSafeEqual } from 'node:crypto'
import { normalizeNewsletterEmail } from './newsletter-consent.mjs'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const hex64Pattern = /^[0-9a-f]{64}$/i
export const publicNewsletterConfirmationLifetimeMs = 7 * 24 * 60 * 60 * 1000

const text = (formData, name) => typeof formData.get(name) === 'string' ? formData.get(name).trim() : ''

export function parsePublicNewsletterOptIn(formData) {
  if (text(formData, 'website')) throw new Error('Unable to request marketplace updates.')
  const email = normalizeNewsletterEmail(text(formData, 'email'))
  if (!email) throw new Error('Please enter a valid email address.')
  if (formData.get('privacy_consent') !== 'yes') throw new Error('Please accept the privacy notice.')
  return { email }
}

export function publicNewsletterEmailHash(email, secret) {
  const normalizedEmail = normalizeNewsletterEmail(email)
  if (!normalizedEmail || typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret).update(`newsletter-public-email|v1|${normalizedEmail}`).digest('hex')
}

export function publicNewsletterSubmissionKey(ipAddress, userAgent, secret) {
  const ip = typeof ipAddress === 'string' ? ipAddress.trim().slice(0, 80) : ''
  const agent = typeof userAgent === 'string' ? userAgent.trim().slice(0, 300) : ''
  if (!ip || typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret).update(`newsletter-public-request|v1|${ip}|${agent}`).digest('hex')
}

export function publicNewsletterConfirmationIdempotencyKey(subscriptionId, confirmationCycle) {
  const cycle = Number(confirmationCycle)
  if (!uuidPattern.test(String(subscriptionId || '')) || !Number.isSafeInteger(cycle) || cycle < 1 || cycle > 1_000_000) return null
  return `newsletter-public-optin-v1-${String(subscriptionId).toLowerCase()}-${cycle}`
}

export function parsePublicNewsletterConfirmationIdempotencyKey(value) {
  const match = /^newsletter-public-optin-v1-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-([1-9][0-9]{0,5})$/i.exec(String(value || '').trim())
  if (!match) return null
  const confirmationCycle = Number(match[2])
  if (!Number.isSafeInteger(confirmationCycle) || confirmationCycle > 1_000_000) return null
  return { subscriptionId: match[1].toLowerCase(), confirmationCycle }
}

export function signPublicNewsletterConfirmation({ subscriptionId, email, confirmationCycle, expiresAt, secret }) {
  const normalizedEmail = normalizeNewsletterEmail(email)
  const key = publicNewsletterConfirmationIdempotencyKey(subscriptionId, confirmationCycle)
  const expiry = Number(expiresAt)
  if (!normalizedEmail || !key || !Number.isSafeInteger(expiry) || expiry <= 0) return null
  if (typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret)
    .update(`newsletter-public-confirm|v1|${key}|${normalizedEmail}|${expiry}`)
    .digest('hex')
}

export function verifyPublicNewsletterConfirmation({ subscriptionId, email, confirmationCycle, expiresAt, token, secret, now = Date.now() }) {
  const expiry = Number(expiresAt)
  if (!Number.isSafeInteger(expiry) || expiry < now || expiry - now > publicNewsletterConfirmationLifetimeMs) return false
  const expected = signPublicNewsletterConfirmation({ subscriptionId, email, confirmationCycle, expiresAt: expiry, secret })
  const supplied = typeof token === 'string' ? token.trim().toLowerCase() : ''
  if (!expected || !hex64Pattern.test(supplied)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}

export function signPublicNewsletterUnsubscribe({ subscriptionId, email, secret }) {
  const normalizedEmail = normalizeNewsletterEmail(email)
  if (!uuidPattern.test(String(subscriptionId || '')) || !normalizedEmail) return null
  if (typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret)
    .update(`newsletter-public-unsubscribe|v1|${String(subscriptionId).toLowerCase()}|${normalizedEmail}`)
    .digest('hex')
}

export function verifyPublicNewsletterUnsubscribe({ subscriptionId, email, token, secret }) {
  const expected = signPublicNewsletterUnsubscribe({ subscriptionId, email, secret })
  const supplied = typeof token === 'string' ? token.trim().toLowerCase() : ''
  if (!expected || !hex64Pattern.test(supplied)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}
