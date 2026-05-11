export default async () => {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || 'https://aerotrade.app'
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('CRON_SECRET is missing; newsletter was not sent.')
    return new Response('Missing CRON_SECRET', { status: 500 })
  }

  const response = await fetch(`${siteUrl}/api/cron/newsletter?days=15&mix=true`, {
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  })

  const body = await response.text()

  if (!response.ok) {
    console.error('Scheduled newsletter failed:', body)
    return new Response(body, { status: response.status })
  }

  console.log('Scheduled newsletter completed:', body)
  return new Response(body)
}

export const config = {
  schedule: '0 9 1,16 * *',
}
