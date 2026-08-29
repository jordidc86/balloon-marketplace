import crypto from 'node:crypto'

const safeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const bounded = (value, max) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, max)
  : null

export function normalizeCommercialContext(context = {}) {
  let referrerHost = null
  try {
    referrerHost = context.referrer ? new URL(context.referrer).hostname.slice(0, 255) : null
  } catch {
    referrerHost = null
  }

  return {
    visitorId: safeUuid.test(context.visitorId || '') ? context.visitorId.toLowerCase() : null,
    referrer_host: referrerHost,
    utm_source: bounded(context.utmSource, 120),
    utm_medium: bounded(context.utmMedium, 120),
    utm_campaign: bounded(context.utmCampaign, 120),
  }
}

export function commercialEventKey({ listingId, eventType, principal, date = new Date() }) {
  if (!listingId || !eventType || !principal) return null
  const day = date.toISOString().slice(0, 10)
  return crypto.createHash('sha256').update(`${listingId}:${eventType}:${principal}:${day}`).digest('hex')
}

