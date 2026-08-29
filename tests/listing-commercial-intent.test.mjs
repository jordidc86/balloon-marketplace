import test from 'node:test'
import assert from 'node:assert/strict'
import { listingCommercialIntentStages, normalizeListingCommercialIntentStage } from '../src/utils/listing-commercial-intent.mjs'

test('buyer listing intent uses one closed non-PII stage vocabulary', () => {
  assert.deepEqual(listingCommercialIntentStages, [
    'ENQUIRY_CTA_CLICKED',
    'ENQUIRY_FORM_VIEWED',
    'ENQUIRY_FORM_STARTED',
  ])
  assert.equal(normalizeListingCommercialIntentStage(' enquiry_form_started '), 'ENQUIRY_FORM_STARTED')
  assert.equal(normalizeListingCommercialIntentStage('CONTACT_REVEAL'), null)
  assert.equal(normalizeListingCommercialIntentStage('buyer@example.com'), null)
})
