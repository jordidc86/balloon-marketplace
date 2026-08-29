import { mergeCommercialSource } from '@/utils/commercial-source.mjs'

export type BrowserCommercialContext = {
  visitorId: string | null
  referrer: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
}

const visitorStorageKey = 'aerotrade:visitor-id'
const sourceStorageKey = 'aerotrade:commercial-source:v1'

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

  let savedSource: unknown = null
  try {
    const raw = window.sessionStorage.getItem(sourceStorageKey)
    savedSource = raw ? JSON.parse(raw) : null
  } catch {
    savedSource = null
  }
  const source = mergeCommercialSource({
    currentUrl: window.location.href,
    documentReferrer: document.referrer,
    siteHostname: window.location.hostname,
    saved: savedSource,
  })
  try {
    if (source.referrerHost || source.utmSource || source.utmMedium || source.utmCampaign) {
      window.sessionStorage.setItem(sourceStorageKey, JSON.stringify(source))
    }
  } catch {
    // Attribution is optional and must never block a commercial action.
  }
  return {
    visitorId,
    referrer: source.referrerHost ? `https://${source.referrerHost}` : '',
    utmSource: source.utmSource,
    utmMedium: source.utmMedium,
    utmCampaign: source.utmCampaign,
  }
}
