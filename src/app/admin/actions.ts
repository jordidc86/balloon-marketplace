'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { escapeHtml } from '@/utils/html'
import { siteUrl } from '@/utils/site'
import { sendEmail } from '@/utils/resend'
import { sendPremiumListingAlert } from '@/utils/premium-alerts'
import { revalidatePath } from 'next/cache'
import { isClosedInquiryStatus, normalizeInquiryStatus } from '@/utils/inquiry-safety.mjs'
import { parseCommercialOutcome } from '@/utils/commercial-outcome.mjs'
import { commercialContributionMinor, parseCommercialEconomics } from '@/utils/commercial-economics.mjs'
import { normalizeWantedRequestStatus } from '@/utils/wanted-request.mjs'
import { createPremiumMembershipCheckout } from '@/utils/premium-checkout'
import { assertListingHasReachableImage, markListingQualityResolved } from '@/utils/listing-image-quality-server'
import { assertStoredListingRequiredFields } from '@/utils/listing-submission.mjs'
import { parseListingVerificationDecision } from '@/utils/listing-verification.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { normalizeSellerAssistanceStatus } from '@/utils/seller-assistance.mjs'
import { newBalloonProposalFingerprint, parseNewBalloonProposal } from '@/utils/new-balloon-proposal.mjs'
import { getListingAvailabilityState } from '@/utils/listing-availability.mjs'
import { listingAvailabilityRequestIdempotencyKey } from '@/utils/listing-availability-request.mjs'

