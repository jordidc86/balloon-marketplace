export const openInquiryStatuses = ['NEW', 'SELLER_NOTIFIED']
export const openQuoteStatuses = ['NEW']
export const opportunityFollowupDelayMs = 24 * 60 * 60 * 1000
export const premiumListingRecoveryDelayMs = 24 * 60 * 60 * 1000
export const sellerEnquiryEscalationDelayMs = 48 * 60 * 60 * 1000

export function isOpportunityFollowupDue(lastActivityAt, now = new Date(), delayMs = opportunityFollowupDelayMs) {
  const activity = new Date(lastActivityAt).getTime()
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(activity) && Number.isFinite(current) && current - activity >= delayMs
}

export function getOpportunityFollowupCutoff(now = new Date(), delayMs = opportunityFollowupDelayMs) {
  return new Date(now.getTime() - delayMs).toISOString()
}

export function getSellerEnquiryEscalationCutoff(now = new Date(), delayMs = sellerEnquiryEscalationDelayMs) {
  return new Date(now.getTime() - delayMs).toISOString()
}

export function isSellerEnquiryEscalationDue(
  { inquiryStatus, reminderStatus, reminderAcceptedAt },
  now = new Date(),
  delayMs = sellerEnquiryEscalationDelayMs,
) {
  return openInquiryStatuses.includes(inquiryStatus)
    && reminderStatus === 'accepted'
    && isOpportunityFollowupDue(reminderAcceptedAt, now, delayMs)
}

export function isPremiumListingRecoveryCandidate(
  { status, listingPlan, createdAt },
  now = new Date(),
  delayMs = premiumListingRecoveryDelayMs,
) {
  return status === 'PENDING_PAYMENT'
    && listingPlan === 'premium'
    && isOpportunityFollowupDue(createdAt, now, delayMs)
}
