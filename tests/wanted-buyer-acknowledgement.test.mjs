import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWantedBuyerAcknowledgement } from '../src/utils/wanted-buyer-acknowledgement.mjs'

test('wanted buyer acknowledgement confirms only stored demand and bounded matching evidence', () => {
  const acknowledgement = buildWantedBuyerAcknowledgement({
    category: 'complete',
    notifyOnMatch: true,
    matchingCount: 2,
  }, 'https://aerotrade.app/')

  assert.match(acknowledgement.subject, /wanted-equipment request/)
  assert.match(acknowledgement.html, /complete balloon/)
  assert.match(acknowledgement.html, /2<\/strong> basic candidates/)
  assert.match(acknowledgement.html, /operational match alert only/)
  assert.match(acknowledgement.html, /https:\/\/aerotrade\.app\/catalog/)
  assert.match(acknowledgement.html, /new Pasha or Schroeder balloon/)
  assert.doesNotMatch(acknowledgement.html, /available or technically compliant\.<\/strong>/)
})

test('wanted buyer acknowledgement never invents candidates or marketing consent', () => {
  const acknowledgement = buildWantedBuyerAcknowledgement({
    category: '<script>alert(1)</script>',
    notifyOnMatch: false,
    matchingCount: Number.NaN,
  }, 'https://aerotrade.app')

  assert.match(acknowledgement.html, /0<\/strong> basic candidates/)
  assert.match(acknowledgement.html, /did not request automatic match alerts/)
  assert.doesNotMatch(acknowledgement.html, /<script>/)
  assert.match(acknowledgement.html, /no reservation, purchase contract or payment obligation/)
})
