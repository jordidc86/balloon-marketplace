import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildListingVerificationEvidenceInstructions,
  listingVerificationEvidenceInstructionKey,
  listingVerificationEvidenceMailto,
  parseListingVerificationEvidenceInstructionKey,
} from '../src/utils/listing-verification-notifications.mjs'

test('verification evidence handoff is reply-enabled, bounded and explicit about scope', () => {
  const listingId = '11111111-1111-4111-8111-111111111111'
  const mailto = listingVerificationEvidenceMailto({
    adminEmail: 'review@example.test',
    listingId,
    listingTitle: 'Cameron & Co <Z-350>',
  })
  assert.match(mailto, /^mailto:review%40example\.test\?/)
  assert.match(decodeURIComponent(mailto), /Review reference: 11111111/)
  assert.match(decodeURIComponent(mailto), /not an airworthiness inspection/)

  const message = buildListingVerificationEvidenceInstructions({
    adminEmail: 'review@example.test',
    listingId,
    listingTitle: 'Cameron & Co <Z-350>',
    dashboardUrl: 'https://aerotrade.app/dashboard',
    listingUrl: `https://aerotrade.app/catalog/${listingId}`,
  })
  assert.equal(message.replyTo, 'review@example.test')
  assert.match(message.html, /Send evidence to AeroTrade/)
  assert.match(message.html, /does not upload or retain the document copies/)
  assert.match(message.html, /Cameron &amp; Co &lt;Z-350&gt;/)
  assert.doesNotMatch(message.html, /Cameron & Co <Z-350>/)
})

test('verification evidence retry key is request-event bound and parseable', () => {
  const eventId = '11111111-1111-4111-8111-111111111111'
  const key = listingVerificationEvidenceInstructionKey(eventId)
  assert.equal(key, `listing-verification-evidence-instructions-${eventId}`)
  assert.equal(parseListingVerificationEvidenceInstructionKey(key), eventId)
  assert.equal(parseListingVerificationEvidenceInstructionKey('listing-verification-evidence-instructions-not-a-uuid'), null)
  assert.throws(() => listingVerificationEvidenceInstructionKey('not-a-uuid'), /valid verification request event/i)
})

test('verification evidence handoff refuses a missing contact', () => {
  assert.equal(listingVerificationEvidenceMailto({ adminEmail: '', listingId: 'x', listingTitle: 'x' }), null)
  assert.throws(() => buildListingVerificationEvidenceInstructions({
    adminEmail: '', listingId: 'x', listingTitle: 'x', dashboardUrl: 'x', listingUrl: 'x',
  }), /contact email/i)
})
