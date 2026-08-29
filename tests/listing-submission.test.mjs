import assert from 'node:assert/strict'
import test from 'node:test'

import { parseListingSubmission } from '../src/utils/listing-submission.mjs'

const validListing = () => {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    category: 'complete',
    condition: 'Used-Good',
    currency: 'EUR',
    title: 'Cameron Z-105 complete balloon',
    description: 'Complete balloon with documented history and normal wear for its age.',
    price: '25000',
    location_country: 'Spain',
    contact_email: 'seller@example.com',
    manufacturer: 'Cameron',
    model: 'Z-105',
    year: '2018',
    hours: '145',
    serial: '12345',
    seller_declaration: 'yes',
    supporting_documents_available: 'yes',
  })) form.set(key, value)
  return form
}

test('listing submissions are normalized and retain seller-declared trust evidence', () => {
  const parsed = parseListingSubmission(validListing())
  assert.equal(parsed.price, 25000)
  assert.equal(parsed.details.serial, '12345')
  assert.equal(parsed.details.supporting_documents_available, true)
  assert.equal(parsed.details.seller_declaration, true)
})

test('listing submissions reject browser-bypass values', () => {
  const invalidCategory = validListing()
  invalidCategory.set('category', 'aircraft')
  assert.throws(() => parseListingSubmission(invalidCategory), /category is invalid/)

  const invalidPrice = validListing()
  invalidPrice.set('price', '-1')
  assert.throws(() => parseListingSubmission(invalidPrice), /Price is invalid/)

  const missingSerial = validListing()
  missingSerial.set('serial', '')
  assert.throws(() => parseListingSubmission(missingSerial), /Serial number/)
})

