// Single existing scheduler: enqueue only, never wait for Meta publishing.
export default async function socialScheduled() {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return new Response('Missing CRON_SECRET', { status: 500 })
  try {
    const response = await fetch('https://aerotrade.app/.netlify/functions/social-publish-background', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(15_000),
    })
    // 202 confirms queue acceptance only. Per-placement receipts confirm Meta.
    if (response.status !== 202) throw new Error('Background dispatch was not accepted')
    console.log('Social job queued; provider acceptance remains unverified.')
    return new Response('Queued', { status: 202 })
  } catch {
    console.error('Social dispatch unverified; inspect background execution before retrying.')
    return new Response('Dispatch unverified', { status: 502 })
  }
}
export const config = { schedule: '0 7 * * *' }
