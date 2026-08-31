import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeNewBalloonLeadSource } from '../src/utils/new-balloon-lead.mjs'

test('new-balloon lead source keeps only known commercial entry points', () => {
  assert.equal(normalizeNewBalloonLeadSource(' catalog-empty '), 'catalog-empty')
  assert.equal(normalizeNewBalloonLeadSource('LISTING'), 'listing')
  assert.equal(normalizeNewBalloonLeadSource('sold-listing'), 'sold-listing')
  assert.equal(normalizeNewBalloonLeadSource('about'), 'about')
  assert.equal(normalizeNewBalloonLeadSource('contact'), 'contact')
  assert.equal(normalizeNewBalloonLeadSource('https://attacker.example'), 'direct')
  assert.equal(normalizeNewBalloonLeadSource(null), 'direct')
})

test('every accepted new-balloon source is also accepted by the database constraint', () => {
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260831610000_sold_listing_new_balloon_source.sql', import.meta.url), 'utf8')
  for (const source of ['direct', 'navigation', 'home', 'catalog', 'catalog-empty', 'listing', 'sold-listing', 'wanted', 'about', 'contact']) {
    assert.match(migration, new RegExp(`'${source}'`))
  }
})
