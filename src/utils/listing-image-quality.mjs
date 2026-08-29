export const listingImageObservations = {
  AVAILABLE: 'AVAILABLE',
  DEFINITELY_MISSING: 'DEFINITELY_MISSING',
  UNKNOWN: 'UNKNOWN',
}

const normalizeHost = (value) => String(value || '').trim().toLocaleLowerCase('en-US')

export function getAllowedListingImageHosts(supabaseUrl) {
  try {
    return [new URL(supabaseUrl).hostname.toLocaleLowerCase('en-US')]
  } catch {
    return []
  }
}

export function isAllowedListingImageUrl(value, allowedHostnames) {
  try {
    const url = new URL(value)
    const allowed = new Set((allowedHostnames || []).map(normalizeHost).filter(Boolean))
    return url.protocol === 'https:' && !url.username && !url.password && allowed.has(normalizeHost(url.hostname))
  } catch {
    return false
  }
}

export function classifyImageResponse(status, body = '') {
  if (status >= 200 && status < 400) return listingImageObservations.AVAILABLE
  if (status === 404 || status === 410) return listingImageObservations.DEFINITELY_MISSING
  if (status === 400 && /(?:NoSuchKey|Object\s+not\s+found|not\s+found)/i.test(String(body).slice(0, 4096))) {
    return listingImageObservations.DEFINITELY_MISSING
  }
  return listingImageObservations.UNKNOWN
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timeout)
  }
}

export async function probeListingImageUrl(
  url,
  { allowedHostnames, fetchImpl = fetch, timeoutMs = 6000 } = {},
) {
  if (!isAllowedListingImageUrl(url, allowedHostnames)) {
    return { observation: listingImageObservations.UNKNOWN, reason: 'host_not_allowed' }
  }

  try {
    const head = await fetchWithTimeout(fetchImpl, url, { method: 'HEAD', cache: 'no-store' }, timeoutMs)
    const headObservation = classifyImageResponse(head.status)
    await head.body?.cancel().catch(() => undefined)
    if (headObservation === listingImageObservations.AVAILABLE || headObservation === listingImageObservations.DEFINITELY_MISSING) {
      return { observation: headObservation, reason: 'head' }
    }
  } catch {
    // A failed HEAD is inconclusive. Some image hosts support GET only.
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      cache: 'no-store',
    }, timeoutMs)
    let body = ''
    if (response.status === 400) body = (await response.text()).slice(0, 4096)
    else await response.body?.cancel().catch(() => undefined)
    return { observation: classifyImageResponse(response.status, body), reason: 'get' }
  } catch {
    return { observation: listingImageObservations.UNKNOWN, reason: 'request_failed' }
  }
}

export async function probeListingImages(urls, options = {}) {
  const uniqueUrls = [...new Set((urls || []).filter((url) => typeof url === 'string' && url.trim()))]
  if (uniqueUrls.length === 0) {
    return { observation: listingImageObservations.DEFINITELY_MISSING, reachableCount: 0, missingCount: 0, unknownCount: 0 }
  }

  let missingCount = 0
  let unknownCount = 0
  for (const url of uniqueUrls) {
    const result = await probeListingImageUrl(url, options)
    if (result.observation === listingImageObservations.AVAILABLE) {
      return { observation: listingImageObservations.AVAILABLE, reachableCount: 1, missingCount, unknownCount }
    }
    if (result.observation === listingImageObservations.DEFINITELY_MISSING) missingCount += 1
    else unknownCount += 1
  }

  return {
    observation: unknownCount > 0 ? listingImageObservations.UNKNOWN : listingImageObservations.DEFINITELY_MISSING,
    reachableCount: 0,
    missingCount,
    unknownCount,
  }
}

export function getListingQualityTransition(current, observation, checkedAt, minimumSecondCheckMs = 60 * 60 * 1000) {
  if (observation === listingImageObservations.AVAILABLE) {
    return current && current.status !== 'RESOLVED' && current.status !== 'HEALTHY' ? 'RESOLVE' : 'NONE'
  }
  if (observation !== listingImageObservations.DEFINITELY_MISSING) return 'NONE'
  if (!current || current.status === 'RESOLVED' || current.status === 'HEALTHY') return 'SUSPECT'
  if (current.status === 'QUARANTINED') return 'NONE'
  if (current.status !== 'SUSPECT') return 'SUSPECT'

  const lastCheck = current.last_checked_at ? new Date(current.last_checked_at).getTime() : 0
  const thisCheck = new Date(checkedAt).getTime()
  return Number.isFinite(thisCheck) && thisCheck - lastCheck >= minimumSecondCheckMs ? 'QUARANTINE' : 'NONE'
}
