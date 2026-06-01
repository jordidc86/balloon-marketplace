export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://aerotrade.app'

export const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@aerotrade.app'
