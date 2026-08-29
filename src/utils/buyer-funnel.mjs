export const buyerFunnelMeasurementStartedAt = '2026-08-29T13:37:34.312Z'

const eventTypes = Object.freeze({
  views: 'VIEW',
  ctaClicks: 'ENQUIRY_CTA_CLICKED',
  formViews: 'ENQUIRY_FORM_VIEWED',
  formStarts: 'ENQUIRY_FORM_STARTED',
})

const validTimestamp = (value) => {
  const timestamp = new Date(value || '').getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

const rate = (numerator, denominator) => denominator > 0
  ? Number((numerator / denominator).toFixed(4))
  : null

/**
 * @param {{
 *   events?: Array<{ created_at?: string | null, event_type?: string | null }>,
 *   inquiries?: Array<{ created_at?: string | null }>,
 *   now?: Date | string,
 *   rollingDays?: number,
 * }} [input]
 */
export function buildComparableBuyerFunnel({ events = [], inquiries = [], now = new Date(), rollingDays = 30 } = {}) {
  const nowMs = validTimestamp(now)
  if (nowMs === null) throw new Error('A valid current time is required')
  const boundedDays = Number.isFinite(rollingDays) && rollingDays > 0 ? Math.min(Math.floor(rollingDays), 365) : 30
  const measurementStartMs = new Date(buyerFunnelMeasurementStartedAt).getTime()
  const rollingStartMs = nowMs - boundedDays * 86_400_000
  const comparableFromMs = Math.max(measurementStartMs, rollingStartMs)
  const inCohort = (row) => {
    const timestamp = validTimestamp(row?.created_at)
    return timestamp !== null && timestamp >= comparableFromMs && timestamp <= nowMs
  }
  const sourceEvents = Array.isArray(events) ? events : []
  const cohortEvents = sourceEvents.filter(inCohort)
  const cohortInquiries = Array.isArray(inquiries) ? inquiries.filter(inCohort) : []
  const count = (type) => cohortEvents.filter((event) => event.event_type === type).length
  const views = count(eventTypes.views)
  const ctaClicks = count(eventTypes.ctaClicks)
  const formViews = count(eventTypes.formViews)
  const formStarts = count(eventTypes.formStarts)
  const storedInquiries = cohortInquiries.length

  return {
    measurementStartedAt: buyerFunnelMeasurementStartedAt,
    comparableFrom: new Date(comparableFromMs).toISOString(),
    observedDays: Number(Math.max(0, (nowMs - comparableFromMs) / 86_400_000).toFixed(2)),
    excludedEarlierEvents: sourceEvents.filter((event) => {
      const timestamp = validTimestamp(event?.created_at)
      return timestamp !== null && timestamp < comparableFromMs
    }).length,
    views,
    ctaClicks,
    formViews,
    formStarts,
    storedInquiries,
    rates: {
      viewToCta: rate(ctaClicks, views),
      formViewToStart: rate(formStarts, formViews),
      formStartToStoredInquiry: rate(storedInquiries, formStarts),
    },
  }
}
