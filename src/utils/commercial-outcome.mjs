const supportedCurrencies = new Set(['EUR', 'GBP', 'USD'])
const supportedEvidence = new Set(['reported', 'documented', 'settled'])
const supportedOutcomes = new Set(['sale', 'intermediation', 'other'])

const stringValue = (formData, key) => {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim() : ''
}

const amountToMinor = (raw, label) => {
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(raw)) throw new Error(`${label} is invalid`)
  const amount = Number(raw.replace(',', '.'))
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} is invalid`)
  return Math.round(amount * 100)
}

export function parseCommercialOutcome(formData) {
  const currency = stringValue(formData, 'currency').toUpperCase()
  const evidenceLevel = stringValue(formData, 'evidence_level').toLowerCase()
  const outcomeType = stringValue(formData, 'outcome_type').toLowerCase()
  if (!supportedCurrencies.has(currency)) throw new Error('Currency is invalid')
  if (!supportedEvidence.has(evidenceLevel)) throw new Error('Evidence level is invalid')
  if (!supportedOutcomes.has(outcomeType)) throw new Error('Outcome type is invalid')

  const grossAmountMinor = amountToMinor(stringValue(formData, 'gross_amount'), 'Gross amount')
  const aerotradeRevenueMinor = amountToMinor(stringValue(formData, 'aerotrade_revenue'), 'AeroTrade revenue')
  if (aerotradeRevenueMinor > grossAmountMinor) throw new Error('AeroTrade revenue cannot exceed gross amount')

  const notes = stringValue(formData, 'outcome_notes')
  if (notes.length > 2000) throw new Error('Outcome notes are too long')

  return {
    outcome_type: outcomeType,
    currency,
    gross_amount_minor: grossAmountMinor,
    aerotrade_revenue_minor: aerotradeRevenueMinor,
    evidence_level: evidenceLevel,
    notes: notes || null,
  }
}
