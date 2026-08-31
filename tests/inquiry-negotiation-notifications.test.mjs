import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildBuyerResponseSellerNotification,
  buildSellerResponseBuyerNotification,
  parseNegotiationNotificationEventId,
} from '../src/utils/inquiry-negotiation-notifications.mjs'

const eventId = '123e4567-e89b-42d3-a456-426614174000'

test('negotiation retry receipts resolve only their exact event identifier', () => {
  assert.equal(parseNegotiationNotificationEventId('inquiry_buyer_seller_response', `inquiry-buyer-seller-response-${eventId}`), eventId)
  assert.equal(parseNegotiationNotificationEventId('inquiry_seller_buyer_response', `inquiry-seller-buyer-response-${eventId}`), eventId)
  assert.equal(parseNegotiationNotificationEventId('inquiry_buyer_seller_response', `inquiry-seller-buyer-response-${eventId}`), null)
  assert.equal(parseNegotiationNotificationEventId('inquiry_buyer_seller_response', 'inquiry-buyer-seller-response-not-a-uuid'), null)
})

test('seller response recovery rebuilds the same bounded private negotiation message', () => {
  const message = buildSellerResponseBuyerNotification({
    listing: { title: 'Cameron <Z-105>', contactEmail: 'seller@example.com', url: 'https://aerotrade.app/catalog/id' },
    event: { eventType: 'SELLER_COUNTERED', amountMinor: 2500000, currency: 'EUR', note: 'Subject to inspection' },
    buyerResponseUrl: 'https://aerotrade.app/inquiry/respond?token=private',
    buyerPortalUrl: 'https://aerotrade.app/inquiry/status?token=private',
  })
  assert.match(message.html, /€25,000\.00/)
  assert.match(message.html, /Cameron &lt;Z-105&gt;/)
  assert.match(message.html, /invitations to negotiate only/)
  assert.match(message.html, /private link expires after 30 days/)
  assert.match(message.html, /status link expires after 90 days/)
})

test('buyer response recovery rebuilds a seller message without inventing a transaction', () => {
  const message = buildBuyerResponseSellerNotification({
    listing: { title: 'Used balloon' },
    inquiry: { buyerName: 'Buyer <name>' },
    event: { eventType: 'BUYER_DECLINED', amountMinor: null, currency: 'EUR', note: null },
    dashboardUrl: 'https://aerotrade.app/dashboard',
  })
  assert.match(message.html, /buyer declined this negotiation/i)
  assert.match(message.html, /Buyer &lt;name&gt;/)
  assert.match(message.html, /does not reserve equipment, execute payment or form a sale contract/)
})
