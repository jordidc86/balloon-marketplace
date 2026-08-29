import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSocialPublicationKey,
  getAttributedSocialUrl,
  getNextSocialPublicationAttemptAt,
  getSocialPublicationDecision,
  isSocialPublicationRetrySafe,
} from '../src/utils/social-publication.mjs'

test('social publication keys are stable and placement specific', () => {
  const input = { runDate: '2026-08-29', contentKind: 'listing', contentId: '4e2be39d-6390-409a-8304-ae16b1239fc1', network: 'facebook', placement: 'post' }
  assert.equal(buildSocialPublicationKey(input), 'social:v1:2026-08-29:listing:4e2be39d-6390-409a-8304-ae16b1239fc1:facebook:post')
  assert.notEqual(buildSocialPublicationKey(input), buildSocialPublicationKey({ ...input, placement: 'story' }))
  assert.throws(() => buildSocialPublicationKey({ ...input, contentId: '../../unsafe' }), /invalid/)
})

test('social links preserve the destination and add closed acquisition attribution', () => {
  const result = new URL(getAttributedSocialUrl('https://aerotrade.app/catalog/example?existing=1', {
    network: 'instagram', placement: 'reel', contentKind: 'listing',
  }))
  assert.equal(result.origin, 'https://aerotrade.app')
  assert.equal(result.pathname, '/catalog/example')
  assert.equal(result.searchParams.get('existing'), '1')
  assert.equal(result.searchParams.get('utm_source'), 'instagram')
  assert.equal(result.searchParams.get('utm_medium'), 'organic_social')
  assert.equal(result.searchParams.get('utm_campaign'), 'scheduled_listing')
  assert.equal(result.searchParams.get('utm_content'), 'reel')
  assert.throws(() => getAttributedSocialUrl('http://aerotrade.app', { network: 'facebook', placement: 'post', contentKind: 'brand' }), /HTTPS/)
})

test('accepted and unverified social operations are never repeated automatically', () => {
  assert.equal(getSocialPublicationDecision({ status: 'accepted', provider_id: 'provider-1', attempt_count: 1 }), 'duplicate')
  assert.equal(getSocialPublicationDecision({ status: 'pending', provider_id: null, attempt_count: 1 }), 'unverified')
  assert.equal(getSocialPublicationDecision({ status: 'failed', retryable: false, attempt_count: 1 }), 'manual_review')
})

test('only explicit rate-limit rejection is eligible for one bounded retry', () => {
  const now = new Date('2026-08-29T12:00:00Z')
  assert.equal(isSocialPublicationRetrySafe('rate_limit'), true)
  assert.equal(isSocialPublicationRetrySafe('timeout'), false)
  assert.equal(isSocialPublicationRetrySafe('transient'), false)
  assert.equal(getSocialPublicationDecision({ status: 'failed', retryable: true, attempt_count: 1, next_attempt_at: '2026-08-29T11:59:00Z' }, now), 'publish')
  assert.equal(getSocialPublicationDecision({ status: 'failed', retryable: true, attempt_count: 1, next_attempt_at: '2026-08-29T12:01:00Z' }, now), 'deferred')
  assert.equal(getSocialPublicationDecision({ status: 'failed', retryable: true, attempt_count: 2 }, now), 'exhausted')
  assert.equal(getNextSocialPublicationAttemptAt(1, now), '2026-08-29T12:30:00.000Z')
  assert.equal(getNextSocialPublicationAttemptAt(2, now), null)
})
