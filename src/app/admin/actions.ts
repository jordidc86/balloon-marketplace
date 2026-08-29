'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { escapeHtml } from '@/utils/html'
import { siteUrl } from '@/utils/site'
import { sendEmail } from '@/utils/resend'
import { sendPremiumListingAlert } from '@/utils/premium-alerts'
import { revalidatePath } from 'next/cache'
import { isClosedInquiryStatus, normalizeInquiryStatus } from '@/utils/inquiry-safety.mjs'
import { parseCommercialOutcome } from '@/utils/commercial-outcome.mjs'
import { normalizeWantedRequestStatus } from '@/utils/wanted-request.mjs'
import { createPremiumMembershipCheckout } from '@/utils/premium-checkout'
import { assertListingHasReachableImage, markListingQualityResolved } from '@/utils/listing-image-quality-server'
import { assertStoredListingRequiredFields } from '@/utils/listing-submission.mjs'
import { parseListingVerificationDecision } from '@/utils/listing-verification.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  return { supabase: await createAdminClient(), adminUserId: user.id }
}

export async function togglePremiumStatus(userId: string) {
  const { supabase, adminUserId } = await checkAdmin()
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('is_premium, premium_source')
    .eq('id', userId)
    .single()

  if (targetError || !targetUser) throw new Error('User not found')
  if (targetUser.is_premium && targetUser.premium_source === 'stripe') {
    throw new Error('Stripe-managed Premium must be changed through Stripe billing')
  }

  const nextStatus = !targetUser.is_premium
  const { error } = await supabase
    .from('users')
    .update({
      is_premium: nextStatus,
      premium_source: nextStatus ? 'admin' : null,
      premium_granted_by: nextStatus ? adminUserId : null,
      premium_granted_at: nextStatus ? new Date().toISOString() : null,
      premium_revoked_at: nextStatus ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) throw new Error('Failed to toggle premium status')
  revalidatePath('/admin/users')
}

export async function sendPremiumPaymentLink(userId: string) {
  const { supabase } = await checkAdmin()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, name, is_premium, stripe_customer_id')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  if (user.is_premium) {
    throw new Error('User is already premium')
  }

  const checkout = await createPremiumMembershipCheckout({
    userId: user.id,
    userEmail: user.email,
    stripeCustomerId: user.stripe_customer_id,
    origin: siteUrl,
    source: 'admin',
    successPath: '/login?message=Payment%20successful.%20Please%20log%20in%20to%20access%20your%20Premium%20Dashboard.',
    cancelPath: '/pricing?canceled=true',
  })

  const displayName = user.name || 'there'
  await sendEmail(
    user.email,
    'Complete your AeroTrade Premium subscription',
    `<p>Hi ${escapeHtml(displayName)},</p>
    <p>Thanks for your interest in AeroTrade Premium.</p>
    <p>You can complete your Premium subscription securely through Stripe here:</p>
    <p><a href="${escapeHtml(checkout.url)}">Complete AeroTrade Premium payment</a></p>
    <p>Premium gives you early access to Premium listings and instant alerts for new gear.</p>
    <p>If you did not request this, you can ignore this email.</p>`
  )

  revalidatePath('/admin/users')
}

export async function forcePublishListing(listingId: string) {
  const { supabase } = await checkAdmin()

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('id,category,details')
    .eq('id', listingId)
    .single()
  if (listingError || !listing) throw new Error('Listing not found')
  assertStoredListingRequiredFields(listing)
  await assertListingHasReachableImage(supabase, listingId)

  const { data, error } = await supabase.from('listings').update({
    status: 'ACTIVE_PUBLIC',
    public_at: new Date().toISOString()
  }).eq('id', listingId).select('id,status').single()

  if (error || data?.status !== 'ACTIVE_PUBLIC') throw new Error('Failed to publish listing')
  await markListingQualityResolved(supabase, listingId)

  revalidatePath('/admin/listings')
}

export async function deleteListing(listingId: string) {
  const { supabase } = await checkAdmin()
  const { error } = await supabase.from('listings').delete().eq('id', listingId)
  if (error) throw new Error('Failed to delete listing')
  revalidatePath('/admin/listings')
}

