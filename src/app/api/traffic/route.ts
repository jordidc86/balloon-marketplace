import { createClient, createAdminClient } from '@/utils/supabase/server'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import { trafficSource, validTrafficEvent } from '@/utils/traffic.mjs'
import { validContactClick, sellerContactLinks } from '@/utils/contact-links.mjs'
import { canRevealSellerContact } from '@/utils/listing-safety.mjs'
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
    if (!event || (body.channel !== undefined && !validContactClick(body))) return new Response(null, { status: 400, headers })
    const context = normalizeCommercialContext(body.context)
    if (!context.visitorId) return empty()
    const client = await createClient()
    const { data: { user } } = await client.auth.getUser()
    const admin = await createAdminClient()
    let isPremium = false
    if (user) {
      const { data: profile, error } = await admin.from('users').select('role,is_premium').eq('id', user.id).single()
      if (error || profile?.role === 'admin') return empty()
      isPremium = Boolean(profile?.is_premium)
    }
    const journey = commercialJourneyKey({ principal: user?.id || context.visitorId, secret: process.env.SUPABASE_SERVICE_ROLE_KEY })
    if (!journey) return empty()
    const source = trafficSource(body.context)
    if (body.channel) {
      const listingId = event.path.slice(9)
      const {data: listing,error: listingError} = await admin.from('listings').select('id,seller_id,status,public_at,contact_email,contact_phone').eq('id',listingId).maybeSingle()
      if (listingError || !listing || listing.seller_id === user?.id || !canRevealSellerContact({status:listing.status,publicAt:listing.public_at,sellerId:listing.seller_id},{userId:user?.id,isPremium})) return empty()
      const links = sellerContactLinks({email:listing.contact_email,phone:listing.contact_phone,listingId})
      if (!links[body.channel as 'email'|'phone'|'whatsapp']) return empty()
      const {error} = await admin.rpc('record_contact_click',{p_journey:journey,p_listing:listingId,p_channel:body.channel,p_source:source.source,p_campaign:source.campaign})
      return error ? new Response(null,{status:503,headers}) : empty()
    }
    const { error } = await admin.rpc('record_web_traffic', { p_event_id: event.eventId, p_journey: journey, p_path: event.path, p_source: source.source, p_medium: source.medium, p_campaign: source.campaign })
    if (error) return new Response(null, { status: 503, headers })
    return empty()
  } catch { return new Response(null, { status: 400, headers }) }
}
