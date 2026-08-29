import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeListingCountry } from '../src/utils/listing-country.mjs'

test('known country aliases converge on one marketplace value', () => {
  assert.equal(normalizeListingCountry(' spain '), 'Spain')
  assert.equal(normalizeListingCountry('España'), 'Spain')
  assert.equal(normalizeListingCountry('Prague, Czech Republic'), 'Czech Republic')
  assert.equal(normalizeListingCountry('Czechia'), 'Czech Republic')
  assert.equal(normalizeListingCountry('Turkey'), 'Türkiye')
})

test('unknown countries are preserved but whitespace is normalized', () => {
  assert.equal(normalizeListingCountry('  New   Zealand '), 'New Zealand')
  assert.equal(normalizeListingCountry(null), '')
})
