import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSellerAvailabilityDigestNotification } from '../src/utils/seller-availability-notification.mjs'

test('seller availability digest is rebuildable from bounded trusted listing evidence', () => {
  const notification = buildSellerAvailabilityDigestNotification({
    dueListings: [{ id: 'one', title: '<Envelope>' }, { id: 'two', title: 'Basket' }],
    capabilityUrl: 'https://aerotrade.app/seller/availability?token=a&b',
    dashboardUrl: 'https://aerotrade.app/dashboard',
  })
  assert.equal(notification.subject, 'Please confirm your 2 active AeroTrade listings')
  assert.match(notification.html, /&lt;Envelope&gt;/)
  assert.match(notification.html, /token=a&amp;b/)
  assert.doesNotMatch(notification.html, /<Envelope>/)
  assert.match(notification.html, /does not change publication, price, ownership or payment/)
})
