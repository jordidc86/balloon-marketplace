import assert from 'node:assert/strict'
import test from 'node:test'
import {
  equipmentTypeForCategory,
  newBalloonQuoteSubmissionKey,
  normalizeNewBalloonDemandContext,
  parseNewBalloonQuoteRequest,
} from '../src/utils/new-balloon-request.mjs'

const validForm = () => new FormData()
const appendValidFields = (form) => {
  form.set('name', 'Buyer Pilot')
  form.set('email', 'BUYER@EXAMPLE.COM')
  form.set('manufacturer_preference', 'schroeder')
  form.set('equipment_type', 'complete-balloon')
  form.set('intended_use', 'commercial-rides')
  form.set('budget_range', '100k-150k')
  form.set('timeline', '3-6-months')
  form.set('privacy_consent', 'on')
  form.set('source_context', 'catalog-empty')
  form.set('requested_category', 'complete')
  form.set('requested_equipment', 'Schroeder G42')
  form.set('requested_country', 'Portugal')
  return form
}

test('new-balloon requests are normalized into the closed commercial contract', () => {
  const parsed = parseNewBalloonQuoteRequest(appendValidFields(validForm()))
  assert.equal(parsed.email, 'buyer@example.com')
  assert.equal(parsed.manufacturer_preference, 'schroeder')
  assert.equal(parsed.equipment_type, 'complete-balloon')
  assert.equal(parsed.requested_category, 'complete')
  assert.equal(parsed.requested_equipment, 'Schroeder G42')
  assert.equal(parsed.requested_country, 'Portugal')
})

test('new-balloon requests reject browser bypasses, bots and missing consent', () => {
  const invalidEquipment = appendValidFields(validForm())
  invalidEquipment.set('equipment_type', 'aircraft-script')
  assert.throws(() => parseNewBalloonQuoteRequest(invalidEquipment), /select the equipment/)

  const bot = appendValidFields(validForm())
  bot.set('company_website', 'https://spam.example')
  assert.throws(() => parseNewBalloonQuoteRequest(bot), /Unable to submit/)

  const noConsent = appendValidFields(validForm())
  noConsent.delete('privacy_consent')
  assert.throws(() => parseNewBalloonQuoteRequest(noConsent), /confirm that AeroTrade may respond/)
})

test('catalog demand context drops contact details and unknown categories', () => {
  assert.deepEqual(normalizeNewBalloonDemandContext({ category: 'complete', query: 'Cameron Z-350', country: 'Spain' }), {
    requested_category: 'complete',
    requested_equipment: 'Cameron Z-350',
    requested_country: 'Spain',
  })
  assert.equal(normalizeNewBalloonDemandContext({ query: 'buyer@example.com' }).requested_equipment, '')
  assert.equal(normalizeNewBalloonDemandContext({ category: 'unknown' }).requested_category, null)
})

test('category defaults and abuse keys are deterministic without retaining raw addresses', () => {
  assert.equal(equipmentTypeForCategory('burners'), 'burner')
  assert.equal(equipmentTypeForCategory('unknown'), '')
  const key = newBalloonQuoteSubmissionKey('203.0.113.8', 'Browser', 'secret')
  assert.equal(key, newBalloonQuoteSubmissionKey('203.0.113.8', 'Browser', 'secret'))
  assert.equal(key.includes('203.0.113.8'), false)
  assert.equal(newBalloonQuoteSubmissionKey('', '', 'secret'), null)
})
