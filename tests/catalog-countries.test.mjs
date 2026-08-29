import assert from 'node:assert/strict'
import test from 'node:test'
import {
  catalogCountries,
  getCatalogCountriesWithInventory,
  getCatalogCountry,
  getCatalogCountryPath,
  listingMatchesCatalogCountry,
  minimumCountryInventoryForIndexing,
} from '../src/utils/catalog-countries.mjs'

test('country landing pages use a closed, canonical European inventory set', () => {
  assert.deepEqual(catalogCountries.map((country) => country.slug), ['spain', 'belgium', 'czech-republic', 'turkey'])
  assert.equal(getCatalogCountry('turkey')?.name, 'Türkiye')
  assert.equal(getCatalogCountry('spain?sort=newest'), null)
  assert.equal(getCatalogCountryPath('czech-republic'), '/catalog/country/czech-republic')
  assert.equal(minimumCountryInventoryForIndexing, 2)
})

test('country inventory matching accepts known display variants but not partial text', () => {
  assert.equal(listingMatchesCatalogCountry({ location_country: 'Türkiye' }, 'turkey'), true)
  assert.equal(listingMatchesCatalogCountry({ location_country: 'Turkey' }, 'turkey'), true)
  assert.equal(listingMatchesCatalogCountry({ location_country: 'Czechia' }, 'czech-republic'), true)
  assert.equal(listingMatchesCatalogCountry({ location_country: 'Northern Spain' }, 'spain'), false)
})

test('only countries with enough current public inventory become acquisition pages', () => {
  const listings = [
    { location_country: 'Spain' },
    { location_country: 'Spain' },
    { location_country: 'Belgium' },
  ]
  assert.deepEqual(getCatalogCountriesWithInventory(listings, 2).map((country) => country.slug), ['spain'])
})
