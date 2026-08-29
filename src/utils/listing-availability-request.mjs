const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function listingAvailabilityRequestIdempotencyKey(listingId, confirmationId = null) {
  if (!uuidPattern.test(String(listingId || ''))) throw new Error('Invalid listing identifier')
  if (confirmationId !== null && !uuidPattern.test(String(confirmationId))) throw new Error('Invalid confirmation identifier')
  return `listing-availability-request-${listingId}-${confirmationId || 'initial'}`
}

