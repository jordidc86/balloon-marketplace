import { listingCategories, listingCurrencies } from './listing-submission.mjs'
import { createHmac } from 'node:crypto'

export const wantedRequestStatuses = ['NEW', 'REVIEWING', 'MATCHED', 'CONTACTED', 'CLOSED', 'SPAM']

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const text = (formData, key) => typeof formData.get(key) === 'string' ? formData.get(key).trim() : ''

const optionalMoneyMinor = (formData, key) => {
  const raw = text(formData, key)
  if (!raw) return null
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
    throw new Error('Budget values must be valid positive amounts')
  }
  return Math.round(amount * 100)
}

export function parseWantedRequest(formData) {
  if (text(formData, 'website')) throw new Error('Unable to submit this request')

  const request = {
    buyer_name: text(formData, 'buyer_name'),
    buyer_email: text(formData, 'buyer_email').toLowerCase(),
    buyer_phone: text(formData, 'buyer_phone') || null,
    category: text(formData, 'category'),
    location_preference: text(formData, 'location_preference') || null,
    currency: text(formData, 'currency'),
    budget_min_minor: optionalMoneyMinor(formData, 'budget_min'),
    budget_max_minor: optionalMoneyMinor(formData, 'budget_max'),
    details: text(formData, 'details'),
    notify_on_match: formData.get('notify_on_match') === 'yes',
  }

  if (request.buyer_name.length < 2 || request.buyer_name.length > 120) throw new Error('Please enter your name')
  if (!emailPattern.test(request.buyer_email) || request.buyer_email.length > 320) throw new Error('Please enter a valid email address')
  if (request.buyer_phone && request.buyer_phone.length > 60) throw new Error('Please enter a shorter phone number')
  if (!listingCategories.includes(request.category)) throw new Error('Please choose an equipment category')
  if (!listingCurrencies.includes(request.currency)) throw new Error('Please choose a valid currency')
  if (request.location_preference && request.location_preference.length > 120) throw new Error('Location preference is too long')
  if (request.details.length < 20 || request.details.length > 3000) throw new Error('Please describe what you need in 20 to 3,000 characters')
  if (request.budget_min_minor !== null && request.budget_max_minor !== null && request.budget_min_minor > request.budget_max_minor) {
    throw new Error('Minimum budget cannot exceed maximum budget')
  }
  if (formData.get('privacy_consent') !== 'yes') throw new Error('Please accept the privacy notice')

  return request
}

export function normalizeWantedRequestStatus(value) {
  return wantedRequestStatuses.includes(value) ? value : null
}

export function createWantedSubmissionKey(ipAddress, userAgent, secret) {
  const ip = typeof ipAddress === 'string' ? ipAddress.trim().slice(0, 80) : ''
  if (!ip || typeof secret !== 'string' || secret.length < 20) return null
  const agent = typeof userAgent === 'string' ? userAgent.trim().slice(0, 300) : ''
  return createHmac('sha256', secret).update(`${ip}|${agent}`).digest('hex')
}

export function listingMatchesWantedRequest(listing, request) {
  if (!listing || !request || listing.category !== request.category) return false
  if (!['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing.status)) return false
  if (request.currency && listing.currency !== request.currency) return false
  const priceMinor = Math.round(Number(listing.price) * 100)
  if (!Number.isFinite(priceMinor)) return false
  if (request.budget_max_minor !== null && request.budget_max_minor !== undefined && priceMinor > request.budget_max_minor) return false
  return true
}
