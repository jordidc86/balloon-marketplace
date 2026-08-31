export const socialPublicationMaxAttempts = 2
export const socialPublicationRetryDelayMs = 30 * 60 * 1000

const allowedContentKinds = new Set(['listing', 'brand'])
const allowedNetworks = new Set(['instagram', 'facebook'])
const allowedPlacements = new Set(['post', 'story', 'carousel', 'reel', 'video'])
const safePartPattern = /^[a-z0-9][a-z0-9-]{0,95}$/
const runDatePattern = /^\d{4}-\d{2}-\d{2}$/

const requiredPart = (value, label, allowed) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || (allowed && !allowed.has(normalized)) || (!allowed && !safePartPattern.test(normalized))) {
    throw new Error(`${label} is invalid`)
  }
  return normalized
}

export function buildSocialPublicationKey({ runDate, contentKind, contentId, network, placement }) {
  const normalizedRunDate = String(runDate || '').trim()
  if (!runDatePattern.test(normalizedRunDate)) throw new Error('Run date is invalid')
  const normalizedContentKind = requiredPart(contentKind, 'Content kind', allowedContentKinds)
  const normalizedContentId = requiredPart(contentId, 'Content id')
  const normalizedNetwork = requiredPart(network, 'Network', allowedNetworks)
  const normalizedPlacement = requiredPart(placement, 'Placement', allowedPlacements)
  return `social:v1:${normalizedRunDate}:${normalizedContentKind}:${normalizedContentId}:${normalizedNetwork}:${normalizedPlacement}`
}

export function getAttributedSocialUrl(rawUrl, { network, placement, contentKind }) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:') throw new Error('Social destination must use HTTPS')
  const normalizedNetwork = requiredPart(network, 'Network', allowedNetworks)
  const normalizedPlacement = requiredPart(placement, 'Placement', allowedPlacements)
  const normalizedContentKind = requiredPart(contentKind, 'Content kind', allowedContentKinds)
  url.searchParams.set('utm_source', normalizedNetwork)
  url.searchParams.set('utm_medium', 'organic_social')
  url.searchParams.set('utm_campaign', `scheduled_${normalizedContentKind}`)
  url.searchParams.set('utm_content', normalizedPlacement)
  return url.toString()
}

export function getSocialAcquisitionMode({ network, placement }) {
  const normalizedNetwork = requiredPart(network, 'Network', allowedNetworks)
  const normalizedPlacement = requiredPart(placement, 'Placement', allowedPlacements)

  if (normalizedPlacement === 'story') return 'awareness_image_only'
  if (normalizedNetwork === 'facebook' && ['post', 'video'].includes(normalizedPlacement)) return 'destination_text_candidate'
  if (normalizedNetwork === 'instagram' && ['post', 'carousel', 'reel'].includes(normalizedPlacement)) return 'destination_caption_only'
  return 'awareness_only'
}

export function getSocialPublicationDecision(receipt, now = new Date(), maxAttempts = socialPublicationMaxAttempts) {
  if (receipt?.status === 'accepted' && receipt?.provider_id) return 'duplicate'
  if (receipt?.status === 'pending' && Number(receipt?.attempt_count || 0) > 0) return 'unverified'
  const attempts = Number(receipt?.attempt_count || 0)
  if (attempts >= maxAttempts) return 'exhausted'
  if (receipt?.status === 'failed' && !receipt?.retryable) return 'manual_review'
  const nextAttempt = receipt?.next_attempt_at ? new Date(receipt.next_attempt_at).getTime() : Number.NaN
  if (Number.isFinite(nextAttempt) && nextAttempt > now.getTime()) return 'deferred'
  return 'publish'
}

export function getNextSocialPublicationAttemptAt(attemptNumber, now = new Date(), maxAttempts = socialPublicationMaxAttempts) {
  if (attemptNumber >= maxAttempts) return null
  return new Date(now.getTime() + socialPublicationRetryDelayMs).toISOString()
}

export function isSocialPublicationRetrySafe(category) {
  return ['rate_limit'].includes(String(category || '').toLowerCase())
}
