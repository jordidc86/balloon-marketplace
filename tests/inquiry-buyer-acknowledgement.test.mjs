import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInquiryBuyerAcknowledgement } from '../src/utils/inquiry-buyer-acknowledgement.mjs'

test('marketplace enquiry acknowledgement preserves the private follow-up path and commercial boundary', () => {
  const message = buildInquiryBuyerAcknowledgement({
    listingTitle: 'Cameron Z-105 <test>',
    listingUrl: 'https://aerotrade.app/catalog/listing-id',
    buyerPortalUrl: 'https://aerotrade.app/inquiry/status?id=private&token=signed',
    indicativeOffer: '€25,000.00',
  })
  assert.match(message.subject, /Cameron Z-105 <test>/)
  assert.match(message.html, /Cameron Z-105 &lt;test&gt;/)
  assert.match(message.html, /non-binding price indication/)
  assert.match(message.html, /does not reserve the equipment or form a sale contract/)
  assert.match(message.html, /private enquiry status and negotiation history/)
  assert.match(message.html, /expires after 90 days/)
})

test('marketplace enquiry acknowledgement does not invent an offer or portal', () => {
  const message = buildInquiryBuyerAcknowledgement({
    listingTitle: 'Used balloon',
    listingUrl: 'https://aerotrade.app/catalog/listing-id',
    buyerPortalUrl: null,
    indicativeOffer: null,
  })
  assert.doesNotMatch(message.html, /price indication/)
  assert.doesNotMatch(message.html, /private enquiry status/)
  assert.match(message.html, /Return to the listing/)
})
