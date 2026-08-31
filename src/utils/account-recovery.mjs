import { createHmac, timingSafeEqual } from 'node:crypto'

export const minimumAccountPasswordLength = 10
export const accountRecoveryCapabilityLifetimeMs = 30 * 60 * 1000
export const accountRecoveryRequestCooldownMs = 15 * 60 * 1000
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeAccountRecoveryEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

export function validateAccountPasswordChange(passwordValue, confirmationValue) {
  const password = typeof passwordValue === 'string' ? passwordValue : ''
  const confirmation = typeof confirmationValue === 'string' ? confirmationValue : ''

  if (password.length < minimumAccountPasswordLength) {
    return { valid: false, error: `Use at least ${minimumAccountPasswordLength} characters.` }
  }
  if (password.length > 128) return { valid: false, error: 'Use no more than 128 characters.' }
  if (password !== confirmation) return { valid: false, error: 'The passwords do not match.' }
  return { valid: true, password }
}

export function signAccountRecoveryCapability({ userId, email, expiresAt, secret }) {
  const normalizedEmail = normalizeAccountRecoveryEmail(email)
  const expiry = Number(expiresAt)
  if (!uuidPattern.test(String(userId || '')) || !normalizedEmail) return null
  if (!Number.isSafeInteger(expiry) || expiry <= 0) return null
  if (typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret)
    .update(`account-recovery|v1|${userId}|${normalizedEmail}|${expiry}`)
    .digest('hex')
}

export function verifyAccountRecoveryCapability({ userId, email, expiresAt, token, secret, now = Date.now() }) {
  const expiry = Number(expiresAt)
  if (!Number.isSafeInteger(expiry) || expiry < now) return false
  if (expiry - now > accountRecoveryCapabilityLifetimeMs) return false
  const expected = signAccountRecoveryCapability({ userId, email, expiresAt: expiry, secret })
  const supplied = typeof token === 'string' ? token.trim().toLowerCase() : ''
  if (!expected || !/^[0-9a-f]{64}$/.test(supplied)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}
