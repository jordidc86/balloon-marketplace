export function getSafeRedirectPath(value, fallback = '/dashboard') {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) {
    return fallback
  }

  return trimmed
}

export function getApplicationOrigin(requestOrigin, configuredSiteUrl, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv !== 'production' && requestOrigin) {
    try {
      const url = new URL(requestOrigin)
      const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'

      if (isLocalHost && (url.protocol === 'http:' || url.protocol === 'https:')) {
        return url.origin
      }
    } catch {
      // Fall back to the configured public URL.
    }
  }

  return configuredSiteUrl
}
