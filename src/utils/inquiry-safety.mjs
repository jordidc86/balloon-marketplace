export const inquiryStatuses = [
  'NEW',
  'SELLER_NOTIFIED',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATING',
  'WON',
  'LOST',
  'SPAM',
]

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const moneyPattern = /^\d{1,9}(?:[.,]\d{1,2})?$/

const text = (value) => typeof value === 'string' ? value.trim() : ''

const optionalPositiveMoneyMinor = (value, label) => {
  const raw = text(value)
  if (!raw) return null
  if (!moneyPattern.test(raw)) throw new Error(`${label} is invalid`)
  const minor = Math.round(Number(raw.replace(',', '.')) * 100)
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error(`${label} must be a positive amount`)
  return minor
}

export function parseInquiry(formData) {
  const website = text(formData.get('website'))
  if (website) throw new Error('Unable to submit this enquiry')

  const inquiry = {
    buyer_name: text(formData.get('buyer_name')),
    buyer_email: text(formData.get('buyer_email')).toLowerCase(),
    buyer_phone: text(formData.get('buyer_phone')) || null,
    message: text(formData.get('message')),
    initial_offer_amount_minor: optionalPositiveMoneyMinor(formData.get('offer_amount'), 'Indicative offer'),
  }

  if (inquiry.buyer_name.length < 2 || inquiry.buyer_name.length > 120) {
    throw new Error('Please enter your name')
  }
  if (!emailPattern.test(inquiry.buyer_email) || inquiry.buyer_email.length > 320) {
    throw new Error('Please enter a valid email address')
  }
  if (inquiry.buyer_phone && inquiry.buyer_phone.length > 60) {
    throw new Error('Please enter a shorter phone number')
  }
  if (inquiry.message.length < 20 || inquiry.message.length > 2000) {
    throw new Error('Your message must contain between 20 and 2,000 characters')
  }
  if (formData.get('privacy_consent') !== 'yes') {
    throw new Error('Please accept the privacy notice')
  }

  return inquiry
}

export function parseSellerInquiryResponse(formData) {
  const response = text(formData.get('response')).toUpperCase()
  if (!['ACCEPT', 'COUNTER', 'DECLINE'].includes(response)) throw new Error('Please choose a valid response')
  const amountMinor = optionalPositiveMoneyMinor(formData.get('counter_amount'), 'Counteroffer')
  if (response === 'COUNTER' && amountMinor === null) throw new Error('Enter a counteroffer amount')
  if (response !== 'COUNTER' && amountMinor !== null) throw new Error('An amount is only allowed for a counteroffer')
  const note = text(formData.get('response_note'))
  if (note.length > 1000) throw new Error('Response note is too long')

  return {
    response,
    amount_minor: amountMinor,
    note: note || null,
  }
}

export function normalizeInquiryStatus(value) {
  return inquiryStatuses.includes(value) ? value : null
}

export function isClosedInquiryStatus(value) {
  return ['WON', 'LOST', 'SPAM'].includes(value)
}
