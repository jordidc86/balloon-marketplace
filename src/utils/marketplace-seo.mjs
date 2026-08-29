const absoluteHttpUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

const compactText = (value, maxLength = 160) => {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

const normalizeCurrency = (value) => {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(currency) ? currency : null
}

const listingConditionUrl = (condition) => {
  const normalized = typeof condition === 'string' ? condition.trim().toLowerCase() : ''

  if (normalized.includes('new')) return 'https://schema.org/NewCondition'
  if (normalized.includes('refurb')) return 'https://schema.org/RefurbishedCondition'
  if (normalized.includes('damag') || normalized.includes('repair')) return 'https://schema.org/DamagedCondition'
  return 'https://schema.org/UsedCondition'
}

export const isListingPubliclyIndexable = (listing, now = new Date()) => {
  if (!listing || listing.status === 'ACTIVE_PUBLIC') return Boolean(listing)
  if (listing.status !== 'ACTIVE_PREMIUM' || !listing.public_at) return false

  const publicAt = new Date(listing.public_at)
  return Number.isFinite(publicAt.getTime()) && publicAt <= now
}

export const getPublicListingSeoData = (listing, siteUrl, now = new Date()) => {
  if (!isListingPubliclyIndexable(listing, now)) return null

  const title = compactText(listing.title, 90)
  if (!title) return null

  const url = `${String(siteUrl).replace(/\/+$/, '')}/catalog/${encodeURIComponent(listing.id)}`
  const description = compactText(
    listing.description || `${title}, offered on AeroTrade's European hot air balloon marketplace.`,
    160
  )
  const images = (listing.images || [])
    .map((image) => absoluteHttpUrl(image?.url))
    .filter(Boolean)

  return {
    title,
    description,
    url,
    images,
  }
}

export const buildListingProductJsonLd = (listing, siteUrl, now = new Date()) => {
  const seo = getPublicListingSeoData(listing, siteUrl, now)
  const price = Number(listing?.price)
  const priceCurrency = normalizeCurrency(listing?.currency)

  // A zero price means "price on request" in AeroTrade. Publishing it as a free
  // Offer would be commercially false and would violate the visible page.
  if (!seo || !Number.isFinite(price) || price <= 0 || !priceCurrency) return null

  const manufacturer = compactText(String(listing?.details?.manufacturer || ''), 80)
  const model = compactText(String(listing?.details?.model || ''), 80)

  return {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: seo.title,
    ...(seo.images.length ? { image: seo.images } : {}),
    description: seo.description,
    ...(listing.category ? { category: compactText(String(listing.category), 80) } : {}),
    ...(manufacturer ? { brand: { '@type': 'Brand', name: manufacturer } } : {}),
    ...(model ? { model } : {}),
    offers: {
      '@type': 'Offer',
      url: seo.url,
      priceCurrency,
      price,
      itemCondition: listingConditionUrl(listing.condition),
      availability: 'https://schema.org/InStock',
    },
  }
}

export const buildListingBreadcrumbJsonLd = (listing, siteUrl, now = new Date()) => {
  const seo = getPublicListingSeoData(listing, siteUrl, now)
  if (!seo) return null

  const origin = String(siteUrl).replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'AeroTrade', item: origin },
      { '@type': 'ListItem', position: 2, name: 'Marketplace catalog', item: `${origin}/catalog` },
      { '@type': 'ListItem', position: 3, name: seo.title, item: seo.url },
    ],
  }
}

export const buildMarketplaceIdentityJsonLd = (siteUrl) => {
  const origin = String(siteUrl).replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org/',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'AeroTrade',
        url: origin,
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: 'AeroTrade',
        url: origin,
        publisher: { '@id': `${origin}/#organization` },
      },
    ],
  }
}

export const buildNewBalloonServiceJsonLd = (siteUrl) => {
  const origin = String(siteUrl).replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org/',
    '@type': 'Service',
    name: 'New Pasha or Schroeder hot air balloon sourcing',
    serviceType: 'New hot air balloon sales, configuration and indicative budgeting',
    provider: { '@id': `${origin}/#organization` },
    areaServed: 'Europe',
    url: `${origin}/new-balloon`,
  }
}

/**
 * @param {{
 *   siteUrl: string,
 *   path: string,
 *   name: string,
 *   description: string,
 *   language: string,
 *   listings?: Array<{
 *     id: string,
 *     title: string,
 *     description?: string | null,
 *     category?: string | null,
 *     status: string,
 *     public_at?: string | null,
 *     images?: Array<{url?: string | null}> | null
 *   }>
 * }} input
 */
export const buildBuyerAcquisitionCollectionJsonLd = ({ siteUrl, path, name, description, language, listings = [] }) => {
  const origin = String(siteUrl).replace(/\/+$/, '')
  const collectionUrl = new URL(String(path || '/'), `${origin}/`).toString()
  const safeListings = listings
    .filter((listing) => isListingPubliclyIndexable(listing))
    .map((listing) => getPublicListingSeoData(listing, origin))
    .filter(Boolean)

  return {
    '@context': 'https://schema.org/',
    '@type': 'CollectionPage',
    name: compactText(String(name || ''), 120),
    description: compactText(String(description || ''), 200),
    url: collectionUrl,
    inLanguage: compactText(String(language || 'en-GB'), 20),
    isPartOf: { '@id': `${origin}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: safeListings.length,
      itemListElement: safeListings.map((listing, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: listing.title,
        url: listing.url,
      })),
    },
  }
}

export const serializeJsonLd = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029')
