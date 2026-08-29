import crypto from 'node:crypto'

const currencies = new Set(['EUR', 'GBP', 'USD'])
const manufacturers = new Set(['pasha', 'schroeder'])

const value = (formData, key, max = 2000) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim().replace(/\r\n/g, '\n').slice(0, max) : ''
}

const money = (raw, label) => {
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(raw)) throw new Error(`${label} is invalid`)
  const minor = Math.round(Number(raw.replace(',', '.')) * 100)
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error(`${label} must be positive`)
  return minor
}

export function parseNewBalloonProposal(formData, now = new Date()) {
  const manufacturer = value(formData, 'proposal_manufacturer', 30).toLowerCase()
  const currency = value(formData, 'proposal_currency', 3).toUpperCase()
  if (!manufacturers.has(manufacturer)) throw new Error('Choose Pasha or Schroeder')
  if (!currencies.has(currency)) throw new Error('Proposal currency is invalid')

  const amountMinMinor = money(value(formData, 'proposal_amount_min', 20), 'Minimum amount')
  const amountMaxMinor = money(value(formData, 'proposal_amount_max', 20), 'Maximum amount')
  if (amountMinMinor > amountMaxMinor) throw new Error('Minimum amount cannot exceed maximum amount')

  const configurationSummary = value(formData, 'proposal_configuration', 2000)
  const deliveryGuidance = value(formData, 'proposal_delivery_guidance', 500)
  const terms = value(formData, 'proposal_terms', 2000)
  if (configurationSummary.length < 20) throw new Error('Add a meaningful configuration summary')
  if (deliveryGuidance.length < 5) throw new Error('Add delivery guidance')

  const validUntil = value(formData, 'proposal_valid_until', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw new Error('Proposal validity date is invalid')
  const validity = new Date(`${validUntil}T23:59:59.999Z`)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const latest = new Date(today.getTime() + 366 * 86_400_000)
  if (!Number.isFinite(validity.getTime()) || validity < today || validity > latest) throw new Error('Proposal validity must be between today and one year from now')

  return {
    manufacturer,
    currency,
    amount_min_minor: amountMinMinor,
    amount_max_minor: amountMaxMinor,
    configuration_summary: configurationSummary,
    delivery_guidance: deliveryGuidance,
    valid_until: validUntil,
    terms: terms || null,
  }
}

export function newBalloonProposalFingerprint(quoteRequestId, proposal) {
  return crypto.createHash('sha256').update(JSON.stringify({ quoteRequestId, ...proposal })).digest('hex')
}

