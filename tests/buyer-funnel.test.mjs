import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComparableBuyerFunnel, buyerFunnelMeasurementStartedAt } from '../src/utils/buyer-funnel.mjs'

test('buyer funnel excludes views collected before comparable stage instrumentation', () => {
  const funnel = buildComparableBuyerFunnel({
    now: new Date('2026-08-30T13:37:34.312Z'),
    events: [
      { event_type: 'VIEW', created_at: '2026-08-28T12:00:00Z' },
      { event_type: 'VIEW', created_at: '2026-08-29T14:00:00Z' },
      { event_type: 'ENQUIRY_CTA_CLICKED', created_at: '2026-08-29T14:01:00Z' },
      { event_type: 'ENQUIRY_FORM_VIEWED', created_at: '2026-08-29T14:02:00Z' },
      { event_type: 'ENQUIRY_FORM_STARTED', created_at: '2026-08-29T14:03:00Z' },
    ],
    inquiries: [{ created_at: '2026-08-29T14:04:00Z' }],
  })

  assert.equal(funnel.measurementStartedAt, buyerFunnelMeasurementStartedAt)
  assert.equal(funnel.excludedEarlierEvents, 1)
  assert.deepEqual({ views: funnel.views, clicks: funnel.ctaClicks, formViews: funnel.formViews, starts: funnel.formStarts, stored: funnel.storedInquiries }, { views: 1, clicks: 1, formViews: 1, starts: 1, stored: 1 })
  assert.deepEqual(funnel.rates, { viewToCta: 1, formViewToStart: 1, formStartToStoredInquiry: 1 })
})

test('buyer funnel reports missing denominators as unavailable rather than false zero conversion', () => {
  const funnel = buildComparableBuyerFunnel({ now: new Date('2026-08-30T00:00:00Z') })
  assert.equal(funnel.views, 0)
  assert.deepEqual(funnel.rates, { viewToCta: null, formViewToStart: null, formStartToStoredInquiry: null })
})

test('buyer funnel respects the rolling window once it is later than the instrumentation release', () => {
  const funnel = buildComparableBuyerFunnel({
    now: new Date('2026-10-01T00:00:00Z'),
    rollingDays: 7,
    events: [
      { event_type: 'VIEW', created_at: '2026-09-20T00:00:00Z' },
      { event_type: 'VIEW', created_at: '2026-09-30T00:00:00Z' },
    ],
  })
  assert.equal(funnel.comparableFrom, '2026-09-24T00:00:00.000Z')
  assert.equal(funnel.views, 1)
})
