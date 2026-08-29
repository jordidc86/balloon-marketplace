'use server'

import { headers } from 'next/headers'
import type { BrowserCommercialContext } from '@/utils/browser-attribution'
import { normalizeCommercialContext, commercialJourneyKey } from '@/utils/commercial-attribution.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { escapeHtml } from '@/utils/html'
import { canRevealSellerContact } from '@/utils/listing-safety.mjs'
import {
  createListingWatchSnapshot,
  createListingWatchSubmissionKey,
  parseListingWatchRequest,
  signListingWatchAction,
} from '@/utils/listing-watch.mjs'
import { siteUrl } from '@/utils/site'
import { createAdminClient, createClient } from '@/utils/supabase/server'

export async function submitListingWatch(listingId: string, formData: FormData, rawContext?: BrowserCommercialContext) {
  let watchRequest
  try {
    watchRequest = parseListingWatchRequest(formData)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to record this watch request.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('users').select('is_premium,role').eq('id', user.id).maybeSingle()
    : { data: null }
  const admin = await createAdminClient()
  const { data: listing, error: listingError } = await admin
    .from('listings')
    .select('id,seller_id,title,status,public_at,price,currency,condition,location_country')
    .eq('id', listingId)
    .maybeSingle()

  if (listingError || !listing) return { success: false, message: 'This listing is no longer available.' }
  if (listing.seller_id === user?.id || profile?.role === 'admin') {
    return { success: false, message: 'Owners and marketplace operators do not create buyer watch signals.' }
  }
  const canWatch = canRevealSellerContact(
    { status: listing.status, publicAt: listing.public_at, sellerId: listing.seller_id },
    { userId: user?.id || null, isPremium: profile?.is_premium || false },
  )
  if (!canWatch) return { success: false, message: 'Buyer Early Access is required while this promoted listing is private.' }

  let snapshot
  try {
    snapshot = createListingWatchSnapshot(listing)
  } catch {
    return { success: false, message: 'This listing cannot be watched safely right now.' }
  }

  const requestHeaders = await headers()
  const clientAddress = requestHeaders.get('x-nf-client-connection-ip')
    || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || ''
  const submissionKey = createListingWatchSubmissionKey(
    clientAddress,
    requestHeaders.get('user-agent'),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  const attribution = normalizeCommercialContext(rawContext)
  const { data: existing, error: existingError } = await admin
    .from('listing_watchers')
    .select('id,status')
    .eq('listing_id', listing.id)
    .eq('normalized_email', watchRequest.normalized_email)
    .maybeSingle()
  if (existingError) return { success: false, message: 'AeroTrade could not safely check this watch request. Please try again.' }
  if (existing?.status === 'ACTIVE') return { success: true, duplicate: true, message: 'This email is already watching the listing.' }
  if (existing?.status === 'BLOCKED') return { success: false, message: 'This address cannot subscribe to listing updates.' }

  if (!existing && submissionKey) {
    const rateCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: rateError } = await admin
      .from('listing_watchers')
      .select('id', { count: 'exact', head: true })
      .eq('submission_key', submissionKey)
      .gte('created_at', rateCutoff)
    if (rateError) return { success: false, message: 'AeroTrade could not safely check this watch request. Please try again.' }
    if ((count || 0) >= 5) return { success: false, message: 'Too many watch requests were received. Please try again later.' }
  }

  const now = new Date().toISOString()
  const watchValues = {
    buyer_user_id: user?.id || null,
    email: watchRequest.email,
    normalized_email: watchRequest.normalized_email,
    status: 'PENDING_CONFIRMATION',
    privacy_consent_at: now,
    confirmed_at: null,
    unsubscribed_at: null,
    submission_key: submissionKey,
    source_context: 'listing_detail',
    referrer_host: attribution.referrer_host,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    journey_key: commercialJourneyKey({ principal: user?.id || attribution.visitorId, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    initial_snapshot_hash: snapshot.hash,
    last_notified_snapshot_hash: null,
    last_notified_at: null,
  }

  let watcherId = existing?.id
  if (watcherId) {
    const { data: updated, error } = await admin
      .from('listing_watchers')
      .update(watchValues)
      .eq('id', watcherId)
      .in('status', ['PENDING_CONFIRMATION', 'UNSUBSCRIBED'])
      .select('id,status')
      .single()
    if (error || updated?.status !== 'PENDING_CONFIRMATION') return { success: false, message: 'AeroTrade could not safely update this watch request.' }
  } else {
    const { data: created, error } = await admin
      .from('listing_watchers')
      .insert({ listing_id: listing.id, ...watchValues })
      .select('id,status')
      .single()
    if (error || !created?.id || created.status !== 'PENDING_CONFIRMATION') {
      const { data: concurrent } = await admin
        .from('listing_watchers')
        .select('id,status')
        .eq('listing_id', listing.id)
        .eq('normalized_email', watchRequest.normalized_email)
        .maybeSingle()
      if (!concurrent?.id) return { success: false, message: 'AeroTrade could not save this watch request.' }
      if (concurrent.status === 'ACTIVE') return { success: true, duplicate: true, message: 'This email is already watching the listing.' }
      watcherId = concurrent.id
    } else {
      watcherId = created.id
    }
  }

  if (!watcherId) return { success: false, stored: true, message: 'The watch request could not be read back safely.' }
  const token = signListingWatchAction(watcherId, 'confirm', process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!token) return { success: false, stored: true, message: 'The request was stored but confirmation could not be prepared.' }
  const confirmUrl = `${siteUrl}/watch/confirm?id=${encodeURIComponent(watcherId)}&token=${encodeURIComponent(token)}`
  const dateKey = now.slice(0, 10)
  try {
    const delivery = await sendCommercialReceiptEmail(admin, {
      notificationType: 'listing_watch_confirmation',
      entityType: 'listing_watch',
      entityId: watcherId,
      recipientRole: 'buyer',
      to: watchRequest.email,
      subject: `Confirm updates for ${listing.title}`,
      html: `<h2>Confirm this listing watch</h2>
      <p>You asked AeroTrade to notify you if the price, availability, condition or location of <strong>${escapeHtml(listing.title)}</strong> changes.</p>
      <p><a href="${escapeHtml(confirmUrl)}">Review and confirm listing updates</a></p>
      <p>No alerts are active until you confirm. This is listing-specific and is not a marketing subscription.</p>`,
      idempotencyKey: `listing-watch-confirm-${watcherId}-${dateKey}`,
    })
    if (!delivery.success) return { success: false, stored: true, message: 'Your request is stored, but the confirmation email was not accepted. Please try again later.' }
  } catch (error) {
    console.error('Listing-watch confirmation failed:', error)
    return { success: false, stored: true, message: 'Your request is stored, but the confirmation email could not be verified. Please try again later.' }
  }

  return { success: true, message: 'Check your email and confirm. Alerts remain inactive until you do.' }
}
