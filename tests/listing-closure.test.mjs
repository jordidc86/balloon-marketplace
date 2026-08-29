import assert from 'node:assert/strict'
import test from 'node:test'

import { parseListingClosure } from '../src/utils/listing-closure.mjs'

test('seller may withdraw without accidentally reporting a sale', () => {
  const form = new FormData()
  form.set('closure_action', 'withdrawn')
  assert.deepEqual(parseListingClosure(form, 'EUR'), {
    action: 'WITHDRAWN',
    sale_channel: null,
    marketplace_inquiry_id: null,
    gross_amount_minor: null,
    currency: null,
  })
})

test('an AeroTrade sale requires one bounded matching-enquiry identifier', () => {
  const form = new FormData()
  form.set('closure_action', 'sold')
  form.set('sale_channel', 'aerotrade')
  form.set('marketplace_inquiry_id', '2c14f3ad-406a-4485-ac68-0db36fb70dcc')
  form.set('gross_amount', '24500.50')
  assert.deepEqual(parseListingClosure(form, 'EUR'), {
    action: 'SOLD',
    sale_channel: 'AEROTRADE',
    marketplace_inquiry_id: '2c14f3ad-406a-4485-ac68-0db36fb70dcc',
    gross_amount_minor: 2_450_050,
    currency: 'EUR',
  })
})

test('external and undisclosed sales cannot be falsely attached to an AeroTrade enquiry', () => {
  for (const channel of ['OTHER_CHANNEL', 'NOT_DISCLOSED']) {
    const form = new FormData()
    form.set('closure_action', 'SOLD')
    form.set('sale_channel', channel)
    form.set('marketplace_inquiry_id', '2c14f3ad-406a-4485-ac68-0db36fb70dcc')
    assert.throws(() => parseListingClosure(form, 'EUR'), /only an aerotrade sale/i)
  }
})

test('malformed, zero and unsupported monetary evidence fails closed', () => {
  for (const amount of ['0', '-2', '12.345', 'free']) {
    const form = new FormData()
    form.set('closure_action', 'SOLD')
    form.set('sale_channel', 'NOT_DISCLOSED')
    form.set('gross_amount', amount)
    assert.throws(() => parseListingClosure(form, 'EUR'), /sale amount/i)
  }
  const valid = new FormData()
  valid.set('closure_action', 'SOLD')
  valid.set('sale_channel', 'NOT_DISCLOSED')
  assert.throws(() => parseListingClosure(valid, 'BTC'), /currency/i)
})
