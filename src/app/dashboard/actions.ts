'use server'

import { createAdminClient, createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { siteUrl } from '@/utils/site'
import { isClosedInquiryStatus, normalizeInquiryStatus, parseSellerInquiryResponse } from '@/utils/inquiry-safety.mjs'
import { revalidatePath } from 'next/cache'
import { getStoredListingPlan } from '@/utils/listing-plans'
import { createPremiumListingCheckout } from '@/utils/listing-checkout'
import { persistSellerFunnelEvent } from '@/utils/seller-funnel-server'
import { createPremiumMembershipCheckout } from '@/utils/premium-checkout'
import { assertListingHasReachableImage } from '@/utils/listing-image-quality-server'
import { assertStoredListingRequiredFields } from '@/utils/listing-submission.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { escapeHtml } from '@/utils/html'
import { inquiryBuyerCapabilityLifetimeMs, inquiryBuyerPortalCapabilityLifetimeMs, signInquiryBuyerCapability, signInquiryBuyerPortalCapability } from '@/utils/inquiry-buyer-capability.mjs'
import { parseListingClosure } from '@/utils/listing-closure.mjs'
import { buildSellerResponseBuyerNotification } from '@/utils/inquiry-negotiation-notifications.mjs'

const adminEmail = process.env.ADMIN_EMAIL?.trim()

export async function openBillingPortal() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id, is_premium, premium_source')
    .eq('id', user.id)
    .single()

  if (!profile?.is_premium || profile.premium_source !== 'stripe' || !profile.stripe_customer_id) {
    redirect('/dashboard?billing=unavailable')
  }

  const { stripe } = await import('@/utils/stripe')
  const headersList = await import('next/headers').then((m) => m.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  })

  redirect(session.url)
}

export async function updateNewsletterPreference(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requested = formData.get('newsletter_preference')
  if (requested !== 'enable' && requested !== 'disable') {
    throw new Error('A newsletter preference is required')
  }

  const enabled = requested === 'enable'
  const { data, error } = await supabase.rpc('set_own_newsletter_consent', {
    p_enabled: enabled,
  })
  const result = Array.isArray(data) ? data[0] : data
  const expectedStatus = enabled ? 'ACTIVE' : 'UNSUBSCRIBED'
  if (error || result?.newsletter_consent_status !== expectedStatus) {
    throw new Error(error?.message || 'Newsletter preference could not be stored')
  }

  const { data: readback, error: readbackError } = await supabase
    .from('users')
    .select('newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at')
    .eq('id', user.id)
    .single()
  if (
    readbackError
    || readback?.newsletter_consent_status !== expectedStatus
    || (enabled && (!readback.newsletter_consented_at || readback.newsletter_unsubscribed_at))
    || (!enabled && !readback?.newsletter_unsubscribed_at)
  ) {
    throw new Error('Newsletter preference was not verified by readback')
  }

  revalidatePath('/dashboard')
}

export async function resumePremiumListingCheckout(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: listing, error } = await supabase
    .from('listings')
    .select('id,seller_id,title,status,details')
    .eq('id', listingId)
    .eq('seller_id', user.id)
    .single()

  if (error || !listing || listing.status !== 'PENDING_PAYMENT' || getStoredListingPlan(listing.details) !== 'premium') {
    redirect('/dashboard?listing_payment=unavailable')
  }

  const headersList = await import('next/headers').then((module) => module.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)
  const checkoutUrl = await createPremiumListingCheckout({
    listingId: listing.id,
    listingTitle: listing.title,
    userId: user.id,
    origin,
    source: 'dashboard',
  })
  await persistSellerFunnelEvent(await createAdminClient(), {
    sellerId: user.id,
    listingId: listing.id,
    listingPlan: 'premium',
    stage: 'CHECKOUT_RESUMED',
    source: 'recovery',
  })
  redirect(checkoutUrl)
}

