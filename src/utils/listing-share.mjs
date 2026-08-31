const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const shareSources = new Set(['listing_share', 'seller_share'])
const shareMediums = new Set(['native', 'whatsapp', 'email', 'copy', 'linkedin', 'facebook'])

export function buildListingShareUrl({ baseUrl, listingId, source = 'listing_share', medium = 'copy' }) {
  if (!uuidPattern.test(String(listingId || ''))) throw new Error('A valid listing is required')
  if (!shareSources.has(source)) throw new Error('Invalid listing share source')
  if (!shareMediums.has(medium)) throw new Error('Invalid listing share channel')

  let origin
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    origin = parsed.origin
  } catch {
    throw new Error('A valid marketplace URL is required')
  }

  const url = new URL('/catalog/' + listingId, origin)
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', medium)
  url.searchParams.set('utm_campaign', 'listing_distribution')
  return url.toString()
}

export function buildListingShareText(title) {
  const boundedTitle = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ').slice(0, 160) : ''
  return boundedTitle
    ? 'See ' + boundedTitle + ' on AeroTrade, the hot-air-balloon equipment marketplace.'
    : 'See this hot-air-balloon equipment listing on AeroTrade.'
}
