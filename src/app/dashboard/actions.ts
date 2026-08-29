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

export async function updateSellerInquiryStatus(inquiryId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedStatus = normalizeInquiryStatus(formData.get('status'))
  if (!requestedStatus || !['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM'].includes(requestedStatus)) {
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
      .select('id,event_type,amount_minor,currency,note,buyer_notification_status')
      .eq('id', result.event_id)
      .eq('inquiry_id', inquiry.id)
      .single(),
    admin.from('marketplace_inquiries').select('id,status,last_activity_at,closed_at').eq('id', inquiry.id).single(),
  ])
  if (eventError || readbackError || !event?.id || storedInquiry?.status !== result.inquiry_status) {
    throw new Error('The negotiation response was not confirmed by readback')
  }

  if (event.buyer_notification_status !== 'accepted') {
    const amount = event.amount_minor === null
      ? null
      : (Number(event.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: event.currency })
    const heading = event.event_type === 'SELLER_COUNTERED'
      ? `The seller has proposed ${amount}`
      : event.event_type === 'SELLER_DECLINED'
        ? 'The seller has declined this enquiry'
        : 'The seller would like to continue negotiating'
    const detail = event.event_type === 'SELLER_COUNTERED'
      ? `<p>The seller has made a non-binding counteroffer of <strong>${escapeHtml(amount || '')}</strong>.</p>`
      : event.event_type === 'SELLER_DECLINED'
        ? '<p>The seller has declined this opportunity. No reservation, payment or sale has been created.</p>'
        : '<p>The seller has accepted your price indication as a basis for further negotiation.</p>'
    let notificationStatus: 'accepted' | 'failed' = 'failed'
    let providerMessageId: string | null = null
    try {
      const delivery = await sendCommercialReceiptEmail(admin, {
        notificationType: 'inquiry_buyer_seller_response',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'buyer',
        to: inquiry.buyer_email,
        subject: `AeroTrade negotiation update: ${listing.title}`,
        html: `<h2>${escapeHtml(heading)}</h2>
        <p><strong>Listing:</strong> ${escapeHtml(listing.title)}</p>
        ${detail}
        ${event.note ? `<p><strong>Seller note:</strong><br />${escapeHtml(event.note).replaceAll('\n', '<br />')}</p>` : ''}
        <p>All amounts in this message are invitations to negotiate only. This message does not reserve the equipment, execute a payment or form a sale contract.</p>
        <p>To continue, contact the seller at <a href="mailto:${escapeHtml(listing.contact_email)}">${escapeHtml(listing.contact_email)}</a> or <a href="${escapeHtml(`${siteUrl}/catalog/${listing.id}`)}">return to the listing</a>.</p>`,
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