export async function resumePremiumMembershipCheckout() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('is_premium,stripe_customer_id')
    .eq('id', user.id)
    .single()
  if (profileError) throw new Error('Premium account status could not be verified')
  if (profile?.is_premium) redirect('/dashboard')

  const admin = await createAdminClient()
  const { data: latestIntent } = await admin
    .from('premium_checkout_intents')
    .select('id,stripe_session_id,status')
    .eq('user_id', user.id)
    .eq('status', 'STARTED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestIntent?.stripe_session_id) {
    try {
      const { stripe } = await import('@/utils/stripe')
      const session = await stripe.checkout.sessions.retrieve(latestIntent.stripe_session_id)
      if (session.status === 'open' && session.url) redirect(session.url)
      if (session.status === 'complete') redirect('/dashboard?premium_payment=processing')
      if (session.status === 'expired') {
        const { data: expired, error: expireError } = await admin
          .from('premium_checkout_intents')
          .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
          .eq('id', latestIntent.id)
          .eq('user_id', user.id)
          .select('id,status')
          .single()
        if (expireError || expired?.status !== 'EXPIRED') throw new Error('Expired Premium checkout could not be reconciled')
      }
    } catch (error) {
      const isRedirect = typeof error === 'object' && error !== null && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT')
      if (isRedirect) throw error
      console.error('Existing Premium checkout could not be resumed; creating a fresh tracked session:', error)
    }
  }

  const headersList = await import('next/headers').then((module) => module.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)
  const checkout = await createPremiumMembershipCheckout({
    userId: user.id,
    userEmail: user.email || '',
    stripeCustomerId: profile?.stripe_customer_id,
    origin,
    source: 'dashboard',
    successPath: '/dashboard?upgraded=true',
    cancelPath: '/dashboard?premium_payment=canceled',
  })
  redirect(checkout.url)
}

export async function confirmListingAvailability(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('confirm_listing_availability', {
    p_listing_id: listingId,
  })
  const confirmation = Array.isArray(data) ? data[0] : data
  if (error || !confirmation?.confirmation_id || !confirmation?.confirmed_at) {
    throw new Error(error?.message || 'Availability confirmation could not be stored')
  }

  const admin = await createAdminClient()
  const { data: readback, error: readbackError } = await admin
    .from('listing_availability_confirmations')
    .select('id,listing_id,seller_id,confirmed_at')
    .eq('id', confirmation.confirmation_id)
    .eq('listing_id', listingId)
    .eq('seller_id', user.id)
    .single()
  if (readbackError || !readback?.id || readback.confirmed_at !== confirmation.confirmed_at) {
    throw new Error('Availability confirmation was not verified by readback')
  }

  revalidatePath('/dashboard')
  revalidatePath(`/catalog/${listingId}`)
  revalidatePath('/catalog')
}

export async function confirmAllListingAvailability() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase.rpc('confirm_all_listing_availability')
  const confirmations = Array.isArray(data) ? data : []
  if (error || confirmations.length === 0) {
    throw new Error(error?.message || 'No active listings were available to confirm')
  }

  const confirmationIds = confirmations.map((confirmation) => confirmation.confirmation_id)
  const listingIds = confirmations.map((confirmation) => confirmation.listing_id)
  if (new Set(confirmationIds).size !== confirmationIds.length || new Set(listingIds).size !== listingIds.length) {
    throw new Error('Bulk availability confirmation returned duplicate evidence')
  }

  const admin = await createAdminClient()
  const [{ data: activeListings, error: listingsError }, { data: readback, error: readbackError }] = await Promise.all([
    admin
      .from('listings')
      .select('id')
      .eq('seller_id', user.id)
      .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']),
    admin
      .from('listing_availability_confirmations')
      .select('id,listing_id,seller_id,confirmed_at')
      .in('id', confirmationIds)
      .eq('seller_id', user.id),
  ])
  const activeIds = new Set((activeListings || []).map((listing) => listing.id))
  const readbackById = new Map((readback || []).map((confirmation) => [confirmation.id, confirmation]))
  const evidenceMatches = confirmations.every((confirmation) => {
    const stored = readbackById.get(confirmation.confirmation_id)
    return activeIds.has(confirmation.listing_id)
      && stored?.listing_id === confirmation.listing_id
      && stored?.seller_id === user.id
      && stored?.confirmed_at === confirmation.confirmed_at
  })
  if (
    listingsError
    || readbackError
    || activeIds.size !== confirmations.length
    || readbackById.size !== confirmations.length
    || !evidenceMatches
  ) {
    throw new Error('Bulk availability confirmation was not verified by readback')
  }

  revalidatePath('/dashboard')
  revalidatePath('/catalog')
  for (const listingId of listingIds) revalidatePath(`/catalog/${listingId}`)
}

