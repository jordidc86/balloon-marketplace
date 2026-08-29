import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeCommercialSource } from '../src/utils/commercial-source.mjs'

test('external acquisition source is retained across internal navigation', () => {
  const landing = mergeCommercialSource({
    currentUrl: 'https://aerotrade.app/catalog?utm_source=google&utm_medium=cpc&utm_campaign=used-balloon',
    documentReferrer: 'https://www.google.com/search?q=balloon',
    siteHostname: 'aerotrade.app',
  })
  assert.deepEqual(landing, {
    referrerHost: 'www.google.com',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'used-balloon',
  })

  const converted = mergeCommercialSource({
    currentUrl: 'https://aerotrade.app/new-balloon',
    documentReferrer: 'https://aerotrade.app/catalog',
    siteHostname: 'aerotrade.app',
    saved: landing,
  })
  assert.deepEqual(converted, landing)
})

test('same-site referrers including www variants are not treated as acquisition', () => {
  const source = mergeCommercialSource({
    currentUrl: 'https://www.aerotrade.app/catalog',
    documentReferrer: 'https://aerotrade.app/',
    siteHostname: 'www.aerotrade.app',
  })
  assert.equal(source.referrerHost, null)
})

test('a current campaign replaces saved campaign labels but retains its external host', () => {
  const source = mergeCommercialSource({
    currentUrl: 'https://aerotrade.app/catalog?utm_source=newsletter&utm_campaign=august',
    documentReferrer: 'https://aerotrade.app/',
    siteHostname: 'aerotrade.app',
    saved: {
      referrerHost: 'aviation.example',
      utmSource: 'old-source',
      utmMedium: 'old-medium',
      utmCampaign: 'old-campaign',
    },
  })
  assert.deepEqual(source, {
    referrerHost: 'aviation.example',
    utmSource: 'newsletter',
    utmMedium: null,
    utmCampaign: 'august',
  })
})

test('malformed and oversized source values fail safely and are bounded', () => {
  const source = mergeCommercialSource({
    currentUrl: `https://aerotrade.app/catalog?utm_source=${'x'.repeat(300)}`,
    documentReferrer: 'not a valid host%',
    siteHostname: 'aerotrade.app',
  })
  assert.equal(source.referrerHost, null)
  assert.equal(source.utmSource?.length, 120)
})
