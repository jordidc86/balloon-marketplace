const socialScheduled = async () => {
  const siteUrl = normalizePublicSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('CRON_SECRET is missing; social publishing was not run.')
    return new Response('Missing CRON_SECRET', { status: 500 })
  }

  const response = await fetch(`${siteUrl}/api/cron/social?limit=1`, {
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  })

  const body = await response.text()

  if (!response.ok) {
    console.error('Scheduled social publishing failed:', body)
    return new Response(body, { status: response.status })
  }

  console.log('Scheduled social publishing completed:', body)
  return new Response(body)
}

export default socialScheduled

export const config = {
  schedule: '0 7 * * *',
}

const normalizePublicSiteUrl = (value) => {
  const fallback = 'https://aerotrade.app'
  const candidate = value?.trim().replace(/\/+$/, '')

  if (!candidate) {
    return fallback
  }

  try {
    const url = new URL(candidate)
    return url.hostname.endsWith('.netlify.app') ? fallback : url.origin
  } catch {
    return fallback
  }
}
