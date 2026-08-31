import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNewBalloonProposalBuyerNotification,
  buildNewBalloonProposalResponseAdminNotification,
  getNewBalloonProposalDeliveryRecoveryDecision,
  getNewBalloonResponseNotificationRecoveryDecision,
  parseNewBalloonProposalResponseNotificationEventId,
} from '../src/utils/new-balloon-proposal-notifications.mjs'

const proposal = {
  manufacturer: 'pasha', currency: 'EUR', amount_min_minor: 8_500_000, amount_max_minor: 9_500_000,
  configuration_summary: 'Complete balloon\nwith envelope and basket', delivery_guidance: 'Confirm factory lead time',
  valid_until: '2026-09-30', terms: 'Transport & tax subject to confirmation',
}

test('new-balloon proposal delivery can be rebuilt exactly without trusting buyer content', () => {
  const notification = buildNewBalloonProposalBuyerNotification({
    quote: { name: '<Buyer>' }, proposal, responseUrl: 'https://aerotrade.app/new-balloon/proposal?id=1&token=a&b',
  })
  assert.equal(notification.subject, 'AeroTrade indicative Pasha balloon proposal')
  assert.match(notification.html, /€85,000\.00–€95,000\.00/)
  assert.match(notification.html, /&lt;Buyer&gt;/)
  assert.match(notification.html, /token=a&amp;b/)
  assert.doesNotMatch(notification.html, /<Buyer>/)
})

test('proposal recovery sends only the latest live open proposal and reconciles accepted receipts', () => {
  const live = { id: 'proposal-1', valid_until: '2026-09-30', delivery_status: 'failed' }
  const input = { receiptStatus: 'failed', hasProviderMessageId: false, proposal: live, quoteStatus: 'CONTACTED', exactReceipt: true, latestProposalId: live.id, now: new Date('2026-08-31T12:00:00Z') }
  assert.equal(getNewBalloonProposalDeliveryRecoveryDecision(input), 'send')
  assert.equal(getNewBalloonProposalDeliveryRecoveryDecision({ ...input, latestProposalId: 'proposal-2' }), 'superseded')
  assert.equal(getNewBalloonProposalDeliveryRecoveryDecision({ ...input, quoteStatus: 'WON' }), 'superseded')
  assert.equal(getNewBalloonProposalDeliveryRecoveryDecision({ ...input, now: new Date('2026-10-01T00:00:00Z') }), 'superseded')
  assert.equal(getNewBalloonProposalDeliveryRecoveryDecision({ ...input, receiptStatus: 'accepted', hasProviderMessageId: true }), 'reconcile')
})

test('response notification recovery never revives a response after commercial state advances', () => {
  const event = { admin_notification_status: 'failed' }
  const input = { receiptStatus: 'failed', hasProviderMessageId: false, event, exactRelationships: true, quoteStatus: 'BUYER_RESPONDED' }
  assert.equal(getNewBalloonResponseNotificationRecoveryDecision(input), 'send')
  assert.equal(getNewBalloonResponseNotificationRecoveryDecision({ ...input, quoteStatus: 'WON' }), 'superseded')
  assert.equal(getNewBalloonResponseNotificationRecoveryDecision({ ...input, receiptStatus: 'accepted', hasProviderMessageId: true }), 'reconcile')
  assert.equal(getNewBalloonResponseNotificationRecoveryDecision({ ...input, receiptStatus: 'accepted', hasProviderMessageId: false }), 'blocked')
})

test('new-balloon response admin delivery is rebuilt with a direct operational link', () => {
  const notification = buildNewBalloonProposalResponseAdminNotification({
    quote: { name: 'Buyer' }, proposal,
    event: { note: '<question>\nPlease call' },
    responseLabel: 'Question about this proposal',
    commercialPipelineUrl: 'https://aerotrade.app/admin/commercial#quote-1',
  })
  assert.match(notification.subject, /Question about this proposal/)
  assert.match(notification.html, /&lt;question&gt;<br \/>Please call/)
  assert.match(notification.html, /admin\/commercial#quote-1/)
})

test('new-balloon response retry parser accepts only its closed UUID key shape', () => {
  const eventId = '11111111-1111-4111-8111-111111111111'
  assert.equal(parseNewBalloonProposalResponseNotificationEventId(`new-balloon-proposal-response-admin-${eventId}`), eventId)
  assert.equal(parseNewBalloonProposalResponseNotificationEventId(`prefix-new-balloon-proposal-response-admin-${eventId}`), null)
  assert.equal(parseNewBalloonProposalResponseNotificationEventId('new-balloon-proposal-response-admin-event-1'), null)
})
