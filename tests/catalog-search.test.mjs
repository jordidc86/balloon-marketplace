import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogSearchEventKey, normalizeCatalogSearch } from '../src/utils/catalog-search.mjs'

test('catalog searches preserve useful equipment demand and normalize filters', () => {
  assert.deepEqual(normalizeCatalogSearch({ query: '  Cameron   N-77 ', category: 'complete', country: 'Spain', sort: 'price_asc', resultCount: 0 }), {
    entry_context: 'catalog_search',
    query_text: 'Cameron N-77',
    category: 'complete',
    country: 'Spain',
    sort: 'price_asc',
    result_count: 0,
    zero_results: true,
  })
})

test('localized acquisition demand uses one closed non-PII entry context', () => {
  const localized = normalizeCatalogSearch({ entryContext: 'buyer_landing_de', resultCount: 12 })
  assert.equal(localized.entry_context, 'buyer_landing_de')
  assert.equal(localized.query_text, null)
  assert.equal(localized.result_count, 12)
  assert.equal(normalizeCatalogSearch({ entryContext: 'https://attacker.example', resultCount: 12 }).entry_context, 'catalog_search')
})

test('catalog analytics drop likely personal contact details', () => {
  assert.equal(normalizeCatalogSearch({ query: 'buyer@example.com', resultCount: 0 }).query_text, null)
  assert.equal(normalizeCatalogSearch({ query: '+34 600 123 456', resultCount: 0 }).query_text, null)
  assert.equal(normalizeCatalogSearch({ query: 'https://example.com/item', resultCount: 0 }).query_text, null)
})

test('catalog event keys are daily and deterministic without retaining the visitor id', () => {
  const search = normalizeCatalogSearch({ query: 'Schroeder fire balloon', resultCount: 2 })
  const first = catalogSearchEventKey({ search, principal: 'visitor-id', date: new Date('2026-08-29T08:00:00Z') })
  const duplicate = catalogSearchEventKey({ search, principal: 'visitor-id', date: new Date('2026-08-29T20:00:00Z') })
  const nextDay = catalogSearchEventKey({ search, principal: 'visitor-id', date: new Date('2026-08-30T08:00:00Z') })
  assert.equal(first, duplicate)
  assert.notEqual(first, nextDay)
  assert.equal(first.length, 64)
  assert.doesNotMatch(first, /visitor-id/)
})
