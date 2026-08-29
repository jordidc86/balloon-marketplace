const evidenceLevels = new Set(['reported', 'documented', 'settled'])
const evidenceSources = new Set(['operator_report', 'invoice', 'stripe_balance_transaction', 'bank_statement', 'other_document'])

const field = (formData, key) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const amountToMinor = (raw, label) => {
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(raw)) throw new Error(`${label} is invalid`)
  const amount = Number(raw.replace(',', '.'))
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} is invalid`)
  return Math.round(amount * 100)
}

export function parseCommercialEconomics(formData) {
  const directCostMinor = amountToMinor(field(formData, 'direct_cost'), 'Direct cost')
  const paymentFeeMinor = amountToMinor(field(formData, 'payment_fee'), 'Payment fee')
  const taxAmountMinor = amountToMinor(field(formData, 'tax_amount'), 'Tax amount')
  const evidenceLevel = field(formData, 'economics_evidence_level').toLowerCase()
  const evidenceSource = field(formData, 'economics_evidence_source').toLowerCase()
  const evidenceReference = field(formData, 'economics_evidence_reference')
  const notes = field(formData, 'economics_notes')

  if (!evidenceLevels.has(evidenceLevel)) throw new Error('Economics evidence level is invalid')
  if (!evidenceSources.has(evidenceSource)) throw new Error('Economics evidence source is invalid')
  if (evidenceReference && (evidenceReference.length < 3 || evidenceReference.length > 200)) throw new Error('Economics evidence reference is invalid')
  if (notes.length > 2000) throw new Error('Economics notes are too long')
  if (evidenceLevel === 'reported' && (evidenceSource !== 'operator_report' || evidenceReference)) {
    throw new Error('Reported economics must use an operator report without a document reference')
  }
  if (evidenceLevel === 'documented' && (evidenceSource === 'operator_report' || !evidenceReference)) {
    throw new Error('Documented economics require a document source and reference')
  }
  if (evidenceLevel === 'settled' && (!['stripe_balance_transaction', 'bank_statement'].includes(evidenceSource) || !evidenceReference)) {
    throw new Error('Settled economics require a bank statement or Stripe balance-transaction reference')
  }

  return {
    direct_cost_minor: directCostMinor,
    payment_fee_minor: paymentFeeMinor,
    tax_amount_minor: taxAmountMinor,
    economics_evidence_level: evidenceLevel,
    economics_evidence_source: evidenceSource,
    economics_evidence_reference: evidenceReference || null,
    economics_notes: notes || null,
  }
}

export function commercialContributionMinor(revenueMinor, economics) {
  if (!economics || [economics.direct_cost_minor, economics.payment_fee_minor, economics.tax_amount_minor].some((value) => value === null || value === undefined)) return null
  return Number(revenueMinor || 0)
    - Number(economics.direct_cost_minor)
    - Number(economics.payment_fee_minor)
    - Number(economics.tax_amount_minor)
}