export async function closeListingBySeller(listingId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id,seller_id,status,currency')
    .eq('id', listingId)
    .eq('seller_id', user.id)
    .single()
  if (listingError || !listing) throw new Error('Listing not found')

  const closure = parseListingClosure(formData, listing.currency)
  const { data, error } = await supabase.rpc('close_listing_by_actor', {
    p_listing_id: listing.id,
    p_action: closure.action,
    p_sale_channel: closure.sale_channel,
    p_marketplace_inquiry_id: closure.marketplace_inquiry_id,
    p_gross_amount_minor: closure.gross_amount_minor,
    p_currency: closure.currency,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.event_id || !result?.listing_status) {
    throw new Error(error?.message || 'Listing closure could not be stored')
  }

  const admin = await createAdminClient()
  const [{ data: event, error: eventError }, { data: storedListing, error: readbackError }] = await Promise.all([
    admin
      .from('listing_lifecycle_events')
      .select('id,listing_id,seller_id,recorded_by,actor_role,event_type,sale_channel,marketplace_inquiry_id,gross_amount_minor,currency,new_status')
      .eq('id', result.event_id)
      .eq('listing_id', listing.id)
      .eq('seller_id', user.id)
      .single(),
    admin.from('listings').select('id,status').eq('id', listing.id).single(),
  ])
  const expectedStatus = closure.action === 'SOLD' ? 'SOLD' : 'ARCHIVED'
  if (
    eventError
    || readbackError
    || !event?.id
    || event.recorded_by !== user.id
    || event.event_type !== closure.action
    || event.sale_channel !== closure.sale_channel
    || event.marketplace_inquiry_id !== closure.marketplace_inquiry_id
    || (event.gross_amount_minor === null ? null : Number(event.gross_amount_minor)) !== closure.gross_amount_minor
    || event.currency !== closure.currency
    || event.new_status !== expectedStatus
    || storedListing?.status !== expectedStatus
    || result.listing_status !== expectedStatus
  ) {
    throw new Error('Listing closure was not verified by readback')
  }

  revalidatePath('/dashboard')
  revalidatePath('/catalog')
  revalidatePath(`/catalog/${listing.id}`)
  revalidatePath('/admin/listings')
  revalidatePath('/admin/commercial')
}

export async function updateSellerInquiryStatus(inquiryId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedStatus = normalizeInquiryStatus(formData.get('status'))
  if (!requestedStatus || !['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'LOST', 'SPAM'].includes(requestedStatus)) {
    throw new Error('Invalid enquiry status')
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('marketplace_inquiries')
    .update({
      status: requestedStatus,
      last_activity_at: now,
      closed_at: isClosedInquiryStatus(requestedStatus) ? now : null,
    })
    .eq('id', inquiryId)
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error('Could not update this enquiry')
  }

  revalidatePath('/dashboard')
}

export async function respondToBuyerInquiry(inquiryId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const response = parseSellerInquiryResponse(formData)
  const admin = await createAdminClient()
  const { data: inquiry, error: inquiryError } = await admin
    .from('marketplace_inquiries')
    .select('id,listing_id,buyer_name,buyer_email,currency,status')
    .eq('id', inquiryId)
    .single()
  if (inquiryError || !inquiry) throw new Error('Enquiry not found')

  const { data: listing, error: listingError } = await admin
    .from('listings')
    .select('id,seller_id,title,contact_email')
    .eq('id', inquiry.listing_id)
    .single()
  if (listingError || !listing || listing.seller_id !== user.id) throw new Error('You cannot respond to this enquiry')

  const { data: transition, error: transitionError } = await supabase.rpc('record_seller_inquiry_response', {
    p_inquiry_id: inquiry.id,
    p_response: response.response,
    p_amount_minor: response.amount_minor,
    p_note: response.note,
  })
  const result = Array.isArray(transition) ? transition[0] : transition
  if (transitionError || !result?.event_id || !result?.inquiry_status) {
    throw new Error(transitionError?.message || 'The negotiation response could not be stored')
  }

  const [{ data: event, error: eventError }, { data: storedInquiry, error: readbackError }] = await Promise.all([
    admin.from('marketplace_inquiry_offer_events')
      .select('id,event_type,amount_minor,currency,note,buyer_notification_status,created_at')
      .eq('id', result.event_id)
      .eq('inquiry_id', inquiry.id)
      .single(),
    admin.from('marketplace_inquiries').select('id,status,last_activity_at,closed_at').eq('id', inquiry.id).single(),
  ])
  if (eventError || readbackError || !event?.id || storedInquiry?.status !== result.inquiry_status) {
    throw new Error('The negotiation response was not confirmed by readback')
  }

  if (event.buyer_notification_status !== 'accepted') {
    const capabilityExpiresAt = new Date(new Date(event.created_at).getTime() + inquiryBuyerCapabilityLifetimeMs)
    const buyerCapability = event.event_type === 'SELLER_DECLINED' ? null : signInquiryBuyerCapability({
      inquiryId: inquiry.id,
      eventId: event.id,
      buyerEmail: inquiry.buyer_email,
      expiresAt: capabilityExpiresAt,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    if (event.event_type !== 'SELLER_DECLINED' && !buyerCapability) {
      throw new Error('The buyer response capability could not be prepared')
    }
    const buyerResponseUrl = buyerCapability
      ? `${siteUrl}/inquiry/respond?id=${encodeURIComponent(inquiry.id)}&event=${encodeURIComponent(event.id)}&token=${encodeURIComponent(buyerCapability)}`
      : null
    const buyerPortalCapability = signInquiryBuyerPortalCapability({
      inquiryId: inquiry.id,
      buyerEmail: inquiry.buyer_email,
      expiresAt: new Date(Date.now() + inquiryBuyerPortalCapabilityLifetimeMs),
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    })
    const buyerPortalUrl = buyerPortalCapability
      ? `${siteUrl}/inquiry/status?id=${encodeURIComponent(inquiry.id)}&token=${encodeURIComponent(buyerPortalCapability)}`
      : null
    const notification = buildSellerResponseBuyerNotification({
      listing: {
        title: listing.title,
        contactEmail: listing.contact_email,
        url: `${siteUrl}/catalog/${listing.id}`,
      },
      event: {
        eventType: event.event_type,
        amountMinor: event.amount_minor === null ? null : Number(event.amount_minor),
        currency: event.currency,
        note: event.note,
      },
      buyerResponseUrl,
      buyerPortalUrl,
    })
    let notificationStatus: 'accepted' | 'failed' = 'failed'
    let providerMessageId: string | null = null
    try {
      const delivery = await sendCommercialReceiptEmail(admin, {
        notificationType: 'inquiry_buyer_seller_response',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'buyer',
        to: inquiry.buyer_email,
        subject: notification.subject,
        html: notification.html,
        idempotencyKey: `inquiry-buyer-seller-response-${event.id}`,
      })
      notificationStatus = delivery.success ? 'accepted' : 'failed'
      providerMessageId = delivery.providerMessageId
    } catch (error) {
      console.error('Seller response was stored but the buyer notification failed:', error)
    }

    const { data: notificationReadback, error: notificationError } = await admin
      .from('marketplace_inquiry_offer_events')
      .update({
        buyer_notification_status: notificationStatus,
        buyer_notification_provider_id: providerMessageId,
        buyer_notification_error: notificationStatus === 'accepted' ? null : 'Provider acceptance was not confirmed.',
      })
      .eq('id', event.id)
      .select('id,buyer_notification_status,buyer_notification_provider_id')
      .single()
    if (notificationError || notificationReadback?.buyer_notification_status !== notificationStatus) {
      throw new Error('The buyer notification result could not be verified')
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin/commercial')
}

export async function requestListingVerification(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id,seller_id,title,status,category,details')
    .eq('id', listingId)
    .eq('seller_id', user.id)
    .single()
  if (listingError || !listing) throw new Error('Listing not found')
  if (!['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing.status)) {
    throw new Error('Publish the listing before requesting an AeroTrade document check')
  }
  const details = listing.details && typeof listing.details === 'object' ? listing.details as Record<string, unknown> : {}
  if (details.supporting_documents_available !== true) {
    throw new Error('Mark supporting evidence as available in the listing before requesting review')
  }
  assertStoredListingRequiredFields(listing)

  const admin = await createAdminClient()
  await assertListingHasReachableImage(admin, listing.id)

  const { data: transition, error: transitionError } = await admin.rpc('request_listing_verification', {
    p_listing_id: listing.id,
    p_requester: user.id,
  })
  const result = Array.isArray(transition) ? transition[0] : transition
  if (transitionError || !result?.event_id || result.verification_status !== 'IN_REVIEW') {
    throw new Error(transitionError?.message || 'Verification request could not be queued')
  }

  const [{ data: verification }, { data: event }] = await Promise.all([
    admin.from('listing_verifications').select('listing_id,status,requested_by').eq('listing_id', listing.id).single(),
    admin.from('listing_verification_events').select('id,event_type,to_status').eq('id', result.event_id).single(),
  ])
  if (verification?.status !== 'IN_REVIEW' || verification.requested_by !== user.id
    || event?.event_type !== 'REQUESTED' || event.to_status !== 'IN_REVIEW') {
    throw new Error('Verification request was not confirmed by readback')
  }

  if (adminEmail) {
    try {
      await sendCommercialReceiptEmail(admin, {
        notificationType: 'listing_verification_requested',
        entityType: 'listing',
        entityId: listing.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: `AeroTrade verification requested: ${listing.title}`,
        html: `<p>A seller has requested the limited AeroTrade identity and supporting-evidence review for <strong>${escapeHtml(listing.title)}</strong>.</p><p>No document copies were uploaded or retained by this workflow.</p><p><a href="${siteUrl}/admin/listings">Open the verification queue</a></p>`,
        idempotencyKey: `listing-verification-request-${result.event_id}`,
      })
    } catch (error) {
      console.error('Verification request was queued, but the admin notification needs review:', error)
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/admin/listings')
}
