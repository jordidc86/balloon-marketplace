import crypto from 'node:crypto'
import { listingCategories } from './listing-submission.mjs'

const safeSorts = ['newest', 'price_asc', 'price_desc']
export const catalogDemandEntryContexts = ['catalog_search', 'buyer_landing_en', 'buyer_landing_de', 'buyer_landing_fr', 'buyer_landing_es']
const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/
const urlPattern = /(?:https?:\/\/|www\.)/i
const phonePattern = /(?:\+?\d[\d\s().-]{6,}\d)/

const bounded = (value, max) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

export function normalizeCatalogSearch(input = {}) {
  const rawQuery = bounded(input.query, 200)
  const unsafeQuery = rawQuery && (emailPattern.test(rawQuery) || urlPattern.test(rawQuery) || phonePattern.test(rawQuery))
  const queryText = unsafeQuery
    ? null
    : rawQuery?.replace(/[^\p{L}\p{N}\s+./-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || null
  const category = listingCategories.includes(input.category) ? input.category : null
  const country = bounded(input.country, 100)
  const sort = safeSorts.includes(input.sort) ? input.sort : 'newest'
  const resultCount = Number(input.resultCount)

  if (!Number.isInteger(resultCount) || resultCount < 0 || resultCount > 10_000) {
    throw new Error('Catalog result count is invalid')
  }

  return {
    entry_context: catalogDemandEntryContexts.includes(input.entryContext) ? input.entryContext : 'catalog_search',
    query_text: queryText,
    category,
    country,
    sort,
    result_count: resultCount,
    zero_results: resultCount === 0,
  }
}

export function catalogSearchEventKey({ search, principal, date = new Date() }) {
  if (!principal || !search) return null
  const day = date.toISOString().slice(0, 10)
  return crypto.createHash('sha256').update(JSON.stringify({ search, principal, day })).digest('hex')
}
