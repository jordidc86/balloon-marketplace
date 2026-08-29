import { createHmac, timingSafeEqual } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const newsletterUnsubscribePlaceholder = '__AEROTRADE_NEWSLETTER_UNSUBSCRIBE_URL__'

export function normalizeNewsletterEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 320 && emailPattern.test(email) ? email : null
}

export function isActiveNewsletterConsent(profile) {
  return profile?.newsletter_consent_status === 'ACTIVE'
    && Boolean(profile?.newsletter_consented_at)
    && !profile?.newsletter_unsubscribed_at
}

export function signNewsletterUnsubscribeCapability({ userId, email, secret }) {
  const normalizedEmail = normalizeNewsletterEmail(email)
  if (!uuidPattern.test(String(userId || '')) || !normalizedEmail) return null
  if (typeof secret !== 'string' || secret.length < 20) return null
  return createHmac('sha256', secret)
    .update(`newsletter-unsubscribe|v1|${userId}|${normalizedEmail}`)
    .digest('hex')
}

export function verifyNewsletterUnsubscribeCapability({ userId, email, token, secret }) {
  const expected = signNewsletterUnsubscribeCapability({ userId, email, secret })
  const supplied = typeof token === 'string' ? token.trim().toLowerCase() : ''
  if (!expected || !/^[0-9a-f]{64}$/.test(supplied)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'))
}

export function personalizeNewsletterHtml(html, unsubscribeUrl) {
  const source = typeof html === 'string' ? html : ''
  const url = typeof unsubscribeUrl === 'string' ? unsubscribeUrl.trim() : ''
  if (!source.includes(newsletterUnsubscribePlaceholder)) {
    throw new Error('Newsletter unsubscribe placeholder is missing.')
  }
  if (!/^https:\/\//i.test(url)) throw new Error('A secure unsubscribe URL is required.')
  return source.replaceAll(newsletterUnsubscribePlaceholder, url.replaceAll('&', '&amp;').replaceAll('"', '&quot;'))
}
