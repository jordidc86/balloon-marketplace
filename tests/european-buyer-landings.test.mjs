import assert from 'node:assert/strict'
import test from 'node:test'

import {
  europeanBuyerLandingAlternates,
  europeanBuyerLandingPaths,
  europeanBuyerLandings,
  getEuropeanBuyerLanding,
} from '../src/utils/european-buyer-landings.mjs'

test('European buyer acquisition has one closed, reciprocal set of commercial locales', () => {
  assert.deepEqual(europeanBuyerLandings.map((landing) => landing.key), ['en', 'de', 'fr', 'es'])
  assert.equal(new Set(europeanBuyerLandingPaths).size, europeanBuyerLandings.length)
  assert.equal(europeanBuyerLandingAlternates['x-default'], getEuropeanBuyerLanding('en').path)

  for (const landing of europeanBuyerLandings) {
    assert.equal(europeanBuyerLandingAlternates[landing.locale], landing.path)
    assert.match(landing.path, /^\/[a-z0-9/-]+$/)
    assert.ok(landing.title.length <= 75)
    assert.ok(landing.description.length <= 180)
    assert.ok(landing.intro.length >= 100)
    assert.ok(landing.wantedBody.length >= 90)
    assert.ok(landing.newBody.length >= 70)
    assert.ok(landing.trustBody.length >= 120)
  }
})

test('unknown acquisition locales fail closed', () => {
  assert.equal(getEuropeanBuyerLanding('it'), null)
  assert.equal(getEuropeanBuyerLanding(''), null)
})
