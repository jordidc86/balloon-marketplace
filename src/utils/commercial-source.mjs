const bounded = (value, max) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

const safeHostname = (value) => {
  const candidate = bounded(value, 500)
  if (!candidate) return null
  try {
    return new URL(candidate.includes('://') ? candidate : `https://${candidate}`).hostname.toLowerCase().slice(0, 255) || null
  } catch {
    return null
  }
}

export function mergeCommercialSource({ currentUrl, documentReferrer, siteHostname, saved } = {}) {
  let params = new URLSearchParams()
  try {
    params = new URL(currentUrl || 'https://invalid.local').searchParams
  } catch {
    params = new URLSearchParams()
  }

  const ownHost = safeHostname(siteHostname)
  const referrerHost = safeHostname(documentReferrer)
  const sameSite = referrerHost && ownHost
    ? referrerHost.replace(/^www\./, '') === ownHost.replace(/^www\./, '')
    : false
  const externalReferrerHost = referrerHost && !sameSite ? referrerHost : null
  const current = {
    referrerHost: externalReferrerHost,
    utmSource: bounded(params.get('utm_source'), 120),
    utmMedium: bounded(params.get('utm_medium'), 120),
    utmCampaign: bounded(params.get('utm_campaign'), 120),
  }
  const savedSource = saved && typeof saved === 'object' ? {
    referrerHost: safeHostname(saved.referrerHost),
    utmSource: bounded(saved.utmSource, 120),
    utmMedium: bounded(saved.utmMedium, 120),
    utmCampaign: bounded(saved.utmCampaign, 120),
  } : { referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null }

  const hasCurrentCampaign = Boolean(current.utmSource || current.utmMedium || current.utmCampaign)
  if (current.referrerHost) return current
  if (hasCurrentCampaign) return { ...current, referrerHost: savedSource.referrerHost }
  return savedSource
}
