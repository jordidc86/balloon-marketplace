import assert from 'node:assert/strict'
import test from 'node:test'
import { newsletterHistoryQuery } from '../src/utils/newsletter-history.mjs'

function database() {
  const filters = []
  const query = Object.fromEntries(['select', 'eq', 'is', 'in', 'order', 'limit'].map(method => [method, (...args) => {
    filters.push([method, ...args]); return query
  }]))
  query.neq = (field, value) => {
    assert.match(value, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/, 'database UUID filter must be a real UUID')
    filters.push(['neq', field, value]); return query
  }
  return { from: table => { assert.equal(table, 'newsletter_runs'); return query }, filters }
}

test('dry-run history never passes its synthetic identifier to the UUID column', () => {
  const db = database()
  newsletterHistoryQuery(db, { id: 'dry-run:2026-11-16:dry-run:123', persisted: false })
  assert.ok(!db.filters.some(([op]) => op === 'neq'))
  assert.ok(db.filters.some(f => f[0] === 'eq' && f[1] === 'dry_run' && f[2] === false))
  assert.ok(db.filters.some(f => f[0] === 'is' && f[1] === 'test_email' && f[2] === null))
  assert.deepEqual(db.filters.find(f => f[0] === 'in'), ['in', 'status', ['sent', 'partial']])
})

test('persisted sends exclude only their actual run and retain bounded latest history', () => {
  const db = database()
  const id = '80c1d122-1c6c-410f-80a8-7212dd8740a7'
  newsletterHistoryQuery(db, { id, persisted: true })
  assert.deepEqual(db.filters.find(f => f[0] === 'neq'), ['neq', 'id', id])
  assert.deepEqual(db.filters.slice(-2), [['order', 'created_at', { ascending: false }], ['limit', 100]])
})
