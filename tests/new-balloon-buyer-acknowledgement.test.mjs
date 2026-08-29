import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNewBalloonBuyerAcknowledgement } from '../src/utils/new-balloon-buyer-acknowledgement.mjs'

test('new-balloon acknowledgement stays transactional and escapes stored inputs', () => {
  const message = buildNewBalloonBuyerAcknowledgement({
    manufacturer_preference: 'pasha',
    equipment_type: '<script>alert(1)</script>',
  }, 'https://aerotrade.app/')
  assert.equal(message.subject, 'AeroTrade received your new-balloon request')
  assert.match(message.html, /a new Pasha balloon/)
  assert.match(message.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(message.html, /<script>/)
  assert.match(message.html, /not a factory order/)
  assert.match(message.html, /creates no payment obligation/)
  assert.match(message.html, /https:\/\/aerotrade\.app\/new-balloon/)
})

test('advice preference does not invent a manufacturer choice', () => {
  const message = buildNewBalloonBuyerAcknowledgement({
    manufacturer_preference: 'advice',
    equipment_type: 'complete-balloon',
  }, 'https://aerotrade.app')
  assert.match(message.html, /a new Pasha or Schroeder balloon/)
  assert.match(message.html, /complete balloon/)
})
