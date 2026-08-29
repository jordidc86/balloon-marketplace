import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeSellerAcquisitionSource } from '../src/utils/seller-acquisition.mjs'

test('seller acquisition source is bounded and normalizes public route labels', () => {
  assert.equal(normalizeSellerAcquisitionSource(' seller-seo '), 'seller_seo')
  assert.equal(normalizeSellerAcquisitionSource('DASHBOARD'), 'dashboard')
  assert.equal(normalizeSellerAcquisitionSource('https://attacker.example'), 'direct')
  assert.equal(normalizeSellerAcquisitionSource(null, 'sell_gateway'), 'sell_gateway')
})
