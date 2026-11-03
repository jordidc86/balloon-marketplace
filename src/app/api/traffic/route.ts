import { createClient, createAdminClient } from '@/utils/supabase/server'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import { trafficSource, validTrafficEvent } from '@/utils/traffic.mjs'
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  const empty = () => new Response(null, { status: 204, headers })
  if (request.headers.get('origin') !== 'https://aerotrade.app') return new Response(null, { status: 403, headers })
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1' || /bot|crawler|spider|headless|preview|facebookexternalhit/i.test(request.headers.get('user-agent') || '')) return empty()
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 2048) return new Response(null, { status: 400, headers })
  try {
    const raw = await request.text()
    if (raw.length > 2048) return new Response(null, { status: 413, headers })
    const body = JSON.parse(raw)
    const event = validTrafficEvent(body)
    if (!event) return new Response(null, { status: 400, headers })
    const context = normalizeCommercialContext(body.context)
    if (!context.visitorId) return empty()
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    const admin = await createAdminClient()
    if (user) {
      const { data: profile, error } = await admin.from('users').select('role').eq('id', user.id).single()
      if (error || profile?.role === 'admin') return empty()
    }
    const journey = commercialJourneyKey({ principal: user?.id || context.visitorId, secret: process.env.SUPABASE_SERVICE_ROLE_KEY })
    if (!journey) return empty()
    const source = trafficSource(body.context)
    const { error } = await admin.rpc('record_web_traffic', { p_event_id: event.eventId, p_journey: journey, p_path: event.path, p_source: source.source, p_medium: source.medium, p_campaign: source.campaign })
    if (error) return new Response(null, { status: 503, headers })
    return empty()
  } catch { return new Response(null, { status: 400, headers }) }
}
