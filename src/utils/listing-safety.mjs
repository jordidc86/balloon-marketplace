export const maxListingImages = 20

export function getInitialListingPublication(plan, now = new Date()) {
  if (plan === 'free') {
    return {
      status: 'ACTIVE_PUBLIC',
      publicAt: now.toISOString(),
    }
  }

  return {
    status: 'PENDING_PAYMENT',
    publicAt: null,
  }
}

export function parseListingImageUrls(value) {
  if (typeof value !== 'string') {
    throw new Error('At least one listing image is required')
  }

  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Listing images are invalid')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Listing images are invalid')
  }

  const urls = [...new Set(parsed.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
  if (urls.length === 0) {
    throw new Error('At least one listing image is required')
  }

  if (urls.length > maxListingImages) {
    throw new Error(`A listing can have at most ${maxListingImages} images`)
  }

  for (const value of urls) {
    let url
    try {
      url = new URL(value)
    } catch {
      throw new Error('Listing images must use valid URLs')
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Listing images must use valid URLs')
    }
  }

  return urls
}

export function canRevealSellerContact(listing, viewer, now = new Date()) {
  const isOwner = Boolean(viewer.userId && listing.sellerId === viewer.userId)
  if (isOwner) {
    return true
  }

  if (listing.status === 'ACTIVE_PUBLIC') {
    return true
  }

  if (listing.status !== 'ACTIVE_PREMIUM') {
    return false
  }

  const isExclusive = Boolean(listing.publicAt && now < new Date(listing.publicAt))
  return !isExclusive || viewer.isPremium
}
