import crypto from 'node:crypto'
import { getCatalogCategory, getCatalogCategoryPath } from './catalog-categories.mjs'
import { isListingPubliclyIndexable } from './marketplace-seo.mjs'

const publicStaticPaths = ['', '/catalog', '/new-balloon', '/wanted', '/sell', '/sell-hot-air-balloon', '/sell/assisted', '/pricing', '/about', '/contact']

const normalizeOrigin = (value) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * @param {{origin?: string, listings?: Array<{id?: string, category?: string, status?: string, public_at?: string | null}>, now?: Date}} input
 */
export function buildPublicIndexingUrls({ origin, listings = [], now = new Date() } = {}) {
  const safeOrigin = normalizeOrigin(origin)
  if (!safeOrigin) throw new Error('A secure public origin is required')

  const publicListings = listings.filter((listing) => isListingPubliclyIndexable(listing, now))
  const categoryPaths = Array.from(new Set(publicListings
    .map((listing) => getCatalogCategory(listing.category)?.slug)
    .filter(Boolean)))
    .map((category) => getCatalogCategoryPath(category))
  const listingPaths = publicListings
    .filter((listing) => typeof listing.id === 'string' && listing.id)
    .map((listing) => `/catalog/${encodeURIComponent(listing.id)}`)

  return Array.from(new Set([...publicStaticPaths, ...categoryPaths, ...listingPaths]
    .map((path) => new URL(path, `${safeOrigin}/`).toString())))
    .sort()
}

/**
 * @param {{origin?: string, key?: string, urls?: string[], date?: Date}} input
 */
export function buildIndexNowSubmission({ origin, key, urls, date = new Date() } = {}) {
  const safeOrigin = normalizeOrigin(origin)
  if (!safeOrigin) throw new Error('A secure public origin is required')
  if (typeof key !== 'string' || !/^[A-Fa-f0-9-]{8,128}$/.test(key)) throw new Error('A valid IndexNow key is required')
  const site = new URL(safeOrigin)
  const safeUrls = Array.from(new Set((urls || []).map((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.hostname === site.hostname ? url.toString() : null
    } catch {
      return null
    }
  }).filter(Boolean))).sort()
  if (safeUrls.length < 1 || safeUrls.length > 10_000) throw new Error('IndexNow requires between 1 and 10,000 public URLs')

  const fingerprint = crypto.createHash('sha256').update(safeUrls.join('\n')).digest('hex')
  const day = date.toISOString().slice(0, 10)
  const batchKey = crypto.createHash('sha256').update(`indexnow:${day}:${fingerprint}`).digest('hex')
  return {
    batchKey,
    fingerprint,
    payload: {
      host: site.hostname,
      key,
      keyLocation: `${safeOrigin}/${key}.txt`,
      urlList: safeUrls,
    },
  }
}
