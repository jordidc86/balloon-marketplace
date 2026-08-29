const supportedChannels = new Set(['AEROTRADE', 'OTHER_CHANNEL', 'NOT_DISCLOSED'])
const supportedCurrencies = new Set(['EUR', 'GBP', 'USD'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const formString = (formData, key) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

const optionalAmountMinor = (raw) => {
  if (!raw) return null
  if (!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Sale amount is invalid')
  const amount = Number(raw.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Sale amount is invalid')
  return Math.round(amount * 100)
}

export function parseListingClosure(formData, listingCurrency) {
  const action = formString(formData, 'closure_action').toUpperCase()
  const currency = String(listingCurrency || '').toUpperCase()
  if (!supportedCurrencies.has(currency)) throw new Error('Listing currency is invalid')

  if (action === 'WITHDRAWN') {
    return {
      action,
      sale_channel: null,
      marketplace_inquiry_id: null,
      gross_amount_minor: null,
      currency: null,
    }
  }
  if (action !== 'SOLD') throw new Error('Listing closure action is invalid')

  const saleChannel = formString(formData, 'sale_channel').toUpperCase()
  if (!supportedChannels.has(saleChannel)) throw new Error('Sale channel is invalid')
  const inquiryId = formString(formData, 'marketplace_inquiry_id') || null
  if (saleChannel === 'AEROTRADE' && (!inquiryId || !uuidPattern.test(inquiryId))) {
    throw new Error('Select the AeroTrade enquiry that led to the sale')
  }
  if (saleChannel !== 'AEROTRADE' && inquiryId) throw new Error('Only an AeroTrade sale can reference an enquiry')
  const grossAmountMinor = optionalAmountMinor(formString(formData, 'gross_amount'))

  return {
    action,
    sale_channel: saleChannel,
    marketplace_inquiry_id: inquiryId,
    gross_amount_minor: grossAmountMinor,
    currency: grossAmountMinor === null ? null : currency,
  }
}

