import { normalizeListingCountry } from './listing-country.mjs'

export const listingCategories = ['complete', 'envelopes', 'baskets', 'burners', 'bottom-end', 'cylinders', 'other-equipment']
export const listingConditions = ['New', 'Used-Excellent', 'Used-Good', 'Needs Repair']
export const listingCurrencies = ['EUR', 'GBP', 'USD']

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const value = (formData, key) => typeof formData.get(key) === 'string' ? formData.get(key).trim() : ''

const boundedText = (formData, key, min, max, label) => {
  const result = value(formData, key)
  if (result.length < min || result.length > max) throw new Error(`${label} must contain between ${min} and ${max} characters`)
  return result
}

const optionalText = (formData, key, max, label) => {
  const result = value(formData, key)
  if (result.length > max) throw new Error(`${label} is too long`)
  return result || null
}

const numberValue = (formData, key, min, max, label) => {
  const result = Number(value(formData, key))
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${label} is invalid`)
  return result
}

export function parseListingSubmission(formData, { requireDeclaration = true } = {}) {
  const category = value(formData, 'category')
  const condition = value(formData, 'condition')
  const currency = value(formData, 'currency')
  if (!listingCategories.includes(category)) throw new Error('Listing category is invalid')
  if (!listingConditions.includes(condition)) throw new Error('Listing condition is invalid')
  if (!listingCurrencies.includes(currency)) throw new Error('Listing currency is invalid')
  if (requireDeclaration && formData.get('seller_declaration') !== 'yes') {
    throw new Error('Please confirm that the listing is accurate and that you can prove your right to sell it')
  }

  const contactEmail = value(formData, 'contact_email').toLowerCase()
  if (!emailPattern.test(contactEmail) || contactEmail.length > 320) throw new Error('Contact email is invalid')

  const price = numberValue(formData, 'price', 0, 100_000_000, 'Price')
  const details = {
    seller_declaration: true,
    supporting_documents_available: formData.get('supporting_documents_available') === 'yes',
    last_inspection_date: optionalText(formData, 'last_inspection_date', 10, 'Last inspection date'),
  }

  if (['complete', 'envelopes'].includes(category)) {
    details.manufacturer = boundedText(formData, 'manufacturer', 2, 120, 'Manufacturer')
    details.model = boundedText(formData, 'model', 1, 120, 'Model or volume')
    details.year = numberValue(formData, 'year', 1900, new Date().getUTCFullYear() + 1, 'Year of manufacture')
    details.hours = numberValue(formData, 'hours', 0, 100_000, 'Total hours')
    details.registration = optionalText(formData, 'registration', 40, 'Registration')
    details.serial = boundedText(formData, 'serial', 1, 120, 'Serial number')
  }

  if (['baskets', 'burners', 'bottom-end'].includes(category)) {
    details.dimensions = optionalText(formData, 'dimensions', 200, 'Dimensions')
    details.type = optionalText(formData, 'type', 120, 'Equipment type')
  }

  return {
    category,
    title: boundedText(formData, 'title', 8, 160, 'Title'),
    description: boundedText(formData, 'description', 30, 5000, 'Description'),
    price,
    currency,
    condition,
    location_country: normalizeListingCountry(boundedText(formData, 'location_country', 2, 100, 'Country')),
    contact_email: contactEmail,
    contact_phone: optionalText(formData, 'contact_phone', 60, 'Contact phone'),
    details,
  }
}

export function getStoredListingPublicationIssues(listing) {
  if (!listing || !['complete', 'envelopes'].includes(listing.category)) return []
  const details = listing.details && typeof listing.details === 'object' ? listing.details : {}
  const issues = []
  if (typeof details.manufacturer !== 'string' || !details.manufacturer.trim()) issues.push('MISSING_MANUFACTURER')
  if (typeof details.model !== 'string' || !details.model.trim()) issues.push('MISSING_MODEL')
  if (!Number.isFinite(Number(details.year))) issues.push('MISSING_YEAR')
  if (!Number.isFinite(Number(details.hours))) issues.push('MISSING_HOURS')
  if (typeof details.serial !== 'string' || !details.serial.trim()) issues.push('MISSING_SERIAL')
  return issues
}

export function assertStoredListingRequiredFields(listing) {
  const issues = getStoredListingPublicationIssues(listing)
  if (issues.length > 0) {
    throw new Error(`Complete the required aircraft fields before publishing: ${issues.join(', ')}`)
  }
  return true
}
