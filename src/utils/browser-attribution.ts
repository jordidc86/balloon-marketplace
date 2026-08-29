export type BrowserCommercialContext = {
  visitorId: string | null
  referrer: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
}

const visitorStorageKey = 'aerotrade:visitor-id'

export function getBrowserCommercialContext(): BrowserCommercialContext {
  let visitorId: string | null = null
  try {
    visitorId = window.localStorage.getItem(visitorStorageKey)
    if (!visitorId) {
      visitorId = window.crypto.randomUUID()
      window.localStorage.setItem(visitorStorageKey, visitorId)
    }
  } catch {
    visitorId = null
  }

  const params = new URLSearchParams(window.location.search)
  return {
    visitorId,
    referrer: document.referrer,
    utmSource: params.get('utm_source'),
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
  }
}

