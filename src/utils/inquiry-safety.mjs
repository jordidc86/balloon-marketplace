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

const text = (value) => typeof value === 'string' ? value.trim() : ''

export function parseInquiry(formData) {
  const website = text(formData.get('website'))
  if (website) throw new Error('Unable to submit this enquiry')

  const inquiry = {
    buyer_name: text(formData.get('buyer_name')),
    buyer_email: text(formData.get('buyer_email')).toLowerCase(),
    buyer_phone: text(formData.get('buyer_phone')) || null,
    message: text(formData.get('message')),
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

export function normalizeInquiryStatus(value) {
  return inquiryStatuses.includes(value) ? value : null
}

export function isClosedInquiryStatus(value) {
  return ['WON', 'LOST', 'SPAM'].includes(value)
}

