import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendEmail } from '@/utils/resend'
import { siteUrl } from '@/utils/site'
import {
  getAllowedListingImageHosts,
  getListingQualityTransition,
  listingImageObservations,
  probeListingImages,
} from '@/utils/listing-image-quality.mjs'
import { ensureReachableListingPrimaryImage } from '@/utils/listing-image-quality-server'

export const dynamic = 'force-dynamic'

type QualityState = {
  listing_id: string
  status: 'HEALTHY' | 'SUSPECT' | 'QUARANTINED' | 'RESOLVED'
  consecutive_failures: number
  last_checked_at: string
  previous_listing_status: 'ACTIVE_PUBLIC' | 'ACTIVE_PREMIUM' | null
  notification_status: 'not_sent' | 'pending' | 'accepted' | 'failed'
}

type Listing = {
  id: string
  seller_id: string
  title: string
  seller_account_email: string
  status: 'ACTIVE_PUBLIC' | 'ACTIVE_PREMIUM' | 'DRAFT'
  images?: Array<{ id: string; url: string; is_primary?: boolean | null }> | null
}

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

const upsertState = async (supabase: SupabaseClient, values: Record<string, unknown>) => {
  const { data, error } = await supabase
    .from('listing_quality_state')
    .upsert(values, { onConflict: 'listing_id' })
    .select('listing_id,status,consecutive_failures,last_checked_at,previous_listing_status,notification_status')
    .single()
  if (error || !data?.listing_id) throw new Error('Listing quality state did not persist')
  return data as QualityState
}

