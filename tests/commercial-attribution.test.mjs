import assert from 'node:assert/strict'
import test from 'node:test'

import { commercialEventKey, commercialJourneyKey, normalizeCommercialContext } from '../src/utils/commercial-attribution.mjs'

test('commercial attribution stores bounded campaign context without raw visitor ids', () => {
  const context = normalizeCommercialContext({
    visitorId: '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a',
    referrer: 'https://example.com/path?private=value',
    utmSource: 'newsletter',
    utmMedium: 'email',
    utmCampaign: 'spring'.repeat(40),
  })
  assert.equal(context.referrer_host, 'example.com')
  assert.equal(context.utm_campaign.length, 120)
  assert.equal(context.visitorId, '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a')
})

test('one visitor produces one daily event key per listing and action', () => {
  const input = {
    listingId: 'listing-1',
    eventType: 'VIEW',
    principal: 'visitor-1',
    date: new Date('2026-08-29T08:00:00Z'),
  }
  assert.equal(commercialEventKey(input), commercialEventKey({ ...input, date: new Date('2026-08-29T20:00:00Z') }))
  assert.notEqual(commercialEventKey(input), commercialEventKey({ ...input, eventType: 'CONTACT_REVEAL' }))
  assert.equal(commercialEventKey(input)?.length, 64)
})

test('journey keys join stages for one day without exposing the principal', () => {
  const input = {
    principal: '5c1d1bca-5c56-4c96-bab1-bf537ad9b93a',
    secret: 'server-only-secret',
    date: new Date('2026-08-29T08:00:00Z'),
  }
  const key = commercialJourneyKey(input)
  assert.equal(key, commercialJourneyKey({ ...input, date: new Date('2026-08-29T20:00:00Z') }))
  assert.equal(key?.length, 64)
  assert.ok(!key?.includes(input.principal))
  assert.notEqual(key, commercialJourneyKey({ ...input, date: new Date('2026-08-30T08:00:00Z') }))
  assert.notEqual(key, commercialJourneyKey({ ...input, principal: 'different-principal' }))
  assert.equal(commercialJourneyKey({ ...input, principal: null }), null)
  assert.equal(commercialJourneyKey({ ...input, secret: '' }), null)
})
