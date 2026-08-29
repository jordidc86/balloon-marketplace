import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { siteUrl } from '@/utils/site'
import {
  getUnnotifiedWantedMatchIds,
  isWantedMatchDispatchRetryable,
  listingMatchesWantedRequest,
  wantedMatchDispatchFingerprint,
} from '@/utils/wanted-request.mjs'

export const dynamic = 'force-dynamic'

type WantedRequest = {
  id: string
  buyer_name: string
  buyer_email: string
  category: string
  currency: string
  budget_max_minor: number | null
  notify_on_match: boolean
  status: string
}

type Listing = {
  id: string
  title: string
  category: string
  status: string
  currency: string
  price: number
  condition: string
  location_country: string
}

type MatchDispatch = {
  id: string
  wanted_request_id: string
  listing_ids: string[]
  match_fingerprint: string
  status: 'PENDING' | 'ACCEPTED' | 'FAILED' | 'CANCELLED'
  updated_at: string
}

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

const renderListing = (listing: Listing) => {
  const price = new Intl.NumberFormat('en-IE', { style: 'currency', currency: listing.currency }).format(Number(listing.price))
  return `<li style="margin-bottom:16px"><a href="${escapeHtml(`${siteUrl}/catalog/${listing.id}`)}"><strong>${escapeHtml(listing.title)}</strong></a><br />${escapeHtml(listing.condition)} · ${escapeHtml(listing.location_country)} · ${escapeHtml(price)}</li>`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const commit = new URL(request.url).searchParams.get('commit') === '1'
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const [wantedResult, listingResult, dispatchResult] = await Promise.all([
    supabase
      .from('wanted_requests')
      .select('id,buyer_name,buyer_email,category,currency,budget_max_minor,notify_on_match,status')
      .eq('notify_on_match', true)
      .not('status', 'in', '(CLOSED,SPAM)')
      .order('created_at', { ascending: true })
      .limit(200),
    supabase
      .from('listings')
      .select('id,title,category,status,currency,price,condition,location_country')
      .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('wanted_match_dispatches')
      .select('id,wanted_request_id,listing_ids,match_fingerprint,status,updated_at')
      .order('created_at', { ascending: true })
      .limit(2000),
  ])
  if (wantedResult.error || listingResult.error || dispatchResult.error) {
    return NextResponse.json({ error: 'Wanted-match state could not be loaded' }, { status: 500 })
  }

  const wantedRequests = (wantedResult.data || []) as WantedRequest[]
  const listings = (listingResult.data || []) as Listing[]
  const dispatches = (dispatchResult.data || []) as MatchDispatch[]
  const dispatchesByWanted = new Map<string, MatchDispatch[]>()
  for (const dispatch of dispatches) {
    const rows = dispatchesByWanted.get(dispatch.wanted_request_id) || []
    rows.push(dispatch)
    dispatchesByWanted.set(dispatch.wanted_request_id, rows)
  }
  const listingById = new Map(listings.map((listing) => [listing.id, listing]))
  const result = {
    consentedRequests: wantedRequests.length,
    candidatePairs: 0,
    dueDigests: 0,
    accepted: 0,
    alreadyAccepted: 0,
    failed: 0,
    cancelled: 0,
    pendingRecovery: 0,
    dryRun: !commit,
  }

  for (const wanted of wantedRequests) {
    const candidates = listings.filter((listing) => listingMatchesWantedRequest(listing, wanted))
    result.candidatePairs += candidates.length
    if (candidates.length === 0) continue
    const existing = dispatchesByWanted.get(wanted.id) || []
    const retry = existing.find((dispatch) => isWantedMatchDispatchRetryable(dispatch))
    const recentPending = existing.some((dispatch) => dispatch.status === 'PENDING' && !isWantedMatchDispatchRetryable(dispatch))
    if (!retry && recentPending) {
      result.pendingRecovery += 1
      continue
    }

    let dispatch = retry
    let digestListings = retry
      ? retry.listing_ids.map((id) => listingById.get(id)).filter((listing): listing is Listing => Boolean(listing && listingMatchesWantedRequest(listing, wanted)))
      : []

    if (!dispatch) {
      const newIds = getUnnotifiedWantedMatchIds(candidates.map((listing) => listing.id), existing, 5)
      if (newIds.length === 0) continue
      digestListings = newIds.map((id) => listingById.get(id)).filter((listing): listing is Listing => Boolean(listing))
      const fingerprint = wantedMatchDispatchFingerprint(wanted.id, newIds)
      if (!fingerprint) {
        result.failed += 1
        continue
      }
      result.dueDigests += 1
      if (!commit) continue
      const { data: created, error: createError } = await supabase
        .from('wanted_match_dispatches')
        .insert({
          wanted_request_id: wanted.id,
          listing_ids: newIds,
          match_fingerprint: fingerprint,
          status: 'PENDING',
        })
        .select('id,wanted_request_id,listing_ids,match_fingerprint,status,updated_at')
        .single()
      if (createError || !created?.id) {
        const { data: concurrent } = await supabase
          .from('wanted_match_dispatches')
          .select('id,wanted_request_id,listing_ids,match_fingerprint,status,updated_at')
          .eq('match_fingerprint', fingerprint)
          .maybeSingle()
        if (!concurrent?.id) {
          result.failed += 1
          continue
        }
        dispatch = concurrent as MatchDispatch
      } else {
        dispatch = created as MatchDispatch
      }
    } else {
      result.dueDigests += 1
      if (!commit) continue
    }

    if (!dispatch || digestListings.length === 0) {
      if (commit && dispatch) {
        const { data: cancelled } = await supabase
          .from('wanted_match_dispatches')
          .update({ status: 'CANCELLED', attempted_at: new Date().toISOString() })
          .eq('id', dispatch.id)
          .select('status')
          .single()
        if (cancelled?.status === 'CANCELLED') result.cancelled += 1
        else result.failed += 1
      }
      continue
    }

    try {
      const attemptedAt = new Date().toISOString()
      const { data: pending, error: pendingError } = await supabase
        .from('wanted_match_dispatches')
        .update({ status: 'PENDING', attempted_at: attemptedAt })
        .eq('id', dispatch.id)
        .select('id,status')
        .single()
      if (pendingError || pending?.status !== 'PENDING') throw new Error('Wanted-match dispatch did not enter pending state')

      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'wanted_match_buyer',
        entityType: 'wanted_request',
        entityId: wanted.id,
        recipientRole: 'buyer',
        to: wanted.buyer_email,
        subject: `AeroTrade found ${digestListings.length === 1 ? 'a possible match' : 'possible matches'} for your request`,
        html: `<h2>Potential equipment matches are now available</h2>
        <p>Hello ${escapeHtml(wanted.buyer_name)},</p>
        <p>AeroTrade found ${digestListings.length === 1 ? 'one active listing' : `${digestListings.length} active listings`} matching the category, currency and maximum budget recorded in your private wanted request.</p>
        <ul>${digestListings.map(renderListing).join('')}</ul>
        <p>Please review the complete advert and confirm specifications, documents, condition and suitability directly with the seller before making a decision.</p>
        <p>This is an operational match alert you requested, not a marketing campaign. AeroTrade will not repeat these same listings.</p>`,
        idempotencyKey: `wanted-match-${dispatch.match_fingerprint}`,
      })

      const acceptedAt = new Date().toISOString()
      const nextStatus = delivery.success ? 'ACCEPTED' : 'FAILED'
      const { data: dispatchReadback, error: dispatchError } = await supabase
        .from('wanted_match_dispatches')
        .update({
          status: nextStatus,
          provider_message_id: delivery.providerMessageId || null,
          attempted_at: acceptedAt,
          accepted_at: delivery.success ? acceptedAt : null,
        })
        .eq('id', dispatch.id)
        .select('status,provider_message_id')
        .single()
      if (dispatchError || dispatchReadback?.status !== nextStatus) throw new Error('Wanted-match result did not persist')

      if (delivery.success) {
        await supabase
          .from('wanted_requests')
          .update({ status: 'MATCHED', last_activity_at: acceptedAt })
          .eq('id', wanted.id)
          .in('status', ['NEW', 'REVIEWING'])
        if (delivery.duplicate) result.alreadyAccepted += 1
        else result.accepted += 1
      } else {
        result.failed += 1
      }
    } catch (error) {
      console.error('Wanted-match dispatch failed:', error)
      await supabase.from('wanted_match_dispatches').update({ status: 'FAILED', attempted_at: new Date().toISOString() }).eq('id', dispatch.id)
      result.failed += 1
    }
  }

  const hasFailure = result.failed > 0
  return NextResponse.json(result, { status: hasFailure ? 502 : 200 })
}
