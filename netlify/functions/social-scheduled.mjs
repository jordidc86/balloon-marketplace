const socialScheduled = async () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || 'https://aerotrade.app'
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
