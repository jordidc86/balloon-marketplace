export const newBalloonManufacturers = [
  {
    slug: 'pasha',
    name: 'Pasha Balloons',
    shortName: 'Pasha',
    path: '/new-balloon/pasha',
    headline: 'Plan a factory-new Pasha balloon with AeroTrade.',
    description: 'Tell us the capacity, intended use and operating country. AeroTrade will turn that context into an indicative configuration and budget direction for a new Pasha balloon.',
  },
  {
    slug: 'schroeder',
    name: 'Schroeder Fire Balloons',
    shortName: 'Schroeder',
    path: '/new-balloon/schroeder',
    headline: 'Plan a factory-new Schroeder balloon with AeroTrade.',
    description: 'Tell us the capacity, intended use and operating country. AeroTrade will turn that context into an indicative configuration and budget direction for a new Schroeder balloon.',
  },
]

export const getNewBalloonManufacturer = (value) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return newBalloonManufacturers.find((manufacturer) => manufacturer.slug === normalized) || null
}

export const normalizeNewBalloonManufacturerPreference = (value) => (
  getNewBalloonManufacturer(value)?.slug || 'advice'
)

const normalizedManufacturerWords = (value) => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  : ''

export const inferNewBalloonManufacturerPreference = (...values) => {
  const words = values.map(normalizedManufacturerWords).filter(Boolean).join(' ')
  const matches = new Set()
  if (/(?:^|\s)pasha(?:\s|$)/.test(words)) matches.add('pasha')
  if (/(?:^|\s)(?:schroeder|schroder)(?:\s|$)/.test(words)) matches.add('schroeder')
  return matches.size === 1 ? [...matches][0] : 'advice'
}

const blankFunnel = () => ({
  preferredRequests: 0,
  proposals: 0,
  acceptedProposals: 0,
  wonOutcomes: 0,
  settledRevenueMinorByCurrency: {},
})

const manufacturerBucket = (value) => {
  const manufacturer = getNewBalloonManufacturer(value)
  if (manufacturer) return manufacturer.slug
  return value === 'advice' ? 'advice' : 'other'
}

/**
 * @param {{
 *   quotes?: Array<Record<string, any>>,
 *   proposals?: Array<Record<string, any>>,
 *   outcomes?: Array<Record<string, any>>,
 * }} input
 */
export const buildNewBalloonManufacturerFunnel = ({ quotes = [], proposals = [], outcomes = [] } = {}) => {
  const funnel = {
    pasha: blankFunnel(),
    schroeder: blankFunnel(),
    advice: blankFunnel(),
    other: blankFunnel(),
  }
  const quoteById = new Map(quotes.map((quote) => [String(quote.id), quote]))
  const latestProposalByQuote = new Map()

  for (const quote of quotes) {
    funnel[manufacturerBucket(quote.manufacturer_preference)].preferredRequests += 1
  }

  for (const proposal of [...proposals].sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))) {
    const bucket = manufacturerBucket(proposal.manufacturer)
    funnel[bucket].proposals += 1
    if (proposal.delivery_status === 'accepted') funnel[bucket].acceptedProposals += 1
    if (!latestProposalByQuote.has(String(proposal.quote_request_id))) {
      latestProposalByQuote.set(String(proposal.quote_request_id), proposal)
    }
  }

  for (const outcome of outcomes) {
    if (outcome.entity_type !== 'quote_request') continue
    const entityId = String(outcome.entity_id)
    const quote = quoteById.get(entityId)
    const latestProposal = latestProposalByQuote.get(entityId)
    const bucket = manufacturerBucket(latestProposal?.manufacturer || quote?.manufacturer_preference)
    funnel[bucket].wonOutcomes += 1
    if (outcome.evidence_level !== 'settled') continue
    const currency = String(outcome.currency || 'unknown').toUpperCase()
    funnel[bucket].settledRevenueMinorByCurrency[currency] = (
      funnel[bucket].settledRevenueMinorByCurrency[currency] || 0
    ) + Number(outcome.aerotrade_revenue_minor || 0)
  }

  return funnel
}
