import crypto from 'node:crypto'

const categories = ['complete', 'envelopes', 'baskets', 'burners', 'bottom-end', 'cylinders', 'other-equipment']
const currencies = ['EUR', 'GBP', 'USD']
const readinessValues = ['READY', 'PARTIAL', 'NOT_READY', 'UNKNOWN']
const timelineValues = ['NOW', '0_3_MONTHS', '3_6_MONTHS', 'EXPLORING']
const helpValues = ['VALUATION', 'LISTING_PREPARATION', 'PHOTO_GUIDANCE', 'DOCUMENT_CHECK']
export const sellerAssistanceStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'LISTING_PREPARATION', 'LISTED', 'CLOSED', 'SPAM']
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const text = (formData, key, max) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

const multiline = (formData, key, max) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim().replace(/\r\n/g, '\n').slice(0, max) : ''
}

const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback

const optionalYear = (value) => {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  const maxYear = new Date().getUTCFullYear() + 1
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > maxYear) throw new Error('Please enter a valid manufacture year.')
  return parsed
}

const optionalMoneyMinor = (value) => {
  if (!value) return null
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value)) throw new Error('Please enter a valid expected price.')
  const minor = Math.round(Number(value.replace(',', '.')) * 100)
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error('Please enter a valid expected price.')
  return minor
}

export function parseSellerAssistanceRequest(formData) {
  if (text(formData, 'company_website', 200)) throw new Error('Unable to submit this request.')

  const name = text(formData, 'name', 120)
  const email = text(formData, 'email', 320).toLowerCase()
  const category = oneOf(text(formData, 'category', 40), categories, '')
  if (name.length < 2) throw new Error('Please enter your name.')
  if (!emailPattern.test(email)) throw new Error('Please enter a valid email address.')
  if (!category) throw new Error('Please select the equipment you want to sell.')
  if (formData.get('privacy_consent') !== 'yes') throw new Error('Please confirm that AeroTrade may review and respond to this request.')

  const helpNeeded = formData.getAll('help_needed')
    .filter((value) => typeof value === 'string' && helpValues.includes(value))
  const uniqueHelp = Array.from(new Set(helpNeeded))

  return {
    name,
    email,
    phone: text(formData, 'phone', 60) || null,
    category,
    manufacturer: text(formData, 'manufacturer', 120) || null,
    model: text(formData, 'model', 120) || null,
    manufacture_year: optionalYear(text(formData, 'manufacture_year', 4)),
    location_country: text(formData, 'location_country', 100) || null,
    expected_price_minor: optionalMoneyMinor(text(formData, 'expected_price', 20)),
    currency: oneOf(text(formData, 'currency', 3), currencies, 'EUR'),
    documentation_readiness: oneOf(text(formData, 'documentation_readiness', 20), readinessValues, 'UNKNOWN'),
    photo_readiness: oneOf(text(formData, 'photo_readiness', 20), readinessValues, 'UNKNOWN'),
    timeline: oneOf(text(formData, 'timeline', 30), timelineValues, 'EXPLORING'),
    help_needed: uniqueHelp,
    notes: multiline(formData, 'notes', 2000) || null,
    source_context: 'sell_assisted',
  }
}

export function normalizeSellerAssistanceStatus(value) {
  return sellerAssistanceStatuses.includes(value) ? value : null
}

export function createSellerAssistanceSubmissionKey(address, userAgent, secret) {
  if (!secret || typeof secret !== 'string') return null
  const principal = `${String(address || '').trim()}|${String(userAgent || '').slice(0, 300)}`
  if (principal === '|') return null
  return crypto.createHmac('sha256', secret).update(principal).digest('hex')
}

