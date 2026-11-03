import { canonicalCountry, getGlobalSearchSource, normalizeSearchText, safeListingUrl, safeThumbnailUrl } from './sources.mjs'

/** @typedef {{sourceId:string,title:string,url:string,price:string|null,registration:string|null,category:string|null,country:string|null,thumbnail?:string|null,firstSeenAt?:string,checkedAt?:string,sourceName?:string}} ExternalListing */

const MAX_AGE = 72 * 60 * 60 * 1000

export function hasCurrentExternalPages(snapshots, now = Date.now()) {
  return snapshots.some(snapshot => {
    const source = getGlobalSearchSource(snapshot?.sourceId)
    return source && (snapshot.pages || []).some(page => {
      const age = now - Date.parse(page.checkedAt)
      return source.pages.includes(page.path) && Number.isFinite(age) && age >= -60000 && age <= MAX_AGE
    })
  })
}

// A failed page keeps its own previous timestamp. A successful page replaces
// only that page; an explicit sold/test marker removes the URL across all pages.
export function reconcileSnapshot(previous, incoming, source, now = Date.now()) {
  const pages = new Map((previous?.pages || []).filter(page => source.pages.includes(page.path)).map(page => [page.path, page]))
  const firstSeen = new Map((previous?.pages || []).flatMap(page => page.listings || []).map(item => [item.url, item.firstSeenAt]))
  for (const page of incoming.pages || []) {
    pages.set(page.path, { ...page, listings: page.listings.map(item => ({ ...item, firstSeenAt: firstSeen.get(item.url) || page.checkedAt })) })
  }
  const removed = new Set(incoming.removedUrls || [])
  return {
    sourceId: source.id, status: incoming.status, failedPaths: incoming.failedPaths || [], attemptedAt: new Date(now).toISOString(),
    pages: [...pages.values()].filter(page => now - Date.parse(page.checkedAt) <= MAX_AGE).map(page => ({ ...page, listings: page.listings.filter(item => !removed.has(item.url)) })),
  }
}

export function visibleExternalListings(snapshots, now = Date.now()) {
  /** @type {Map<string, ExternalListing>} */
  const listings = new Map()
  for (const snapshot of snapshots) {
    const source = getGlobalSearchSource(snapshot?.sourceId)
    if (!source) continue
    for (const page of snapshot.pages || []) {
      const age = now - Date.parse(page.checkedAt)
      if (!Number.isFinite(age) || age < -60000 || age > MAX_AGE || !source.pages.includes(page.path)) continue
      for (const item of page.listings || []) {
        const url = safeListingUrl(item.url, source)
        if (!url || item.sourceId !== source.id || typeof item.title !== 'string') continue
        listings.set(url, { sourceId: source.id, title: item.title.slice(0, 160), url, price: item.price || null, registration: item.registration || null, category: item.category || null, country: canonicalCountry(item.country), thumbnail: safeThumbnailUrl(item.thumbnail, source), firstSeenAt: item.firstSeenAt, checkedAt: page.checkedAt, sourceName: source.name })
      }
    }
  }
  return [...listings.values()]
}

export function matchesCatalogText(item, query) {
  const normalize = value => normalizeSearchText(value).replace(/\bschroder\b/g, 'schroeder')
  const haystack = normalize([item.title, item.registration, item.description, item.location_country, item.country, item.details?.manufacturer].filter(Boolean).join(' '))
  return normalize(String(query || '').slice(0, 100)).split(' ').filter(Boolean).every(word => haystack.includes(word))
}

export function externalPrice(item) {
  const text = String(item.price || '')
  const currency = /€|\bEUR\b/.test(text) ? 'EUR' : /£|\bGBP\b/.test(text) ? 'GBP' : item.sourceId === 'barnstormers' && /\$/.test(text) ? 'USD' : null
  const raw = text.match(/\d[\d., ]*/)?.[0].trim().replace(/ /g, '')
  if (!currency || !raw) return { currency: null, amount: null }
  const decimal = raw.match(/[.,]\d{1,2}$/)
  const normalized = decimal ? raw.slice(0, -decimal[0].length).replace(/[.,]/g, '') + '.' + decimal[0].slice(1) : raw.replace(/[.,]/g, '')
  const amount = Number(normalized)
  return { currency, amount: Number.isFinite(amount) ? amount : null }
}

/**
 * @param {ExternalListing[]} listings
 * @param {{query?:string,category?:string,country?:string,manufacturer?:{aliases:string[]}|null,sort?:string}} options
 */
export function searchExternalListings(listings, { query = '', category = '', country = '', manufacturer = null, sort = 'newest' } = {}) {
  return listings.filter(item => matchesCatalogText(item, query)
    && (!category || item.category === category)
    && (!country || Boolean(canonicalCountry(country)) && canonicalCountry(item.country) === canonicalCountry(country))
    && (!manufacturer || manufacturer.aliases.some(alias => (' ' + normalizeSearchText(item.title) + ' ').includes(' ' + normalizeSearchText(alias) + ' '))))
    .sort((a, b) => {
      if (sort === 'price_asc' || sort === 'price_desc') {
        const x = externalPrice(a); const y = externalPrice(b)
        // Unlike currencies are grouped, never compared or silently converted.
        if (!x.currency || x.amount === null) return !y.currency || y.amount === null ? a.title.localeCompare(b.title) : 1
        if (!y.currency || y.amount === null) return -1
        return x.currency.localeCompare(y.currency) || (sort === 'price_asc' ? x.amount - y.amount : y.amount - x.amount) || a.title.localeCompare(b.title)
      }
      return (Date.parse(b.firstSeenAt) || 0) - (Date.parse(a.firstSeenAt) || 0) || a.title.localeCompare(b.title)
    })
}
