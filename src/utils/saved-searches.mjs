import { createHmac, timingSafeEqual } from 'node:crypto'
import { getCatalogCategory } from './catalog-categories.mjs'
import { getCatalogManufacturer, listingMatchesCatalogManufacturer } from './catalog-manufacturers.mjs'
import { normalizeCatalogSearch } from './catalog-search.mjs'
import { canonicalCountry } from './global-search/sources.mjs'
import { matchesCatalogText, searchExternalListings, visibleExternalListings } from './global-search/index.mjs'

export function normalizeSavedSearch(input = {}) {
  const query = String(input.query || '').trim()
  const country = String(input.country || '').trim()
  if (query.length > 100 || country.length > 100 || (country && !/^[\p{L}\s().'-]+$/u.test(country))) throw new Error('Please use equipment keywords and a country')
  const normalized = normalizeCatalogSearch({ query, resultCount: 0 })
  if (query && !normalized.query_text) throw new Error('Use equipment keywords, not contact details or links')
  const category = input.category ? getCatalogCategory(input.category)?.slug : ''
  const manufacturer = input.manufacturer ? getCatalogManufacturer(input.manufacturer)?.slug : ''
  if (category === undefined || manufacturer === undefined || (category && manufacturer)) throw new Error('Invalid search filters')
  if (!query && !category && !country && !manufacturer) throw new Error('Choose equipment keywords or a filter first')
  return { query: normalized.query_text || '', category: category || '', country: canonicalCountry(country) || country, manufacturer: manufacturer || '' }
}

export function savedSearchLabel(search) {
  return [search.query, getCatalogCategory(search.category)?.label, getCatalogManufacturer(search.manufacturer)?.name, search.country].filter(Boolean).join(' · ')
}

export function savedSearchPath(search) {
  const path = search.category ? `/catalog/category/${encodeURIComponent(search.category)}` : search.manufacturer ? `/catalog/manufacturer/${encodeURIComponent(search.manufacturer)}` : '/catalog'
  const params = new URLSearchParams()
  if (search.query) params.set('q', search.query)
  if (search.country) params.set('country', search.country)
  return path + (params.size ? '?' + params : '')
}

export function savedSearchMatches(search, native, snapshots, now = Date.now()) {
  const manufacturer = getCatalogManufacturer(search.manufacturer)
  const normalizeCountry = value => (canonicalCountry(value) || String(value || '')).toLowerCase()
  const own = native.filter(item => ['ACTIVE_PUBLIC','ACTIVE_PREMIUM'].includes(item.status)
    && (!search.category || item.category === search.category)
    && (!search.country || normalizeCountry(item.location_country) === normalizeCountry(search.country))
    && (!manufacturer || listingMatchesCatalogManufacturer(item, manufacturer))
    && matchesCatalogText(item, search.query))
    .map(item => ({ key: `native:${item.id}`, title: String(item.title).slice(0,160), path: `/catalog/${item.id}`, price: Number(item.price) > 0 ? `${Number(item.price).toLocaleString('en-IE')} ${item.currency}` : 'Price on request', source: 'AeroTrade' }))
  const external = searchExternalListings(visibleExternalListings(snapshots,now), { query: search.query, category: search.category, country: search.country, manufacturer })
    .map(item => ({ key: `external:${item.url}`, title: item.title, url: item.url, price: item.price || 'Price on request', source: item.sourceName }))
  return [...new Map([...own,...external].map(item => [item.key,item])).values()]
}

export function signSearchStop(id, secret) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id)) || !secret) return null
  return createHmac('sha256',secret).update(`saved-search-stop-v1:${id}`).digest('hex')
}

export function verifySearchStop(id, token, secret) {
  const expected = signSearchStop(id,secret)
  return Boolean(expected && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(expected),Buffer.from(token)))
}
