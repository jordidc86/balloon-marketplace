const defaultSiteUrl = 'https://aerotrade.app'
const netlifySiteHost = 'aerotrade-mvp-app.netlify.app'

const normalizePublicSiteUrl = (value: string | undefined) => {
  const candidate = value?.trim().replace(/\/+$/, '')

  if (!candidate) {
    return defaultSiteUrl
  }

  try {
    const url = new URL(candidate)

    if (url.hostname === netlifySiteHost) {
      return defaultSiteUrl
    }

    return url.origin
  } catch {
    return defaultSiteUrl
  }
}

export const siteUrl = normalizePublicSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)

export const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@aerotrade.app'
