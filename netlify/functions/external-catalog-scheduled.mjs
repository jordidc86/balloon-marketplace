// The only external-catalogue schedule. Background work does not run in visitors' requests.
export const config = { schedule: '0 4 * * *' }

export default async function externalCatalogScheduled() {
  const secret = process.env.CRON_SECRET
  if (!secret) return new Response('Missing configuration', { status: 500 })
  try {
    const response = await fetch('https://aerotrade.app/.netlify/functions/external-catalog-background', {
      method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000),
    })
    if (response.status !== 202) throw new Error('Dispatch failed')
    console.log('External catalogue refresh queued; database receipts confirm completion.')
    return new Response('Queued', { status: 202 })
  } catch { return new Response('Refresh dispatch unverified', { status: 502 }) }
}