async function checkAdmin() {
  const sessionSupabase = await createClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) throw new Error('Not logged in')

  const { data: profile } = await sessionSupabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  return { supabase: await createAdminClient(), sessionSupabase, adminUserId: user.id }
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
    successPath: '/login?message=Payment%20successful.%20Please%20log%20in%20to%20access%20Buyer%20Early%20Access.',
    cancelPath: '/pricing?canceled=true',
  })

  const displayName = user.name || 'there'
  await sendEmail(
    user.email,
    'Complete your AeroTrade Buyer Early Access subscription',
    `<p>Hi ${escapeHtml(displayName)},</p>
    <p>Thanks for your interest in AeroTrade Buyer Early Access.</p>
    <p>You can complete the annual buyer subscription securely through Stripe here:</p>
    <p><a href="${escapeHtml(checkout.url)}">Complete Buyer Early Access payment</a></p>
    <p>Buyer Early Access gives you a 48-hour head start on promoted listings and instant alerts for new equipment.</p>
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
  const { supabase, sessionSupabase, adminUserId } = await checkAdmin()
  const { data, error } = await sessionSupabase.rpc('close_listing_by_actor', {
    p_listing_id: listingId,
    p_action: 'SOLD',
    p_sale_channel: 'NOT_DISCLOSED',
    p_marketplace_inquiry_id: null,
    p_gross_amount_minor: null,
    p_currency: null,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.event_id || result.listing_status !== 'SOLD') {
    throw new Error(error?.message || 'Failed to mark as sold')
  }
  const [{ data: event, error: eventError }, { data: listing, error: listingError }] = await Promise.all([
    supabase.from('listing_lifecycle_events').select('id,recorded_by,actor_role,event_type,sale_channel,new_status').eq('id', result.event_id).eq('listing_id', listingId).single(),
    supabase.from('listings').select('id,status').eq('id', listingId).single(),
  ])
  if (eventError || listingError || event?.recorded_by !== adminUserId || event?.actor_role !== 'ADMIN' || event?.event_type !== 'SOLD' || event?.sale_channel !== 'NOT_DISCLOSED' || event?.new_status !== 'SOLD' || listing?.status !== 'SOLD') {
    throw new Error('Administrative listing closure was not verified by readback')
  }
  revalidatePath('/admin/listings')
  revalidatePath('/admin/commercial')
  revalidatePath('/catalog')
  revalidatePath(`/catalog/${listingId}`)
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
  if (status === 'WON') throw new Error('Record the commercial outcome to close an enquiry as won')

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
  const allowed = ['NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'LOST']
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

export async function updateSellerAssistanceStatus(requestId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = normalizeSellerAssistanceStatus(formData.get('status'))
  if (!status) throw new Error('Invalid assisted-sale status')
  const rawListingId = formData.get('linked_listing_id')
  const linkedListingId = typeof rawListingId === 'string' && rawListingId.trim() ? rawListingId.trim() : null
  if (status === 'LISTED' && !linkedListingId) throw new Error('Choose the completed listing before marking this request as listed')

  const { data: request, error: requestError } = await supabase
    .from('seller_assistance_requests')
    .select('id,email,seller_user_id')
    .eq('id', requestId)
    .single()
  if (requestError || !request) throw new Error('Assisted-sale request not found')

  if (linkedListingId) {
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id,seller_id,contact_email')
      .eq('id', linkedListingId)
      .single()
    const sameOwner = Boolean(
      listing
      && ((request.seller_user_id && listing.seller_id === request.seller_user_id)
        || listing.contact_email?.trim().toLowerCase() === request.email.trim().toLowerCase()),
    )
    if (listingError || !sameOwner) throw new Error('The selected listing does not match this seller')
  }

  const now = new Date().toISOString()
  const closed = ['CLOSED', 'SPAM'].includes(status)
  const { data, error } = await supabase
    .from('seller_assistance_requests')
    .update({
      status,
      linked_listing_id: status === 'LISTED' ? linkedListingId : linkedListingId || null,
      last_activity_at: now,
      closed_at: closed ? now : null,
    })
    .eq('id', requestId)
    .select('id,status,linked_listing_id,closed_at')
    .single()

  if (error || data?.id !== requestId || data.status !== status
    || (status === 'LISTED' && data.linked_listing_id !== linkedListingId)
    || (closed && !data.closed_at)) {
    throw new Error('Could not persist and verify assisted-sale status')
  }
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
  const { supabase, sessionSupabase } = await checkAdmin()
  const outcome = parseCommercialOutcome(formData)
  const table = entityType === 'marketplace_inquiry' ? 'marketplace_inquiries' : 'quote_requests'

  const { data: outcomeId, error: outcomeError } = await sessionSupabase.rpc('record_commercial_outcome', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_outcome_type: outcome.outcome_type,
    p_currency: outcome.currency,
    p_gross_amount_minor: outcome.gross_amount_minor,
    p_aerotrade_revenue_minor: outcome.aerotrade_revenue_minor,
    p_evidence_level: outcome.evidence_level,
    p_evidence_source: outcome.evidence_source,
    p_evidence_reference: outcome.evidence_reference,
    p_notes: outcome.notes,
  })
  if (outcomeError || !outcomeId) throw new Error(outcomeError?.message || 'Could not atomically record the commercial outcome')

  const [{ data: stored, error: readbackError }, { data: statusReadback, error: statusError }, { data: latestEvent, error: eventError }] = await Promise.all([
    supabase.from('commercial_outcomes').select('id,entity_type,entity_id,gross_amount_minor,aerotrade_revenue_minor,evidence_level,evidence_source,evidence_reference,settled_at').eq('id', outcomeId).single(),
    supabase.from(table).select('id,status').eq('id', entityId).single(),
    supabase.from('commercial_outcome_events').select('id,outcome_id,evidence_level,evidence_source,evidence_reference').eq('outcome_id', outcomeId).order('created_at', { ascending: false }).limit(1).single(),
  ])

  if (readbackError || !stored?.id
    || stored.entity_type !== entityType
    || stored.entity_id !== entityId
    || Number(stored.gross_amount_minor) !== outcome.gross_amount_minor
    || Number(stored.aerotrade_revenue_minor) !== outcome.aerotrade_revenue_minor
    || stored.evidence_level !== outcome.evidence_level
    || stored.evidence_source !== outcome.evidence_source
    || stored.evidence_reference !== outcome.evidence_reference
    || Boolean(stored.settled_at) !== (outcome.evidence_level === 'settled')) {
    throw new Error('Could not persist and verify the commercial outcome')
  }
  if (statusError || statusReadback?.status !== 'WON'
    || eventError || latestEvent?.outcome_id !== outcomeId
    || latestEvent.evidence_level !== outcome.evidence_level
    || latestEvent.evidence_source !== outcome.evidence_source
    || latestEvent.evidence_reference !== outcome.evidence_reference) {
    throw new Error('The atomic outcome or its audit event was not confirmed by readback')
  }

  revalidatePath('/admin/commercial')
  revalidatePath('/dashboard')
}

export async function recordCommercialUnitEconomics(outcomeId: string, formData: FormData) {
  const { supabase, sessionSupabase } = await checkAdmin()
  const economics = parseCommercialEconomics(formData)
  const { data: outcomeBasis, error: basisError } = await supabase
    .from('commercial_outcomes')
    .select('id,currency,aerotrade_revenue_minor')
    .eq('id', outcomeId)
    .single()
  if (basisError || outcomeBasis?.id !== outcomeId) throw new Error('Commercial outcome not found')

  const expectedContribution = commercialContributionMinor(outcomeBasis.aerotrade_revenue_minor, economics)
  const { data: eventId, error: economicsError } = await sessionSupabase.rpc('record_commercial_unit_economics', {
    p_outcome_id: outcomeId,
    p_direct_cost_minor: economics.direct_cost_minor,
    p_payment_fee_minor: economics.payment_fee_minor,
    p_tax_amount_minor: economics.tax_amount_minor,
    p_evidence_level: economics.economics_evidence_level,
    p_evidence_source: economics.economics_evidence_source,
    p_evidence_reference: economics.economics_evidence_reference,
    p_notes: economics.economics_notes,
  })
  if (economicsError || !eventId) throw new Error(economicsError?.message || 'Could not atomically record unit economics')

  const [{ data: stored, error: readbackError }, { data: event, error: eventError }] = await Promise.all([
    supabase.from('commercial_outcomes')
      .select('id,direct_cost_minor,payment_fee_minor,tax_amount_minor,contribution_margin_minor,economics_evidence_level,economics_evidence_source,economics_evidence_reference,economics_notes,economics_recorded_at')
      .eq('id', outcomeId)
      .single(),
    supabase.from('commercial_unit_economics_events')
      .select('id,outcome_id,currency,aerotrade_revenue_minor,direct_cost_minor,payment_fee_minor,tax_amount_minor,contribution_margin_minor,evidence_level,evidence_source,evidence_reference,notes')
      .eq('id', eventId)
      .single(),
  ])

  if (readbackError || stored?.id !== outcomeId
    || Number(stored.direct_cost_minor) !== economics.direct_cost_minor
    || Number(stored.payment_fee_minor) !== economics.payment_fee_minor
    || Number(stored.tax_amount_minor) !== economics.tax_amount_minor
    || Number(stored.contribution_margin_minor) !== expectedContribution
    || stored.economics_evidence_level !== economics.economics_evidence_level
    || stored.economics_evidence_source !== economics.economics_evidence_source
    || stored.economics_evidence_reference !== economics.economics_evidence_reference
    || stored.economics_notes !== economics.economics_notes
    || !stored.economics_recorded_at) {
    throw new Error('Could not persist and verify unit economics')
  }
  if (eventError || event?.id !== eventId || event.outcome_id !== outcomeId
    || event.currency !== outcomeBasis.currency
    || Number(event.aerotrade_revenue_minor) !== Number(outcomeBasis.aerotrade_revenue_minor)
    || Number(event.direct_cost_minor) !== economics.direct_cost_minor
    || Number(event.payment_fee_minor) !== economics.payment_fee_minor
    || Number(event.tax_amount_minor) !== economics.tax_amount_minor
    || Number(event.contribution_margin_minor) !== expectedContribution
    || event.evidence_level !== economics.economics_evidence_level
    || event.evidence_source !== economics.economics_evidence_source
    || event.evidence_reference !== economics.economics_evidence_reference
    || event.notes !== economics.economics_notes) {
    throw new Error('The unit-economics audit event was not confirmed by readback')
  }

  revalidatePath('/admin/commercial')
}

export async function sendNewBalloonProposal(requestId: string, formData: FormData) {
  const { supabase, sessionSupabase, adminUserId } = await checkAdmin()
  const proposal = parseNewBalloonProposal(formData)
  const { data: quote, error: quoteError } = await supabase.from('quote_requests').select('id,name,email,status').eq('id', requestId).single()
  if (quoteError || !quote || ['WON', 'LOST'].includes(quote.status)) throw new Error('This quote request is not open')

  const fingerprint = newBalloonProposalFingerprint(requestId, proposal)
  let { data: stored } = await supabase.from('new_balloon_quote_proposals').select('id,delivery_status,provider_message_id').eq('proposal_fingerprint', fingerprint).maybeSingle()
  if (!stored) {
    const { data, error } = await supabase.from('new_balloon_quote_proposals').insert({ quote_request_id: requestId, proposal_fingerprint: fingerprint, ...proposal, recorded_by: adminUserId }).select('id,delivery_status,provider_message_id').single()
    if (error || !data?.id) throw new Error('The proposal could not be stored before delivery')
    stored = data
  }

  const amount = `${(proposal.amount_min_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: proposal.currency })}–${(proposal.amount_max_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: proposal.currency })}`
  const delivery = await sendCommercialReceiptEmail(supabase, {
    notificationType: 'new_balloon_proposal_buyer', entityType: 'quote_proposal', entityId: stored.id, recipientRole: 'buyer', to: quote.email,
    subject: `AeroTrade indicative ${proposal.manufacturer === 'pasha' ? 'Pasha' : 'Schroeder'} balloon proposal`,
    html: `<h2>Your indicative new-balloon proposal</h2><p>Hello ${escapeHtml(quote.name)},</p><p>AeroTrade has prepared an initial, non-binding price direction for a factory-new <strong>${proposal.manufacturer === 'pasha' ? 'Pasha' : 'Schroeder'}</strong> balloon.</p><p><strong>Indicative range:</strong> ${escapeHtml(amount)}</p><p><strong>Configuration:</strong><br>${escapeHtml(proposal.configuration_summary).replaceAll('\n', '<br>')}</p><p><strong>Delivery guidance:</strong> ${escapeHtml(proposal.delivery_guidance)}</p><p><strong>Valid for discussion until:</strong> ${escapeHtml(proposal.valid_until)}</p>${proposal.terms ? `<p><strong>Conditions:</strong><br>${escapeHtml(proposal.terms).replaceAll('\n', '<br>')}</p>` : ''}<p>This is an invitation to discuss configuration and price. It is not a binding factory quotation, reservation or sale contract.</p><p>Reply to this email to continue with AeroTrade.</p>`,
    idempotencyKey: `new-balloon-proposal-${fingerprint}`,
  })

  if (!delivery.success || !delivery.providerMessageId) {
    const { data, error } = await supabase.from('new_balloon_quote_proposals').update({ delivery_status: 'failed', provider_message_id: null, delivery_error: 'Provider acceptance was not confirmed.', accepted_at: null }).eq('id', stored.id).select('id,delivery_status').single()
    if (error || data?.delivery_status !== 'failed') throw new Error('Proposal delivery failed and its result needs review')
    throw new Error('The proposal was stored but email acceptance was not confirmed')
  }

  const { data: acceptedId, error: acceptanceError } = await sessionSupabase.rpc('accept_new_balloon_proposal_delivery', { p_proposal_id: stored.id, p_provider_message_id: delivery.providerMessageId })
  const [{ data: proposalReadback }, { data: quoteReadback }] = await Promise.all([
    supabase.from('new_balloon_quote_proposals').select('id,delivery_status,provider_message_id,accepted_at').eq('id', stored.id).single(),
    supabase.from('quote_requests').select('id,status').eq('id', requestId).single(),
  ])
  if (acceptanceError || acceptedId !== stored.id || proposalReadback?.delivery_status !== 'accepted' || !proposalReadback.accepted_at || quoteReadback?.status !== 'QUOTE_SENT') {
    throw new Error('Provider accepted the proposal, but its commercial transition was not verified')
  }
  revalidatePath('/admin/commercial')
}

export async function requestListingAvailabilityConfirmation(listingId: string) {
  const { supabase } = await checkAdmin()
  const [{ data: listing, error: listingError }, { data: latestConfirmation, error: confirmationError }] = await Promise.all([
    supabase.from('listings').select('id,title,contact_email,status').eq('id', listingId).single(),
    supabase.from('listing_availability_confirmations').select('id,confirmed_at').eq('listing_id', listingId).order('confirmed_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (listingError || !listing || !['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing.status)) {
    throw new Error('Only an active listing can receive an availability request')
  }
  if (confirmationError) throw new Error('Availability evidence could not be read')
  if (getListingAvailabilityState(latestConfirmation?.confirmed_at).publiclyFresh) {
    throw new Error('This listing already has a current availability confirmation')
  }

  const idempotencyKey = listingAvailabilityRequestIdempotencyKey(listing.id, latestConfirmation?.id || null)
  const delivery = await sendCommercialReceiptEmail(supabase, {
    notificationType: 'listing_availability_request',
    entityType: 'listing',
    entityId: listing.id,
    recipientRole: 'seller',
    to: listing.contact_email,
    subject: `Please confirm your AeroTrade listing is still available: ${listing.title}`,
    html: `<p>Your AeroTrade advert <strong>${escapeHtml(listing.title)}</strong> is active, but it does not currently have a recent availability confirmation.</p><p>Please sign in and use <strong>Confirm still available</strong> in your dashboard:</p><p><a href="${escapeHtml(`${siteUrl}/dashboard`)}">Open your AeroTrade dashboard</a></p><p>This request does not change the advert, its price or its publication status. AeroTrade will show a dated availability badge only after you confirm it yourself.</p>`,
    idempotencyKey,
  })
  if (!delivery.success) {
    throw new Error(delivery.reason === 'deferred'
      ? 'The first delivery attempt is awaiting its safe retry window'
      : delivery.reason === 'exhausted'
        ? 'Availability request delivery is exhausted and needs manual review'
        : 'Availability request was stored but provider acceptance was not confirmed')
  }

  revalidatePath('/admin/commercial')
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
