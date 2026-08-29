import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNewBalloonLeadSource } from '../src/utils/new-balloon-lead.mjs'

test('new-balloon lead source keeps only known commercial entry points', () => {
  assert.equal(normalizeNewBalloonLeadSource(' catalog-empty '), 'catalog-empty')
  assert.equal(normalizeNewBalloonLeadSource('LISTING'), 'listing')
  assert.equal(normalizeNewBalloonLeadSource('about'), 'about')
  assert.equal(normalizeNewBalloonLeadSource('contact'), 'contact')
  assert.equal(normalizeNewBalloonLeadSource('https://attacker.example'), 'direct')
  assert.equal(normalizeNewBalloonLeadSource(null), 'direct')
})
