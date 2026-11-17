import assert from 'node:assert/strict'
import test from 'node:test'
import { formatFlightHours } from '../src/utils/flight-hours.mjs'

test('flight hours hide binary fractions while preserving the stated flight time', () => {
  assert.equal(formatFlightHours(18.166666666666668), '18 h 10 min')
  assert.equal(formatFlightHours('18.166666666666668'), '18 h 10 min')
  assert.equal(formatFlightHours('18,166666666666668'), '18 h 10 min')
  assert.equal(formatFlightHours(381), '381 h')
  assert.equal(formatFlightHours(0), '0 h')
  assert.equal(formatFlightHours('630:05'), '630 h 5 min')
  assert.equal(formatFlightHours(1.99999999), '2 h')
  assert.equal(formatFlightHours(0.5), '0 h 30 min')
})
test('missing or malformed hours are omitted rather than advertised as a duration', () => {
  for (const v of [null, undefined, '', ' ', 'unknown', '1:99', -1, Infinity, NaN, 100001, {}, true]) {
    assert.equal(formatFlightHours(v), null, String(v))
  }
})
