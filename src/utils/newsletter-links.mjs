const periodKeyPattern = /^[0-9]{4}-[0-9]{2}-(01|16)$/
const listingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const newsletterAttribution = Object.freeze({
  source: 'newsletter',
  medium: 'email',
  campaignPrefix: 'biweekly_marketplace',
})

export function buildNewsletterCampaign(periodKey) {
  if (!periodKeyPattern.test(periodKey || '')) {
    throw new Error('A valid newsletter period key is required.')
  }

  return `${newsletterAttribution.campaignPrefix}_${periodKey}`
}

export function buildNewsletterListingUrl({ baseUrl, listingId, periodKey }) {
  if (!listingIdPattern.test(listingId || '')) {
    throw new Error('A valid listing id is required.')
  }

  const url = new URL(`/catalog/${listingId}`, baseUrl)
  url.searchParams.set('utm_source', newsletterAttribution.source)
  url.searchParams.set('utm_medium', newsletterAttribution.medium)
  url.searchParams.set('utm_campaign', buildNewsletterCampaign(periodKey))
  return url.toString()
}
