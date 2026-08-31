'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getStoredListingPlan } from '@/utils/listing-plans'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { canRevealSellerContact, parseListingImageUrls } from '@/utils/listing-safety.mjs'
import { siteUrl } from '@/utils/site'
import { parseInquiry } from '@/utils/inquiry-safety.mjs'
import { sendEmail } from '@/utils/resend'
import { escapeHtml } from '@/utils/html'
import { commercialEventKey, commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import type { BrowserCommercialContext } from '@/utils/browser-attribution'
import { assertStoredListingRequiredFields, parseListingSubmission } from '@/utils/listing-submission.mjs'
import { createPremiumListingCheckout, retireListingCheckoutBeforeFreePublication } from '@/utils/listing-checkout'
import { assertListingHasReachableImage, markListingQualityResolved } from '@/utils/listing-image-quality-server'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { normalizeListingCommercialIntentStage } from '@/utils/listing-commercial-intent.mjs'
import { inquiryBuyerPortalCapabilityLifetimeMs, signInquiryBuyerPortalCapability } from '@/utils/inquiry-buyer-capability.mjs'
import { buildInquiryBuyerAcknowledgement } from '@/utils/inquiry-buyer-acknowledgement.mjs'

type ListingDetailsForm = Record<string, string | number | boolean | null | undefined>

const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server configuration error')
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

async function recordListingEvent(listingId: string, eventType: string, rawContext?: BrowserCommercialContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const supabaseAdmin = createAdminClient()
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id,seller_id,status')
    .eq('id', listingId)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .maybeSingle()

  if (listingError || !listing) return false
  if (user) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role === 'admin' || listing.seller_id === user.id) return false
  }
  const context = normalizeCommercialContext(rawContext)
  const principal = user?.id || context.visitorId
  if (!principal) return false
  const eventKey = commercialEventKey({ listingId: listing.id, eventType, principal })
  const { error } = await supabaseAdmin.from('listing_events').upsert({
    listing_id: listing.id,
    user_id: user?.id || null,
    event_type: eventType,
    event_key: eventKey,
    referrer_host: context.referrer_host,
    utm_source: context.utm_source,
    utm_medium: context.utm_medium,
    utm_campaign: context.utm_campaign,
    journey_key: commercialJourneyKey({ principal, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (error) {
    console.error('Failed to log listing commercial event:', error)
    return false
  }
  return true
}

async function recordSoldListingView(listingId: string, rawContext?: BrowserCommercialContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const supabaseAdmin = createAdminClient()
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id,seller_id,status,public_at')
    .eq('id', listingId)
    .eq('status', 'SOLD')
    .maybeSingle()

  const publicAt = listing?.public_at ? new Date(listing.public_at) : null
  if (listingError || !listing || !publicAt || !Number.isFinite(publicAt.getTime()) || publicAt > new Date()) return false
  if (user) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role === 'admin' || listing.seller_id === user.id) return false
  }

  const context = normalizeCommercialContext(rawContext)
  const principal = user?.id || context.visitorId
  if (!principal) return false
  const eventType = 'SOLD_VIEW'
  const eventKey = commercialEventKey({ listingId: listing.id, eventType, principal })
  const { error } = await supabaseAdmin.from('listing_events').upsert({
    listing_id: listing.id,
    user_id: user?.id || null,
    event_type: eventType,
    event_key: eventKey,
    referrer_host: context.referrer_host,
    utm_source: context.utm_source,
    utm_medium: context.utm_medium,
    utm_campaign: context.utm_campaign,
    journey_key: commercialJourneyKey({ principal, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (error) {
    console.error('Failed to log sold listing view:', error)
    return false
  }
  return true
}

export async function logListingView(listingId: string, rawContext?: BrowserCommercialContext) {
  return recordListingEvent(listingId, 'VIEW', rawContext)
}

export async function logSoldListingView(listingId: string, rawContext?: BrowserCommercialContext) {
  return recordSoldListingView(listingId, rawContext)
}

export async function logListingCommercialIntent(listingId: string, rawStage: string, rawContext?: BrowserCommercialContext) {
  const stage = normalizeListingCommercialIntentStage(rawStage)
  if (!stage) return false
  return recordListingEvent(listingId, stage, rawContext)
}

export async function revealSellerContact(listingId: string, rawContext?: BrowserCommercialContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase
      .from('users')
      .select('is_premium,role')
      .eq('id', user.id)
      .single()
    : { data: null }

  const supabaseAdmin = createAdminClient()
  const { data: listing, error } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, status, public_at, contact_email, contact_phone')
    .eq('id', listingId)
    .single()

  if (error || !listing) {
    throw new Error('Listing not found')
  }

  const canReveal = canRevealSellerContact(
    {
      status: listing.status,
      publicAt: listing.public_at,
      sellerId: listing.seller_id,
    },
    {
      userId: user?.id || null,
      isPremium: profile?.is_premium || false,
    },
  )

  if (!canReveal) {
    throw new Error('Buyer Early Access is required to reveal this contact')
  }

  const context = normalizeCommercialContext(rawContext)
  const principal = user?.id || context.visitorId
  const eventKey = commercialEventKey({ listingId, eventType: 'CONTACT_REVEAL', principal })
  const shouldMeasureReveal = Boolean(principal && profile?.role !== 'admin' && listing.seller_id !== user?.id)
  const { error: eventError } = shouldMeasureReveal ? await supabaseAdmin
    .from('listing_events')
    .upsert({
      listing_id: listingId,
      user_id: user?.id || null,
      event_type: 'CONTACT_REVEAL',
      event_key: eventKey,
      referrer_host: context.referrer_host,
      utm_source: context.utm_source,
      utm_medium: context.utm_medium,
      utm_campaign: context.utm_campaign,
      journey_key: commercialJourneyKey({ principal, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
    }, { onConflict: 'event_key', ignoreDuplicates: true }) : { error: null }

  if (eventError) {
    console.error('Failed to log contact reveal:', eventError)
  }

  return {
    email: listing.contact_email as string,
    phone: listing.contact_phone as string | null,
  }
}

export async function submitListingInquiry(listingId: string, formData: FormData, rawContext?: BrowserCommercialContext) {
  let inquiry
  try {
    inquiry = parseInquiry(formData)
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unable to submit this enquiry',
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('users').select('is_premium,role').eq('id', user.id).maybeSingle()
    : { data: null }
  const supabaseAdmin = createAdminClient()
  const attribution = normalizeCommercialContext(rawContext)
  const principal = user?.id || attribution.visitorId
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id,seller_id,title,status,public_at,contact_email,currency')
    .eq('id', listingId)
    .maybeSingle()

  if (listingError || !listing) {
    return { success: false, message: 'This listing is no longer available.' }
  }

  if (profile?.role === 'admin' || listing.seller_id === user?.id) {
    return { success: false, message: 'Marketplace operators and listing owners cannot create buyer enquiries.' }
  }

  const canContact = canRevealSellerContact(
    { status: listing.status, publicAt: listing.public_at, sellerId: listing.seller_id },
    { userId: user?.id || null, isPremium: profile?.is_premium || false },
  )
  if (!canContact) {
    return { success: false, message: 'Buyer Early Access is required during the 48-hour early-access window.' }
  }

  const duplicateCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: duplicate } = await supabaseAdmin
    .from('marketplace_inquiries')
    .select('id')
    .eq('listing_id', listing.id)
    .eq('buyer_email', inquiry.buyer_email)
    .gte('created_at', duplicateCutoff)
    .neq('status', 'SPAM')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (duplicate?.id) {
    return {
      success: true,
      duplicate: true,
      message: 'Your enquiry is already recorded. The seller can see it in AeroTrade.',
    }
  }

  const { data: stored, error: insertError } = await supabaseAdmin
    .from('marketplace_inquiries')
    .insert({
      listing_id: listing.id,
      buyer_user_id: user?.id || null,
      ...inquiry,
      currency: listing.currency,
      source: 'listing_form',
      status: 'NEW',
      journey_key: commercialJourneyKey({ principal, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
      referrer_host: attribution.referrer_host,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
    })
    .select('id')
    .single()

  if (insertError || !stored?.id) {
    console.error('Could not store marketplace enquiry:', insertError)
    return { success: false, message: 'We could not save your enquiry. Please try again.' }
  }

  const listingUrl = `${siteUrl}/catalog/${listing.id}`
  const buyerPortalToken = signInquiryBuyerPortalCapability({
    inquiryId: stored.id,
    buyerEmail: inquiry.buyer_email,
    expiresAt: new Date(Date.now() + inquiryBuyerPortalCapabilityLifetimeMs),
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  const buyerPortalUrl = buyerPortalToken
    ? `${siteUrl}/inquiry/status?id=${encodeURIComponent(stored.id)}&token=${encodeURIComponent(buyerPortalToken)}`
    : null
  const indicativeOffer = inquiry.initial_offer_amount_minor === null
    ? null
    : (inquiry.initial_offer_amount_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: listing.currency })
  const delivery = await sendEmail(
    listing.contact_email,
    `New AeroTrade enquiry: ${listing.title}`,
    `<h2>A buyer is interested in your AeroTrade listing</h2>
    <p><strong>Listing:</strong> <a href="${escapeHtml(listingUrl)}">${escapeHtml(listing.title)}</a></p>
    <p><strong>Name:</strong> ${escapeHtml(inquiry.buyer_name)}</p>
    <p><strong>Email:</strong> <a href="mailto:${escapeHtml(inquiry.buyer_email)}">${escapeHtml(inquiry.buyer_email)}</a></p>
    ${inquiry.buyer_phone ? `<p><strong>Phone:</strong> ${escapeHtml(inquiry.buyer_phone)}</p>` : ''}
    ${indicativeOffer ? `<p><strong>Non-binding indicative offer:</strong> ${escapeHtml(indicativeOffer)}</p><p>This is an invitation to negotiate. It does not reserve the equipment or form a sale contract.</p>` : ''}
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(inquiry.message).replaceAll('\n', '<br />')}</p>
    <p>This enquiry is also recorded in your AeroTrade dashboard so its outcome can be tracked.</p>`,
    { idempotencyKey: `aerotrade-inquiry-${stored.id}-seller` },
  )

  const notificationUpdate = delivery.success && delivery.resendId
    ? {
        status: 'SELLER_NOTIFIED',
        seller_notification_status: 'accepted',
        seller_notification_provider_id: delivery.resendId,
        seller_notification_error: null,
        last_activity_at: new Date().toISOString(),
      }
    : {
        seller_notification_status: 'failed',
        seller_notification_error: 'Provider acceptance was not confirmed.',
      }

  const { error: updateError } = await supabaseAdmin
    .from('marketplace_inquiries')
    .update(notificationUpdate)
    .eq('id', stored.id)

  if (updateError) {
    console.error('Could not persist marketplace enquiry notification result:', updateError)
  }

  const { data: readback, error: readbackError } = await supabaseAdmin
    .from('marketplace_inquiries')
    .select('id,status,seller_notification_status')
    .eq('id', stored.id)
    .single()

  if (readbackError || !readback?.id) {
    console.error('Marketplace enquiry readback failed:', readbackError)
    return {
      success: true,
      message: 'Your enquiry was saved, but its notification status needs an internal review.',
    }
  }

  try {
    const acknowledgement = buildInquiryBuyerAcknowledgement({
      listingTitle: listing.title,
      listingUrl,
      buyerPortalUrl,
      indicativeOffer,
    })
    await sendCommercialReceiptEmail(supabaseAdmin, {
      notificationType: 'inquiry_buyer_ack',
      entityType: 'inquiry',
      entityId: stored.id,
      recipientRole: 'buyer',
      to: inquiry.buyer_email,
      subject: acknowledgement.subject,
      html: acknowledgement.html,
      idempotencyKey: `inquiry-buyer-ack-${stored.id}`,
    })
  } catch (acknowledgementError) {
    console.error('Buyer enquiry acknowledgement could not be completed:', acknowledgementError)
  }

  return {
    success: true,
    message: delivery.success
      ? 'Your enquiry has been sent to the seller and recorded by AeroTrade.'
      : 'Your enquiry is safely recorded. The seller can see it in AeroTrade even though the email notification needs a retry.',
  }
}

export async function updateListing(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const listingId = formData.get('id') as string;
  if (!listingId) {
    throw new Error('Listing ID required')
  }

  // Verify ownership
  const { data: listing, error: fetchError } = await supabase
    .from('listings')
    .select('seller_id, details')
    .eq('id', listingId)
    .single()

  if (fetchError || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  const submission = parseListingSubmission(formData)
  const details: ListingDetailsForm = {
    ...((listing.details || {}) as ListingDetailsForm),
    ...submission.details,
  }

  const storedPlan = getStoredListingPlan(listing.details)
  if (storedPlan) {
    details.listing_plan = storedPlan
  }

  const listingData = {
    ...submission,
    details,
  }

  const { error: updateError } = await supabase
    .from('listings')
    .update(listingData)
    .eq('id', listingId)

  if (updateError) {
    console.error("Error updating listing:", updateError)
    throw new Error('Could not update listing')
  }

  // Handle Images Reconciliation
  const imageUrlsJson = formData.get('image_urls')
  if (imageUrlsJson) {
    const imageUrls = parseListingImageUrls(imageUrlsJson)
    
    const { data: currentImages } = await supabase
      .from('images')
      .select('id, url')
      .eq('listing_id', listingId)

    const currentUrls = currentImages?.map(img => img.url) || []
    const urlsToInsert = imageUrls.filter(url => !currentUrls.includes(url))
    if (urlsToInsert.length > 0) {
      const inserts = urlsToInsert.map((url, index) => ({
        listing_id: listingId,
        url,
        is_primary: currentUrls.length === 0 && index === 0
      }))
      const { error: insertError } = await supabase.from('images').insert(inserts)
      if (insertError) {
        console.error('Error adding listing images:', insertError)
        throw new Error('Could not add listing images')
      }
    }

    const urlsToDelete = currentUrls.filter(url => !imageUrls.includes(url))
    if (urlsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('images')
        .delete()
        .eq('listing_id', listingId)
        .in('url', urlsToDelete)

      if (deleteError) {
        console.error('Error removing listing images:', deleteError)
        throw new Error('Could not remove listing images')
      }
    }

    const { data: remainingImages, error: remainingImagesError } = await supabase
      .from('images')
      .select('id, is_primary, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })

    if (remainingImagesError || !remainingImages?.length) {
      console.error('Error validating listing images:', remainingImagesError)
      throw new Error('A cover image is required to publish a listing')
    }

    if (!remainingImages.some((image) => image.is_primary)) {
      const { error: primaryError } = await supabase
        .from('images')
        .update({ is_primary: true })
        .eq('id', remainingImages[0].id)

      if (primaryError) {
        console.error('Error assigning primary listing image:', primaryError)
        throw new Error('Could not assign the cover image')
      }
    }
  }

  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/catalog/${listingId}`)
  revalidatePath(`/dashboard`)
  
  const { redirect: nextRedirect } = await import('next/navigation')
  nextRedirect(`/catalog/${listingId}?updated=true`)
}

export async function payListingFee(listingId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, title, seller_id, status, category, details')
    .eq('id', listingId)
    .single()

  if (error || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  if (listing.status !== 'DRAFT' && listing.status !== 'PENDING_PAYMENT') {
    throw new Error('Listing is already active or being processed')
  }

  const admin = createAdminClient()
  assertStoredListingRequiredFields(listing)
  const { data: qualityRecovery } = await admin
    .from('listing_quality_state')
    .select('status,previous_listing_status')
    .eq('listing_id', listing.id)
    .in('status', ['QUARANTINED', 'RESOLVED'])
    .maybeSingle()
  if (listing.status === 'DRAFT' && qualityRecovery?.previous_listing_status) {
    throw new Error('Repair and republish this listing without paying again')
  }
  await assertListingHasReachableImage(admin, listing.id)
  await markListingQualityResolved(admin, listing.id)
  const headersList = await import('next/headers').then(m => m.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)
  const checkoutUrl = await createPremiumListingCheckout({
    listingId: listing.id,
    listingTitle: listing.title,
    userId: user.id,
    origin,
    source: 'catalog',
  })
  const { redirect: nextRedirect } = await import('next/navigation')
  nextRedirect(checkoutUrl)
}

export async function publishListingFree(listingId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, seller_id, status, category, details')
    .eq('id', listingId)
    .single()

  if (error || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  if (listing.status !== 'DRAFT' && listing.status !== 'PENDING_PAYMENT') {
    throw new Error('Listing is already active')
  }

  const admin = createAdminClient()
  assertStoredListingRequiredFields(listing)
  const { data: qualityRecovery } = await admin
    .from('listing_quality_state')
    .select('status,previous_listing_status')
    .eq('listing_id', listing.id)
    .in('status', ['QUARANTINED', 'RESOLVED'])
    .maybeSingle()
  if (listing.status === 'DRAFT' && qualityRecovery?.previous_listing_status) {
    throw new Error('Use the repair workflow to preserve the original listing plan')
  }
  await assertListingHasReachableImage(admin, listing.id)
  await retireListingCheckoutBeforeFreePublication(listing.id, user.id)

  const details = {
    ...((listing.details || {}) as Record<string, unknown>),
    listing_plan: 'free',
  }

  const { error: updateError } = await supabase
    .from('listings')
    .update({
      status: 'ACTIVE_PUBLIC',
      public_at: new Date().toISOString(),
      details,
    })
    .eq('id', listingId)

  if (updateError) {
    console.error('Error publishing listing as free:', updateError)
    throw new Error('Could not publish listing')
  }
  await markListingQualityResolved(admin, listing.id)

  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/catalog/${listingId}`)
  revalidatePath('/catalog')
  revalidatePath('/dashboard')

  const { redirect: nextRedirect } = await import('next/navigation')
  nextRedirect(`/catalog/${listingId}?success=true&plan=free`)
}

export async function republishQuarantinedListing(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data: listing, error: listingError } = await admin
    .from('listings')
    .select('id,seller_id,status,category,details')
    .eq('id', listingId)
    .single()
  if (listingError || !listing || listing.seller_id !== user.id || listing.status !== 'DRAFT') {
    throw new Error('This listing cannot be republished')
  }

  const { data: quality, error: qualityError } = await admin
    .from('listing_quality_state')
    .select('status,previous_listing_status')
    .eq('listing_id', listing.id)
    .in('status', ['QUARANTINED', 'RESOLVED'])
    .single()
  if (qualityError || !quality?.previous_listing_status) throw new Error('Listing repair state could not be verified')

  assertStoredListingRequiredFields(listing)
  await assertListingHasReachableImage(admin, listing.id)
  const { data: republished, error: updateError } = await admin
    .from('listings')
    .update({ status: quality.previous_listing_status })
    .eq('id', listing.id)
    .eq('status', 'DRAFT')
    .select('id,status')
    .single()
  if (updateError || republished?.status !== quality.previous_listing_status) {
    throw new Error('Corrected listing could not be republished')
  }
  await markListingQualityResolved(admin, listing.id)

  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/catalog/${listingId}`)
  revalidatePath('/catalog')
  revalidatePath('/dashboard')
  const { redirect: nextRedirect } = await import('next/navigation')
  nextRedirect(`/catalog/${listingId}?repaired=true`)
}
