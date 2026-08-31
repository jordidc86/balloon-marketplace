import { createHash } from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const normalizeNewsletterConsentInvitationIds = (values) => {
  const ids = [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim().toLowerCase()))].sort()
  if (ids.length === 0 || ids.length > 100 || ids.some((id) => !uuidPattern.test(id))) return null
  return ids
}

export const newsletterConsentInvitationBatchKey = (values) => {
  const ids = normalizeNewsletterConsentInvitationIds(values)
  if (!ids) return null
  return `newsletter-consent-batch-v1-${createHash('sha256').update(ids.join('|')).digest('hex')}`
}

