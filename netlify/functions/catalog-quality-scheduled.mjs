const normalizePublicSiteUrl = (value) => {
  const fallback = 'https://aerotrade.app'
  const candidate = value?.trim().replace(/\/+$/, '')
  if (!candidate) return fallback
  try {
    const url = new URL(candidate)
    return url.hostname.endsWith('.netlify.app') ? fallback : url.origin
  } catch {
    return fallback
  }
}

const catalogQualityScheduled = async () => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return new Response('Missing CRON_SECRET', { status: 500 })

  const response = await fetch(`${normalizePublicSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)}/api/cron/catalog-quality?commit=1`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  const body = await response.text()
  if (!response.ok) {
    console.error('Scheduled catalog quality check failed:', body)
    return new Response(body, { status: response.status })
  }
  console.log('Scheduled catalog quality check completed:', body)
  return new Response(body)
}

export default catalogQualityScheduled

export const config = {
  schedule: '30 5 * * *',
}
