export const listingCommercialIntentStages = Object.freeze([
  'ENQUIRY_CTA_CLICKED',
  'ENQUIRY_FORM_VIEWED',
  'ENQUIRY_FORM_STARTED',
])

export function normalizeListingCommercialIntentStage(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return listingCommercialIntentStages.includes(normalized) ? normalized : null
}
