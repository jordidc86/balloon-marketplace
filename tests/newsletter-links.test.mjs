import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildNewsletterCampaign,
  buildNewsletterListingUrl,
  newsletterAttribution,
} from '../src/utils/newsletter-links.mjs'
import { mergeCommercialSource } from '../src/utils/commercial-source.mjs'
import { normalizeCommercialContext } from '../src/utils/commercial-attribution.mjs'

const listingId = '4e2be39d-6390-409a-8304-ae16b1239fc1'

test('newsletter listing links carry deterministic non-personal campaign attribution', () => {
  const result = new URL(buildNewsletterListingUrl({
    baseUrl: 'https://aerotrade.app',
    listingId,
    periodKey: '2026-08-16',
  }))

  assert.equal(result.origin, 'https://aerotrade.app')
  assert.equal(result.pathname, `/catalog/${listingId}`)
  assert.equal(result.searchParams.get('utm_source'), 'newsletter')
  assert.equal(result.searchParams.get('utm_medium'), 'email')
  assert.equal(result.searchParams.get('utm_campaign'), 'biweekly_marketplace_2026-08-16')
  assert.equal([...result.searchParams].length, 3)
  assert.deepEqual(newsletterAttribution, {
    source: 'newsletter',
    medium: 'email',
    campaignPrefix: 'biweekly_marketplace',
  })
})

test('newsletter campaign is stable for one run and rejects unsafe identifiers', () => {
  assert.equal(buildNewsletterCampaign('2026-09-01'), 'biweekly_marketplace_2026-09-01')
  assert.throws(() => buildNewsletterCampaign('2026-09-02'), /valid newsletter period key/)
  assert.throws(() => buildNewsletterListingUrl({
    baseUrl: 'https://aerotrade.app',
    listingId: '../../private',
    periodKey: '2026-09-01',
  }), /valid listing id/)
})

test('newsletter attribution survives the listing journey into stored commercial context', () => {
  const listingUrl = buildNewsletterListingUrl({
    baseUrl: 'https://aerotrade.app',
    listingId,
    periodKey: '2026-09-01',
  })
  const landing = mergeCommercialSource({
    currentUrl: listingUrl,
    documentReferrer: '',
    siteHostname: 'aerotrade.app',
  })
  const afterInternalNavigation = mergeCommercialSource({
    currentUrl: 'https://aerotrade.app/wanted',
    documentReferrer: listingUrl,
    siteHostname: 'aerotrade.app',
    saved: landing,
  })
  const stored = normalizeCommercialContext({
    visitorId: '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a',
    utmSource: afterInternalNavigation.utmSource,
    utmMedium: afterInternalNavigation.utmMedium,
    utmCampaign: afterInternalNavigation.utmCampaign,
  })

  assert.deepEqual(landing, {
    referrerHost: null,
    utmSource: 'newsletter',
    utmMedium: 'email',
    utmCampaign: 'biweekly_marketplace_2026-09-01',
  })
  assert.equal(stored.utm_source, 'newsletter')
  assert.equal(stored.utm_medium, 'email')
  assert.equal(stored.utm_campaign, 'biweekly_marketplace_2026-09-01')
})
