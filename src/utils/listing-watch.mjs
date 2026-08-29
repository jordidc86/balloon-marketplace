import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const actionPurposes = new Set(['confirm', 'unsubscribe'])
export const listingWatchDispatchRetryDelayMs = 30 * 60 * 1000

const field = (formData, key) => typeof formData.get(key) === 'string' ? formData.get(key).trim() : ''

export function parseListingWatchRequest(formData) {
  if (field(formData, 'website')) throw new Error('Unable to record this watch request.')
  const email = field(formData, 'email').toLowerCase()
  if (!emailPattern.test(email) || email.length > 320) throw new Error('Please enter a valid email address.')
  if (formData.get('privacy_consent') !== 'yes') throw new Error('Please accept the privacy notice.')
  return { email, normalized_email: email }
}

export function createListingWatchSubmissionKey(ipAddress, userAgent, secret) {
  const ip = typeof ipAddress === 'string' ? ipAddress.trim().slice(0, 80) : ''
  if (!ip || typeof secret !== 'string' || secret.length < 20) return null
  const agent = typeof userAgent === 'string' ? userAgent.trim().slice(0, 300) : ''
  return createHmac('sha256', secret).update(`listing-watch|${ip}|${agent}`).digest('hex')
}

export function createListingWatchSnapshot(listing) {
  if (!listing || !uuidPattern.test(String(listing.id || ''))) throw new Error('A valid listing is required.')
  const status = String(listing.status || '').trim()
  const title = String(listing.title || '').trim().replace(/\s+/g, ' ').slice(0, 220)
  const currency = String(listing.currency || '').trim().toUpperCase().slice(0, 3)
  const condition = String(listing.condition || '').trim().slice(0, 80)
  const location = String(listing.location_country || '').trim().slice(0, 120)
  const price = Number(listing.price)
  if (!status || !title || !currency || !Number.isFinite(price) || price < 0) {
    throw new Error('Listing state is incomplete.')
  }
  const state = { status, title, price: Number(price.toFixed(2)), currency, condition, location }
  return {
    hash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    ...state,
  }
}

export function signListingWatchAction(watcherId, purpose, secret) {
  if (!uuidPattern.test(String(watcherId || '')) || !actionPurposes.has(purpose)) return null
  if (typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret).update(`listing-watch|${purpose}|${watcherId}`).digest('hex')
}

export function verifyListingWatchAction(watcherId, purpose, token, secret) {
  const expected = signListingWatchAction(watcherId, purpose, secret)
  const supplied = typeof token === 'string' ? token.trim().toLowerCase() : ''
  if (!expected || !/^[0-9a-f]{64}$/.test(supplied)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}

export function isListingWatchDispatchRetryable(dispatch, now = new Date()) {
  if (!dispatch || dispatch.status === 'ACCEPTED' || dispatch.status === 'CANCELLED') return false
  if (dispatch.status === 'FAILED') return true
  if (dispatch.status !== 'PENDING') return false
  const updatedAt = new Date(dispatch.updated_at).getTime()
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(updatedAt) && Number.isFinite(current) && current - updatedAt >= listingWatchDispatchRetryDelayMs
}
