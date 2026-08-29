export const openInquiryStatuses = ['NEW', 'SELLER_NOTIFIED']
export const openQuoteStatuses = ['NEW']
export const opportunityFollowupDelayMs = 24 * 60 * 60 * 1000

export function isOpportunityFollowupDue(lastActivityAt, now = new Date(), delayMs = opportunityFollowupDelayMs) {
  const activity = new Date(lastActivityAt).getTime()
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(activity) && Number.isFinite(current) && current - activity >= delayMs
}

export function getOpportunityFollowupCutoff(now = new Date(), delayMs = opportunityFollowupDelayMs) {
  return new Date(now.getTime() - delayMs).toISOString()
}
