import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSellerAssistanceSubmissionKey,
  normalizeExistingListingUrl,
  normalizeSellerAssistanceStatus,
  parseSellerAssistanceRequest,
} from '../src/utils/seller-assistance.mjs'

const validForm = () => {
  const form = new FormData()
  form.set('name', 'Balloon Owner')
  form.set('email', 'OWNER@EXAMPLE.COM')
  form.set('category', 'complete')
  form.set('manufacturer', 'Cameron')
  form.set('model', 'Z-105')
  form.set('manufacture_year', '2019')
  form.set('expected_price', '42500.50')
  form.set('currency', 'EUR')
  form.set('documentation_readiness', 'PARTIAL')
  form.set('photo_readiness', 'READY')
  form.set('timeline', '0_3_MONTHS')
  form.set('source_context', 'seller-seo')
  form.append('help_needed', 'VALUATION')
  form.append('help_needed', 'DOCUMENT_CHECK')
  form.set('privacy_consent', 'yes')
  return form
}

test('assisted seller intake normalizes only the bounded commercial contract', () => {
  const parsed = parseSellerAssistanceRequest(validForm())
  assert.equal(parsed.email, 'owner@example.com')
  assert.equal(parsed.category, 'complete')
  assert.equal(parsed.manufacture_year, 2019)
  assert.equal(parsed.expected_price_minor, 4_250_050)
  assert.deepEqual(parsed.help_needed, ['VALUATION', 'DOCUMENT_CHECK'])
  assert.equal(parsed.source_context, 'seller_seo')
})

test('assisted seller intake rejects bots, bypassed categories and missing consent', () => {
  const bot = validForm()
  bot.set('company_website', 'spam')
  assert.throws(() => parseSellerAssistanceRequest(bot), /Unable to submit/)

  const badCategory = validForm()
  badCategory.set('category', 'aircraft-script')
  assert.throws(() => parseSellerAssistanceRequest(badCategory), /select the equipment/)

  const noConsent = validForm()
  noConsent.delete('privacy_consent')
  assert.throws(() => parseSellerAssistanceRequest(noConsent), /confirm that AeroTrade/)
})

test('assisted seller intake never accepts a free-form acquisition source', () => {
  const unsafeSource = validForm()
  unsafeSource.set('source_context', 'https://attacker.example/do-this')
  assert.equal(parseSellerAssistanceRequest(unsafeSource).source_context, 'sell_gateway')
})

test('assisted seller statuses and abuse key are closed and privacy preserving', () => {
  assert.equal(normalizeSellerAssistanceStatus('LISTING_PREPARATION'), 'LISTING_PREPARATION')
  assert.equal(normalizeSellerAssistanceStatus('DELETE_EVERYTHING'), null)
  const key = createSellerAssistanceSubmissionKey('203.0.113.5', 'Browser', 'secret')
  assert.equal(key, createSellerAssistanceSubmissionKey('203.0.113.5', 'Browser', 'secret'))
  assert.equal(key?.length, 64)
  assert.equal(key?.includes('203.0.113.5'), false)
  assert.equal(createSellerAssistanceSubmissionKey('', '', 'secret'), null)
})

test('assisted seller may provide a safe public advert for manual transfer', () => {
  const form = validForm()
  form.set('existing_listing_url', 'https://www.balloons4sale.eu/example?id=12#gallery')
  form.append('help_needed', 'LISTING_TRANSFER')
  const parsed = parseSellerAssistanceRequest(form)
  assert.equal(parsed.existing_listing_url, 'https://www.balloons4sale.eu/example?id=12')
  assert.ok(parsed.help_needed.includes('LISTING_TRANSFER'))
  assert.throws(() => normalizeExistingListingUrl('javascript:alert(1)'))
  assert.throws(() => normalizeExistingListingUrl('https://aerotrade.app/catalog/example'))
})
