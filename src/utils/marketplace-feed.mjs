import { isListingPubliclyIndexable } from './marketplace-seo.mjs'

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const urlPattern = /\bhttps?:\/\/[^\s<]+/gi
const phonePattern = /(^|[^A-Z0-9])\+?\d[\d\s().-]{6,}\d(?=$|[^A-Z0-9])/gi

const compactSafeText = (value, maxLength = 160) => {
  if (typeof value !== 'string') return ''

  const redacted = value
    .replace(emailPattern, ' ')
    .replace(urlPattern, ' ')
    .replace(phonePattern, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()

  if (redacted.length <= maxLength) return redacted
  return `${redacted.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const validDate = (value) => {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

const normalizeOrigin = (value) => {
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    throw new Error('Marketplace feed requires a valid public site URL.')
  }
}

const normalizeCurrency = (value) => {
  const currency = compactSafeText(String(value || ''), 3).toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : null
}

const fallbackTitle = (listing) => {
  const manufacturer = compactSafeText(String(listing?.details?.manufacturer || ''), 60)
  const model = compactSafeText(String(listing?.details?.model || ''), 60)
  const category = compactSafeText(String(listing?.category || 'hot air balloon equipment'), 60)
  return compactSafeText([manufacturer, model].filter(Boolean).join(' ') || category, 100)
}

const safeDescription = (listing) => {
  const fields = [
    ['Category', listing?.category],
    ['Manufacturer', listing?.details?.manufacturer],
    ['Model', listing?.details?.model],
    ['Condition', listing?.condition],
    ['Location', listing?.location_country],
  ]
    .map(([label, value]) => [label, compactSafeText(String(value || ''), 80)])
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`)

  const price = Number(listing?.price)
  const currency = normalizeCurrency(listing?.currency)
  if (Number.isFinite(price) && price > 0 && currency) {
    fields.push(`Price: ${currency} ${price}`)
  }

  return compactSafeText(
    `Available used hot air balloon equipment on AeroTrade.${fields.length ? ` ${fields.join('. ')}.` : ''}`,
    360,
  )
}

export const getPublicInventoryFeedListings = (listings, now = new Date()) => (
  (Array.isArray(listings) ? listings : [])
    .filter((listing) => ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing?.status))
    .filter((listing) => isListingPubliclyIndexable(listing, now))
    .filter((listing) => typeof listing?.id === 'string' && listing.id.trim())
)

export const buildMarketplaceInventoryFeed = ({
  siteUrl,
  listings,
  generatedAt = new Date(),
}) => {
  const origin = normalizeOrigin(siteUrl)
  const now = validDate(generatedAt) || new Date()
  const feedUrl = `${origin}/feed.xml`
  const inventory = getPublicInventoryFeedListings(listings, now)
    .map((listing) => {
      const publishedAt = validDate(listing.public_at) || validDate(listing.created_at) || now
      const updatedAt = validDate(listing.updated_at) || publishedAt
      const title = compactSafeText(listing.title, 100) || fallbackTitle(listing)
      const link = `${origin}/catalog/${encodeURIComponent(listing.id)}`

      return {
        id: listing.id,
        title: title || 'Hot air balloon equipment',
        link,
        description: safeDescription(listing),
        publishedAt,
        updatedAt,
        category: compactSafeText(String(listing.category || ''), 60),
        country: compactSafeText(String(listing.location_country || ''), 80),
      }
    })
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())

  const lastBuildDate = inventory.reduce(
    (latest, listing) => listing.updatedAt > latest ? listing.updatedAt : latest,
    now,
  )

  const items = inventory.map((listing) => `    <item>
      <title>${escapeXml(listing.title)}</title>
      <link>${escapeXml(listing.link)}</link>
      <guid isPermaLink="true">${escapeXml(listing.link)}</guid>
      <description>${escapeXml(listing.description)}</description>
      <pubDate>${listing.publishedAt.toUTCString()}</pubDate>${listing.category ? `
      <category>${escapeXml(listing.category)}</category>` : ''}${listing.country ? `
      <category domain="location">${escapeXml(listing.country)}</category>` : ''}
    </item>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AeroTrade active hot air balloon equipment</title>
    <link>${escapeXml(`${origin}/catalog`)}</link>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>Currently available used hot air balloons and equipment on AeroTrade.</description>
    <language>en-GB</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>
    <ttl>60</ttl>${items ? `
${items}` : ''}
  </channel>
</rss>
`
}
