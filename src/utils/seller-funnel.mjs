import crypto from 'node:crypto'

export const sellerFunnelStages = [
  'SELL_PAGE_VIEWED',
  'FORM_STARTED',
  'LISTING_SUBMITTED',
  'CHECKOUT_CREATED',
  'CHECKOUT_RECOVERY_SENT',
  'CHECKOUT_RESUMED',
  'PAYMENT_CONFIRMED',
  'LISTING_PUBLISHED',
  'LISTING_SHARED',
]

export const browserSellerFunnelStages = ['SELL_PAGE_VIEWED', 'FORM_STARTED']
export const sellerListingShareChannels = ['native', 'whatsapp', 'email', 'copy', 'linkedin', 'facebook']

export function normalizeSellerListingShareChannel(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return sellerListingShareChannels.includes(normalized) ? normalized : null
}

export function normalizeSellerFunnelStage(value, browserOnly = false) {
  const allowed = browserOnly ? browserSellerFunnelStages : sellerFunnelStages
  return allowed.includes(value) ? value : null
}

/**
 * @param {{ sellerId: string, stage: string, listingId?: string | null, channel?: string | null, date?: Date }} input
 */
export function sellerFunnelEventKey({ sellerId, stage, listingId = null, channel = null, date = new Date() }) {
  if (!sellerId || !normalizeSellerFunnelStage(stage)) return null
  const isDailyIntent = browserSellerFunnelStages.includes(stage)
  const day = date.toISOString().slice(0, 10)
  const normalizedChannel = stage === 'LISTING_SHARED' ? normalizeSellerListingShareChannel(channel) : null
  if (stage === 'LISTING_SHARED' && (!listingId || !normalizedChannel)) return null
  const scope = isDailyIntent
    ? day
    : stage === 'CHECKOUT_RESUMED' && listingId
      ? `${listingId}:${day}`
      : stage === 'LISTING_SHARED'
        ? `${listingId}:${normalizedChannel}:${day}`
        : listingId
  if (!scope) return null
  return crypto.createHash('sha256').update(`${sellerId}:${stage}:${scope}`).digest('hex')
}

export function sellerFunnelStageOrder(stage) {
  return sellerFunnelStages.indexOf(stage)
}
