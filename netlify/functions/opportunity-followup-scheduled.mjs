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

const opportunityFollowupScheduled = async () => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return new Response('Missing CRON_SECRET', { status: 500 })
  const response = await fetch(`${normalizePublicSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)}/api/cron/opportunity-followup?commit=1`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  const body = await response.text()
  if (!response.ok) {
    console.error('Scheduled commercial opportunity follow-up failed:', body)
    return new Response(body, { status: response.status })
  }
  console.log('Scheduled commercial opportunity follow-up completed:', body)
  return new Response(body)
}

export default opportunityFollowupScheduled

export const config = {
  schedule: '0 6 * * *',
}
