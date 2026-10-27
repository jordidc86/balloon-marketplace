import { timingSafeEqual } from 'node:crypto'
import { runSocialWorkflow } from '../../src/utils/social-workflow'
import { withSocialBudget } from '../../src/utils/social-request.mjs'

async function runSocialPublishBackground(request: Request) {
  const secret = process.env.CRON_SECRET
  const supplied = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || request.method !== 'POST' || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    console.error('Unauthorized social background invocation rejected.')
    return
  }
  // Scheduled payloads are tiny. Reject unbounded bodies before buffering.
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing social dispatch body')
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.length
    if (bytes > 1024) { await reader.cancel(); throw new Error('Invalid social dispatch size') }
    chunks.push(value)
  }
  const { scheduledAt } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const timestamp = Date.parse(scheduledAt)
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > 15 * 60_000 || timestamp > Date.now() + 60_000) throw new Error('Invalid social dispatch timestamp')
  // Leave headroom within Netlify's background-function limit. Receipts block
  // automatic duplicate publishing if an invocation stops after provider acceptance.
  const response = await withSocialBudget(10 * 60_000, () => runSocialWorkflow(
    new Request('https://aerotrade.app/api/cron/social?limit=1', { headers: { authorization: `Bearer ${secret}` } }),
    new Date(timestamp).toISOString(),
  ))
  console.log(JSON.stringify({ kind: 'social_background_result', status: response.status }))
  // A controlled failure is recorded for manual review. Do not ask Netlify to
  // restart content selection and potentially publish a different listing.
  if (!response.ok) console.error('Social background workflow requires receipt review.')
}

export const config = { background: true }

export default async function socialPublishBackground(request: Request) {
  try { await runSocialPublishBackground(request) }
  catch { console.error('Social background result unverified; reconcile receipts before any manual retry.') }
}