async function notifyQuarantinedSeller(supabase: SupabaseClient, listing: Listing) {
  const idempotencyKey = `listing-quality-quarantine-${listing.id}`
  const { data: existing } = await supabase
    .from('commercial_notification_receipts')
    .select('id,status')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing?.status === 'accepted') {
    await supabase.from('listing_quality_state').update({ notification_status: 'accepted' }).eq('listing_id', listing.id)
    return 'already_accepted'
  }

  let receiptId = existing?.id
  if (!receiptId) {
    const { data: created, error } = await supabase
      .from('commercial_notification_receipts')
      .insert({
        notification_type: 'listing_quality_quarantine',
        entity_type: 'listing',
        entity_id: listing.id,
        recipient_role: 'seller',
        status: 'pending',
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single()
    if (error || !created?.id) throw new Error('Listing quality notification receipt did not persist')
    receiptId = created.id
  }

  await supabase.from('listing_quality_state').update({ notification_status: 'pending' }).eq('listing_id', listing.id)
  const editUrl = `${siteUrl}/catalog/${listing.id}/edit`
  const delivery = await sendEmail(
    listing.seller_account_email,
    'Action needed: repair your AeroTrade listing photos',
    `<h2>Your listing is safely paused</h2>
    <p>AeroTrade checked the photos for <strong>${escapeHtml(listing.title)}</strong> twice and could not retrieve any of the stored files.</p>
    <p>The listing is no longer public, so buyers will not see an empty advert. Its details have not been deleted.</p>
    <p><a href="${escapeHtml(editUrl)}">Upload at least one working photo and review the listing</a>. You can then republish it from the listing page.</p>
    <p>If you need help, reply to this email.</p>`,
    { idempotencyKey },
  )

  const accepted = delivery.success && delivery.resendId
  const now = new Date().toISOString()
  const { data: receipt, error: receiptError } = await supabase
    .from('commercial_notification_receipts')
    .update({
      status: accepted ? 'accepted' : 'failed',
      provider_message_id: accepted ? delivery.resendId : null,
      error_message: accepted ? null : 'Provider acceptance was not confirmed.',
      attempted_at: now,
      accepted_at: accepted ? now : null,
    })
    .eq('id', receiptId)
    .select('status')
    .single()
  if (receiptError || receipt?.status !== (accepted ? 'accepted' : 'failed')) {
    throw new Error('Listing quality notification result did not persist')
  }

  await supabase
    .from('listing_quality_state')
    .update({ notification_status: accepted ? 'accepted' : 'failed' })
    .eq('listing_id', listing.id)
  return accepted ? 'accepted' : 'failed'
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const allowedHostnames = getAllowedListingImageHosts(supabaseUrl)
  if (!supabaseUrl || !serviceRoleKey || allowedHostnames.length === 0) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const commit = new URL(request.url).searchParams.get('commit') === '1'
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: activeListings, error: listingsError } = await supabase
    .from('listings')
    .select('id,seller_id,title,status,images(id,url,is_primary)')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .order('created_at', { ascending: true })
  if (listingsError) return NextResponse.json({ error: 'Active listings could not be loaded' }, { status: 500 })

  const sellerIds = [...new Set((activeListings || []).map((listing) => listing.seller_id))]
  const { data: sellers, error: sellersError } = sellerIds.length > 0
    ? await supabase.from('users').select('id,email').in('id', sellerIds)
    : { data: [], error: null }
  if (sellersError) return NextResponse.json({ error: 'Seller accounts could not be loaded' }, { status: 500 })
  const sellerEmailById = new Map((sellers || []).map((seller) => [seller.id, seller.email]))
  const getSellerAccountEmail = async (sellerId: string) => {
    const existing = sellerEmailById.get(sellerId)
    if (existing) return existing
    const { data: seller, error } = await supabase.from('users').select('email').eq('id', sellerId).maybeSingle()
    if (error || !seller?.email) throw new Error('Seller account email is missing')
    sellerEmailById.set(sellerId, seller.email)
    return seller.email
  }

  const listingIds = (activeListings || []).map((listing) => listing.id)
  const { data: states, error: statesError } = listingIds.length > 0
    ? await supabase.from('listing_quality_state').select('listing_id,status,consecutive_failures,last_checked_at,previous_listing_status,notification_status').in('listing_id', listingIds)
    : { data: [], error: null }
  if (statesError) return NextResponse.json({ error: 'Listing quality state could not be loaded' }, { status: 500 })

  const stateByListing = new Map((states || []).map((state) => [state.listing_id, state as QualityState]))
  const now = new Date().toISOString()
  const result = {
    checked: 0,
    healthy: 0,
    suspected: 0,
    quarantined: 0,
    resolved: 0,
    inconclusive: 0,
    notificationsAccepted: 0,
    notificationsFailed: 0,
    primaryImagesRepaired: 0,
    dryRun: !commit,
  }

  try {
    for (const rawListing of activeListings || []) {
      const sellerAccountEmail = await getSellerAccountEmail(rawListing.seller_id)
      const listing = { ...rawListing, seller_account_email: sellerAccountEmail } as Listing
      const assessment = await probeListingImages((listing.images || []).map((image) => image.url), { allowedHostnames })
      const current = stateByListing.get(listing.id) || null
      const transition = getListingQualityTransition(current, assessment.observation, now)
      result.checked += 1

      if (assessment.observation === listingImageObservations.AVAILABLE) result.healthy += 1
      else if (assessment.observation === listingImageObservations.UNKNOWN) result.inconclusive += 1

      if (!commit) {
        if (transition === 'SUSPECT') result.suspected += 1
        if (transition === 'QUARANTINE') result.quarantined += 1
        if (transition === 'RESOLVE') result.resolved += 1
        continue
      }

      if (assessment.observation === listingImageObservations.AVAILABLE && assessment.reachableUrl) {
        const repaired = await ensureReachableListingPrimaryImage(
          supabase,
          listing.id,
          listing.images || [],
          assessment.reachableUrl,
        )
        if (repaired) result.primaryImagesRepaired += 1
      }

      if (transition === 'SUSPECT') {
        const persisted = await upsertState(supabase, {
          listing_id: listing.id,
          issue_code: 'NO_REACHABLE_IMAGE',
          status: 'SUSPECT',
          last_observation: 'DEFINITELY_MISSING',
          consecutive_failures: 1,
          first_failed_at: now,
          last_checked_at: now,
          previous_listing_status: listing.status,
          quarantined_at: null,
          resolved_at: null,
          notification_status: 'not_sent',
        })
        stateByListing.set(listing.id, persisted)
        result.suspected += 1
      } else if (transition === 'QUARANTINE') {
        const { data: paused, error: pauseError } = await supabase
          .from('listings')
          .update({ status: 'DRAFT' })
          .eq('id', listing.id)
          .eq('status', listing.status)
          .select('id,status')
          .single()
        if (pauseError || paused?.status !== 'DRAFT') throw new Error('Broken listing was not safely paused')

        const persisted = await upsertState(supabase, {
          listing_id: listing.id,
          issue_code: 'NO_REACHABLE_IMAGE',
          status: 'QUARANTINED',
          last_observation: 'DEFINITELY_MISSING',
          consecutive_failures: Math.max(2, (current?.consecutive_failures || 1) + 1),
          first_failed_at: current?.last_checked_at || now,
          last_checked_at: now,
          previous_listing_status: current?.previous_listing_status || listing.status,
          quarantined_at: now,
          resolved_at: null,
          notification_status: current?.notification_status || 'not_sent',
        })
        stateByListing.set(listing.id, persisted)
        result.quarantined += 1
        const notification = await notifyQuarantinedSeller(supabase, { ...listing, status: 'DRAFT' })
        if (notification === 'accepted' || notification === 'already_accepted') result.notificationsAccepted += 1
        else result.notificationsFailed += 1
      } else if (transition === 'RESOLVE') {
        await upsertState(supabase, {
          ...current,
          listing_id: listing.id,
          issue_code: 'NO_REACHABLE_IMAGE',
          status: 'RESOLVED',
          last_observation: 'AVAILABLE',
          consecutive_failures: 0,
          last_checked_at: now,
          resolved_at: now,
        })
        result.resolved += 1
      }
    }

    if (commit) {
      const { data: notificationRetries } = await supabase
        .from('listing_quality_state')
        .select('listing_id')
        .eq('status', 'QUARANTINED')
        .neq('notification_status', 'accepted')
      const retryIds = (notificationRetries || []).map((state) => state.listing_id)
      if (retryIds.length > 0) {
        const { data: retryListings } = await supabase
          .from('listings')
          .select('id,seller_id,title,status,images(id,url,is_primary)')
          .in('id', retryIds)
        for (const retryListing of retryListings || []) {
          if (stateByListing.get(retryListing.id)?.status === 'QUARANTINED') continue
          const sellerAccountEmail = await getSellerAccountEmail(retryListing.seller_id)
          const notification = await notifyQuarantinedSeller(supabase, { ...retryListing, seller_account_email: sellerAccountEmail } as Listing)
          if (notification === 'accepted' || notification === 'already_accepted') result.notificationsAccepted += 1
          else result.notificationsFailed += 1
        }
      }
    }

    return NextResponse.json(result, { status: result.notificationsFailed > 0 ? 502 : 200 })
  } catch (error) {
    console.error('Catalog quality run failed:', error)
    return NextResponse.json({ ...result, error: 'Catalog quality run could not complete safely' }, { status: 500 })
  }
}