export async function markListingSold(listingId: string) {
  const { supabase } = await checkAdmin()
  const { error } = await supabase.from('listings').update({ status: 'SOLD' }).eq('id', listingId)
  if (error) throw new Error('Failed to mark as sold')
  revalidatePath('/admin/listings')
}

export async function promoteListing(listingId: string) {
  const { supabase } = await checkAdmin()

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('status')
    .eq('id', listingId)
    .single()

  if (listingError || !listing) throw new Error('Listing not found')

  if (listing.status !== 'ACTIVE_PREMIUM') {
    throw new Error('Only active premium listings can be promoted to premium users')
  }

  return sendPremiumListingAlert(supabase, listingId)
}

export async function updateAdminInquiryStatus(inquiryId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = normalizeInquiryStatus(formData.get('status'))
  if (!status) throw new Error('Invalid enquiry status')

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('marketplace_inquiries')
    .update({
      status,
      last_activity_at: now,
      closed_at: isClosedInquiryStatus(status) ? now : null,
    })
    .eq('id', inquiryId)
    .select('id,status')
    .single()

  if (error || !data?.id || data.status !== status) throw new Error('Could not update enquiry status')
  revalidatePath('/admin/commercial')
  revalidatePath('/dashboard')
}

export async function updateQuoteRequestStatus(requestId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = formData.get('status')
  const allowed = ['NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'WON', 'LOST']
  if (typeof status !== 'string' || !allowed.includes(status)) throw new Error('Invalid quote status')

  const { data, error } = await supabase
    .from('quote_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('id,status')
    .single()

  if (error || !data?.id || data.status !== status) throw new Error('Could not update quote status')
  revalidatePath('/admin/commercial')
}

export async function updateWantedRequestStatus(requestId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = normalizeWantedRequestStatus(formData.get('status'))
  if (!status) throw new Error('Invalid wanted-request status')

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('wanted_requests')
    .update({
      status,
      last_activity_at: now,
      closed_at: ['CLOSED', 'SPAM'].includes(status) ? now : null,
    })
    .eq('id', requestId)
    .select('id,status')
    .single()

  if (error || data?.id !== requestId || data.status !== status) throw new Error('Could not persist wanted-request status')
  revalidatePath('/admin/commercial')
}

export async function recordCommercialOutcome(
  entityType: 'marketplace_inquiry' | 'quote_request',
  entityId: string,
  formData: FormData,
) {
  const { supabase, adminUserId } = await checkAdmin()
  const outcome = parseCommercialOutcome(formData)
  const table = entityType === 'marketplace_inquiry' ? 'marketplace_inquiries' : 'quote_requests'

  const { data: entity, error: entityError } = await supabase
    .from(table)
    .select('id')
    .eq('id', entityId)
    .single()
  if (entityError || !entity?.id) throw new Error('Commercial opportunity not found')

  const now = new Date().toISOString()
  const { data: stored, error: outcomeError } = await supabase
    .from('commercial_outcomes')
    .upsert({
      entity_type: entityType,
      entity_id: entityId,
      ...outcome,
      recorded_by: adminUserId,
      closed_at: now,
    }, { onConflict: 'entity_type,entity_id' })
    .select('id,entity_type,entity_id,gross_amount_minor,aerotrade_revenue_minor,evidence_level')
    .single()

  if (outcomeError || !stored?.id
    || stored.entity_type !== entityType
    || stored.entity_id !== entityId
    || Number(stored.gross_amount_minor) !== outcome.gross_amount_minor
    || Number(stored.aerotrade_revenue_minor) !== outcome.aerotrade_revenue_minor
    || stored.evidence_level !== outcome.evidence_level) {
    throw new Error('Could not persist and verify the commercial outcome')
  }

  const statusUpdate = entityType === 'marketplace_inquiry'
    ? { status: 'WON', last_activity_at: now, closed_at: now }
    : { status: 'WON', updated_at: now }
  const { data: statusReadback, error: statusError } = await supabase
    .from(table)
    .update(statusUpdate)
    .eq('id', entityId)
    .select('id,status')
    .single()

  if (statusError || statusReadback?.status !== 'WON') {
    throw new Error('Outcome stored, but the opportunity status needs review')
  }

  revalidatePath('/admin/commercial')
  revalidatePath('/dashboard')
}

export async function setListingVerification(listingId: string, formData: FormData) {
  const { supabase, adminUserId } = await checkAdmin()
  const decision = parseListingVerificationDecision(formData)

  const [{ data: listing, error: listingError }, { data: current, error: currentError }] = await Promise.all([
    supabase.from('listings').select('id,seller_id,title,contact_email,status,category,details').eq('id', listingId).single(),
    supabase.from('listing_verifications').select('listing_id,status').eq('listing_id', listingId).maybeSingle(),
  ])
  if (listingError || !listing) throw new Error('Listing not found')
  if (currentError || !current) throw new Error('Verification request not found')
  if (decision.action === 'verify') {
    if (current.status !== 'IN_REVIEW') throw new Error('Only a queued seller request can be verified')
    const details = listing.details && typeof listing.details === 'object' ? listing.details as Record<string, unknown> : {}
    if (details.supporting_documents_available !== true) throw new Error('The seller has not declared supporting evidence available')
    assertStoredListingRequiredFields(listing)
    await assertListingHasReachableImage(supabase, listingId)
  } else if (decision.action === 'reject' && current.status !== 'IN_REVIEW') {
    throw new Error('Only a queued seller request can be rejected')
  } else if (decision.action === 'unverify' && current.status !== 'VERIFIED') {
    throw new Error('Only a verified listing can be unverified')
  }

  const { data: transition, error } = await supabase.rpc('decide_listing_verification', {
    p_listing_id: listingId,
    p_admin: adminUserId,
    p_action: decision.action,
    p_identity_review_basis: decision.identity_review_basis,
    p_supporting_evidence_types: decision.supporting_evidence_types,
    p_decision_reason: decision.decision_reason,
    p_review_scope_acknowledged: decision.action === 'verify',
  })
  const result = Array.isArray(transition) ? transition[0] : transition
  const expectedStatus = decision.action === 'verify' ? 'VERIFIED' : decision.action === 'reject' ? 'REJECTED' : 'UNVERIFIED'
  if (error || !result?.event_id || result.verification_status !== expectedStatus) {
    throw new Error(error?.message || 'Could not persist listing verification decision')
  }

  const [{ data: verification }, { data: event }] = await Promise.all([
    supabase.from('listing_verifications').select('listing_id,status,last_decided_at').eq('listing_id', listingId).single(),
    supabase.from('listing_verification_events').select('id,event_type,to_status').eq('id', result.event_id).single(),
  ])
  if (verification?.status !== expectedStatus || event?.to_status !== expectedStatus) {
    throw new Error('Verification decision was not confirmed by readback')
  }

  const { data: seller } = await supabase.from('users').select('email').eq('id', listing.seller_id).maybeSingle()
  const sellerEmail = seller?.email || listing.contact_email
  if (sellerEmail) {
    const outcome = expectedStatus === 'VERIFIED'
      ? 'The limited AeroTrade identity and supporting-evidence review is complete and the badge is now visible.'
      : expectedStatus === 'REJECTED'
        ? `The review could not be completed (${decision.decision_reason}). Update the listing or evidence availability and request another review.`
        : 'The AeroTrade document-check badge has been removed. You may request a new review after the listing evidence is ready.'
    try {
      await sendCommercialReceiptEmail(supabase, {
        notificationType: 'listing_verification_decision',
        entityType: 'listing',
        entityId: listingId,
        recipientRole: 'seller',
        to: sellerEmail,
        subject: `AeroTrade verification update: ${listing.title}`,
        html: `<p>${escapeHtml(outcome)}</p><p>This review does not certify ownership, legal title, airworthiness or physical condition.</p><p><a href="${siteUrl}/dashboard">Open your AeroTrade dashboard</a></p>`,
        idempotencyKey: `listing-verification-decision-${result.event_id}`,
      })
    } catch (notificationError) {
      console.error('Verification decision was stored, but the seller notification needs review:', notificationError)
    }
  }

  revalidatePath('/admin/listings')
  revalidatePath('/dashboard')
  revalidatePath(`/catalog/${listingId}`)
}
