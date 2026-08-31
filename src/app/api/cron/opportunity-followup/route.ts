import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { getOpportunityFollowupCutoff, getSellerEnquiryEscalationCutoff, openInquiryStatuses, openQuoteStatuses } from '@/utils/opportunity-followup.mjs'
import { persistSellerFunnelEvent } from '@/utils/seller-funnel-server'
import { siteUrl } from '@/utils/site'
import { buildNewBalloonBuyerAcknowledgement } from '@/utils/new-balloon-buyer-acknowledgement.mjs'
import { buildInquiryBuyerAcknowledgement } from '@/utils/inquiry-buyer-acknowledgement.mjs'
import { inquiryBuyerCapabilityLifetimeMs, inquiryBuyerPortalCapabilityLifetimeMs, signInquiryBuyerCapability, signInquiryBuyerPortalCapability } from '@/utils/inquiry-buyer-capability.mjs'
import { buyerEarlyAccessProduct } from '@/utils/paid-product-labels.mjs'
import { buildBuyerResponseSellerNotification, buildSellerResponseBuyerNotification, parseNegotiationNotificationEventId } from '@/utils/inquiry-negotiation-notifications.mjs'
import { newBalloonProposalResponseExpiry, signNewBalloonProposalCapability } from '@/utils/new-balloon-proposal-capability.mjs'
import {
  buildNewBalloonProposalBuyerNotification,
  buildNewBalloonProposalResponseAdminNotification,
  getNewBalloonProposalDeliveryRecoveryDecision,
  getNewBalloonResponseNotificationRecoveryDecision,
  parseNewBalloonProposalResponseNotificationEventId,
} from '@/utils/new-balloon-proposal-notifications.mjs'
import { newBalloonProposalResponseLabel } from '@/utils/new-balloon-proposal-response.mjs'
import { sellerAvailabilityDigestIdempotencyKey, sellerAvailabilityDigestInventoryKey } from '@/utils/seller-availability-digest.mjs'
import { sellerAvailabilityCapabilityLifetimeMs, signSellerAvailabilityCapability } from '@/utils/seller-availability-capability.mjs'
import { buildSellerAvailabilityDigestNotification } from '@/utils/seller-availability-notification.mjs'
import { getListingAvailabilityState } from '@/utils/listing-availability.mjs'
import { buildPublicNewsletterConfirmation } from '@/utils/newsletter-public-confirmation.mjs'
import { parsePublicNewsletterConfirmationIdempotencyKey } from '@/utils/newsletter-public-subscription.mjs'
import {
  buildListingVerificationEvidenceInstructions,
  listingVerificationEvidenceInstructionKey,
  parseListingVerificationEvidenceInstructionKey,
} from '@/utils/listing-verification-notifications.mjs'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  status: string
  last_activity_at: string
  listings: { id: string; title: string; contact_email: string } | Array<{ id: string; title: string; contact_email: string }> | null
}

type PremiumListingRecovery = {
  id: string
  seller_id: string
  title: string
  contact_email: string
  status: 'PENDING_PAYMENT'
  created_at: string
}

type SellerAssistance = {
  id: string
  status: 'NEW'
  last_activity_at: string
}

type BuyerAcknowledgementRetry = {
  notification_type: 'new_balloon_buyer_ack' | 'inquiry_buyer_ack'
  entity_id: string
}

type NewBalloonQuote = {
  id: string
  email: string
  manufacturer_preference: string
  equipment_type: string
}

type InquiryBuyerAcknowledgement = {
  id: string
  buyer_email: string
  currency: string
  initial_offer_amount_minor: number | null
  seller_notification_status: string
  listings: { id: string; title: string } | Array<{ id: string; title: string }> | null
}

type BuyerEarlyAccessCheckoutRecovery = {
  intent_id: string
  user_id: string
  buyer_email: string
  source: 'signup' | 'pricing' | 'dashboard'
  created_at: string
}

type AcceptedSellerFollowup = {
  entity_id: string
  accepted_at: string
}

type NegotiationRetryReceipt = {
  id: string
  notification_type: 'inquiry_buyer_seller_response' | 'inquiry_seller_buyer_response'
  entity_id: string
  idempotency_key: string
}

type NegotiationEvent = {
  id: string
  inquiry_id: string
  event_type: string
  amount_minor: number | null
  currency: string
  note: string | null
  buyer_notification_status: string
  seller_notification_status: string
  created_at: string
}

type NegotiationInquiry = {
  id: string
  buyer_name: string
  buyer_email: string
  status: string
  listings: { id: string; title: string; contact_email: string } | Array<{ id: string; title: string; contact_email: string }> | null
}

type NewBalloonNotificationRetryReceipt = {
  id: string
  notification_type: 'new_balloon_proposal_buyer' | 'new_balloon_proposal_response_admin'
  entity_id: string
  idempotency_key: string
  status: 'pending' | 'failed' | 'accepted'
  provider_message_id: string | null
}

type NewBalloonProposalRecovery = {
  id: string
  quote_request_id: string
  proposal_fingerprint: string
  manufacturer: 'pasha' | 'schroeder'
  currency: string
  amount_min_minor: number
  amount_max_minor: number
  configuration_summary: string
  delivery_guidance: string
  valid_until: string
  terms: string | null
  delivery_status: 'pending' | 'accepted' | 'failed'
  created_at: string
}

type NewBalloonProposalResponseRecovery = {
  id: string
  proposal_id: string
  quote_request_id: string
  response_type: 'INTERESTED' | 'QUESTION' | 'DECLINED'
  note: string | null
  admin_notification_status: 'pending' | 'accepted' | 'failed'
}

type NewBalloonQuoteRecovery = {
  id: string
  name: string
  email: string
  status: string
}

type SellerAvailabilityDigestRetry = {
  id: string
  entity_id: string
  idempotency_key: string
  status: 'pending' | 'failed'
}

type SellerAvailabilityRetrySeller = {
  id: string
  email: string
}

type SellerAvailabilityRetryListing = {
  id: string
  seller_id: string
  title: string
  status: 'ACTIVE_PUBLIC' | 'ACTIVE_PREMIUM'
}

type SellerAvailabilityRetryConfirmation = {
  id: string
  listing_id: string
  confirmed_at: string
}

type PublicNewsletterConfirmationRetry = {
  id: string
  entity_id: string
  idempotency_key: string
  status: 'pending' | 'failed'
}

type PublicNewsletterSubscriptionRecovery = {
  id: string
  email: string
  status: 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED'
  confirmation_cycle: number
}

type ListingVerificationInstructionRetry = {
  id: string
  entity_id: string
  idempotency_key: string
  status: 'pending' | 'failed'
}

type ListingVerificationInstructionEvent = {
  id: string
  listing_id: string
  event_type: string
  to_status: string
}

type ListingVerificationInstructionListing = {
  id: string
  seller_id: string
  title: string
  contact_email: string | null
  status: string
  users: { email: string | null } | Array<{ email: string | null }> | null
  listing_verifications: { status: string } | Array<{ status: string }> | null
}

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

const getInquiryListing = (inquiry: Inquiry) => Array.isArray(inquiry.listings) ? inquiry.listings[0] : inquiry.listings
const getNegotiationListing = (inquiry: NegotiationInquiry) => Array.isArray(inquiry.listings) ? inquiry.listings[0] : inquiry.listings

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const commit = new URL(request.url).searchParams.get('commit') === '1'
  const cutoff = getOpportunityFollowupCutoff()
  const sellerEscalationCutoff = getSellerEnquiryEscalationCutoff()
  const nowIso = new Date().toISOString()
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const [inquiryResult, quoteResult, buyerResponseQuoteResult, premiumListingResult, sellerAssistanceResult, buyerAcknowledgementRetryResult, buyerEarlyAccessRecoveryResult, acceptedSellerFollowupResult, negotiationRetryResult, newBalloonNotificationRetryResult, acceptedNewBalloonNotificationResult, sellerAvailabilityDigestRetryResult, publicNewsletterConfirmationRetryResult, listingVerificationInstructionRetryResult] = await Promise.all([
    supabase
      .from('marketplace_inquiries')
      .select('id,status,last_activity_at,listings(id,title,contact_email)')
      .in('status', openInquiryStatuses)
      .lte('last_activity_at', cutoff)
      .order('last_activity_at', { ascending: true })
      .limit(100),
    supabase
      .from('quote_requests')
      .select('id,status,updated_at')
      .in('status', openQuoteStatuses)
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(100),
    supabase
      .from('quote_requests')
      .select('id,status,updated_at')
      .eq('status', 'BUYER_RESPONDED')
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(100),
    supabase
      .from('listings')
      .select('id,seller_id,title,contact_email,status,created_at')
      .eq('status', 'PENDING_PAYMENT')
      .contains('details', { listing_plan: 'premium' })
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('seller_assistance_requests')
      .select('id,status,last_activity_at')
      .eq('status', 'NEW')
      .lte('last_activity_at', cutoff)
      .order('last_activity_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('notification_type,entity_id')
      .in('notification_type', ['new_balloon_buyer_ack', 'inquiry_buyer_ack'])
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.rpc('due_buyer_early_access_checkout_recoveries', { p_cutoff: cutoff }),
    supabase
      .from('commercial_notification_receipts')
      .select('entity_id,accepted_at')
      .eq('notification_type', 'inquiry_seller_followup')
      .eq('status', 'accepted')
      .lte('accepted_at', sellerEscalationCutoff)
      .order('accepted_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('id,notification_type,entity_id,idempotency_key,status,provider_message_id')
      .in('notification_type', ['inquiry_buyer_seller_response', 'inquiry_seller_buyer_response'])
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('id,notification_type,entity_id,idempotency_key')
      .in('notification_type', ['new_balloon_proposal_buyer', 'new_balloon_proposal_response_admin'])
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('id,notification_type,entity_id,idempotency_key,status,provider_message_id')
      .in('notification_type', ['new_balloon_proposal_buyer', 'new_balloon_proposal_response_admin'])
      .eq('status', 'accepted')
      .order('accepted_at', { ascending: false })
      .limit(500),
    supabase
      .from('commercial_notification_receipts')
      .select('id,entity_id,idempotency_key,status')
      .eq('notification_type', 'seller_availability_digest')
      .eq('entity_type', 'user')
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('id,entity_id,idempotency_key,status')
      .eq('notification_type', 'newsletter_public_optin_confirmation')
      .eq('entity_type', 'newsletter_subscription')
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('id,entity_id,idempotency_key,status')
      .eq('notification_type', 'listing_verification_evidence_instructions')
      .eq('entity_type', 'listing')
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
  ])
  if (inquiryResult.error || quoteResult.error || buyerResponseQuoteResult.error || premiumListingResult.error || sellerAssistanceResult.error || buyerAcknowledgementRetryResult.error || buyerEarlyAccessRecoveryResult.error || acceptedSellerFollowupResult.error || negotiationRetryResult.error || newBalloonNotificationRetryResult.error || acceptedNewBalloonNotificationResult.error || sellerAvailabilityDigestRetryResult.error || publicNewsletterConfirmationRetryResult.error || listingVerificationInstructionRetryResult.error) {
    return NextResponse.json({ error: 'Open opportunities could not be loaded' }, { status: 500 })
  }

  const inquiries = (inquiryResult.data || []) as unknown as Inquiry[]
  const quotes = quoteResult.data || []
  const buyerResponseQuotes = buyerResponseQuoteResult.data || []
  const premiumListings = (premiumListingResult.data || []) as PremiumListingRecovery[]
  const sellerAssistance = (sellerAssistanceResult.data || []) as SellerAssistance[]
  const buyerAcknowledgementRetries = (buyerAcknowledgementRetryResult.data || []) as BuyerAcknowledgementRetry[]
  const buyerEarlyAccessRecoveries = (buyerEarlyAccessRecoveryResult.data || []) as BuyerEarlyAccessCheckoutRecovery[]
  const acceptedSellerFollowups = (acceptedSellerFollowupResult.data || []) as AcceptedSellerFollowup[]
  const negotiationRetries = (negotiationRetryResult.data || []) as NegotiationRetryReceipt[]
  const newBalloonNotificationCandidates = [...new Map(
    ([...(newBalloonNotificationRetryResult.data || []), ...(acceptedNewBalloonNotificationResult.data || [])] as NewBalloonNotificationRetryReceipt[])
      .map((receipt) => [receipt.id, receipt]),
  ).values()]
  const sellerAvailabilityDigestRetries = (sellerAvailabilityDigestRetryResult.data || []) as SellerAvailabilityDigestRetry[]
  const publicNewsletterConfirmationRetries = (publicNewsletterConfirmationRetryResult.data || []) as PublicNewsletterConfirmationRetry[]
  const listingVerificationInstructionRetries = (listingVerificationInstructionRetryResult.data || []) as ListingVerificationInstructionRetry[]
  const newBalloonProposalDeliveryCandidates = newBalloonNotificationCandidates.filter((retry) => retry.notification_type === 'new_balloon_proposal_buyer')
  const newBalloonResponseAdminCandidates = newBalloonNotificationCandidates.filter((retry) => retry.notification_type === 'new_balloon_proposal_response_admin')
  const sellerEscalationInquiryIds = new Set(acceptedSellerFollowups.map((receipt) => receipt.entity_id))
  const sellerEnquiryEscalations = inquiries.filter((inquiry) => sellerEscalationInquiryIds.has(inquiry.id))
  const newBalloonBuyerAcknowledgementRetries = buyerAcknowledgementRetries.filter((retry) => retry.notification_type === 'new_balloon_buyer_ack')
  const inquiryBuyerAcknowledgementRetries = buyerAcknowledgementRetries.filter((retry) => retry.notification_type === 'inquiry_buyer_ack')
  const buyerAcknowledgementQuoteIds = [...new Set(newBalloonBuyerAcknowledgementRetries.map((retry) => retry.entity_id))]
  const buyerAcknowledgementInquiryIds = [...new Set(inquiryBuyerAcknowledgementRetries.map((retry) => retry.entity_id))]
  const negotiationEventIds = negotiationRetries
    .map((retry) => parseNegotiationNotificationEventId(retry.notification_type, retry.idempotency_key))
    .filter((eventId): eventId is string => Boolean(eventId))
  const negotiationInquiryIds = [...new Set(negotiationRetries.map((retry) => retry.entity_id))]
  const newBalloonProposalIds = [...new Set(newBalloonNotificationCandidates.map((retry) => retry.entity_id))]
  const newBalloonResponseEventIds = newBalloonResponseAdminCandidates
    .map((retry) => parseNewBalloonProposalResponseNotificationEventId(retry.idempotency_key))
    .filter((eventId): eventId is string => Boolean(eventId))
  const sellerAvailabilitySellerIds = [...new Set(sellerAvailabilityDigestRetries.map((retry) => retry.entity_id))]
  const publicNewsletterSubscriptionIds = [...new Set(publicNewsletterConfirmationRetries.map((retry) => retry.entity_id))]
  const listingVerificationEventIds = [...new Set(listingVerificationInstructionRetries
    .map((retry) => parseListingVerificationEvidenceInstructionKey(retry.idempotency_key))
    .filter((eventId): eventId is string => Boolean(eventId)))]
  const listingVerificationListingIds = [...new Set(listingVerificationInstructionRetries.map((retry) => retry.entity_id))]
  const [buyerAcknowledgementQuotesResult, buyerAcknowledgementInquiriesResult, negotiationEventsResult, negotiationInquiriesResult, latestNegotiationEventsResult, newBalloonProposalsResult, newBalloonResponseEventsResult, sellerAvailabilitySellersResult, sellerAvailabilityListingsResult, publicNewsletterSubscriptionsResult, listingVerificationEventsResult, listingVerificationListingsResult] = await Promise.all([
    buyerAcknowledgementQuoteIds.length > 0
      ? supabase
        .from('quote_requests')
        .select('id,email,manufacturer_preference,equipment_type')
        .in('id', buyerAcknowledgementQuoteIds)
      : Promise.resolve({ data: [], error: null }),
    buyerAcknowledgementInquiryIds.length > 0
      ? supabase
        .from('marketplace_inquiries')
        .select('id,buyer_email,currency,initial_offer_amount_minor,seller_notification_status,listings(id,title)')
        .in('id', buyerAcknowledgementInquiryIds)
      : Promise.resolve({ data: [], error: null }),
    negotiationEventIds.length > 0
      ? supabase
        .from('marketplace_inquiry_offer_events')
        .select('id,inquiry_id,event_type,amount_minor,currency,note,buyer_notification_status,seller_notification_status,created_at')
        .in('id', negotiationEventIds)
      : Promise.resolve({ data: [], error: null }),
    negotiationInquiryIds.length > 0
      ? supabase
        .from('marketplace_inquiries')
        .select('id,buyer_name,buyer_email,status,listings(id,title,contact_email)')
        .in('id', negotiationInquiryIds)
      : Promise.resolve({ data: [], error: null }),
    negotiationInquiryIds.length > 0
      ? supabase
        .from('marketplace_inquiry_offer_events')
        .select('id,inquiry_id,created_at')
        .in('inquiry_id', negotiationInquiryIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    newBalloonProposalIds.length > 0
      ? supabase
        .from('new_balloon_quote_proposals')
        .select('id,quote_request_id,proposal_fingerprint,manufacturer,currency,amount_min_minor,amount_max_minor,configuration_summary,delivery_guidance,valid_until,terms,delivery_status,created_at')
        .in('id', newBalloonProposalIds)
      : Promise.resolve({ data: [], error: null }),
    newBalloonResponseEventIds.length > 0
      ? supabase
        .from('new_balloon_proposal_response_events')
        .select('id,proposal_id,quote_request_id,response_type,note,admin_notification_status')
        .in('id', newBalloonResponseEventIds)
      : Promise.resolve({ data: [], error: null }),
    sellerAvailabilitySellerIds.length > 0
      ? supabase.from('users').select('id,email').in('id', sellerAvailabilitySellerIds)
      : Promise.resolve({ data: [], error: null }),
    sellerAvailabilitySellerIds.length > 0
      ? supabase
        .from('listings')
        .select('id,seller_id,title,status')
        .in('seller_id', sellerAvailabilitySellerIds)
        .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
        .order('id')
      : Promise.resolve({ data: [], error: null }),
    publicNewsletterSubscriptionIds.length > 0
      ? supabase
        .from('newsletter_public_subscriptions')
        .select('id,email,status,confirmation_cycle')
        .in('id', publicNewsletterSubscriptionIds)
      : Promise.resolve({ data: [], error: null }),
    listingVerificationEventIds.length > 0
      ? supabase
        .from('listing_verification_events')
        .select('id,listing_id,event_type,to_status')
        .in('id', listingVerificationEventIds)
      : Promise.resolve({ data: [], error: null }),
    listingVerificationListingIds.length > 0
      ? supabase
        .from('listings')
        .select('id,seller_id,title,contact_email,status,users(email),listing_verifications(status)')
        .in('id', listingVerificationListingIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (buyerAcknowledgementQuotesResult.error || buyerAcknowledgementInquiriesResult.error || negotiationEventsResult.error || negotiationInquiriesResult.error || latestNegotiationEventsResult.error || newBalloonProposalsResult.error || newBalloonResponseEventsResult.error || sellerAvailabilitySellersResult.error || sellerAvailabilityListingsResult.error || publicNewsletterSubscriptionsResult.error || listingVerificationEventsResult.error || listingVerificationListingsResult.error) {
    return NextResponse.json({ error: 'Commercial notification recovery data could not be loaded' }, { status: 500 })
  }
  const buyerAcknowledgementQuoteById = new Map(
    ((buyerAcknowledgementQuotesResult.data || []) as NewBalloonQuote[]).map((quote) => [quote.id, quote]),
  )
  const buyerAcknowledgementInquiryById = new Map(
    ((buyerAcknowledgementInquiriesResult.data || []) as unknown as InquiryBuyerAcknowledgement[]).map((inquiry) => [inquiry.id, inquiry]),
  )
  const negotiationEventById = new Map(
    ((negotiationEventsResult.data || []) as NegotiationEvent[]).map((event) => [event.id, event]),
  )
  const negotiationInquiryById = new Map(
    ((negotiationInquiriesResult.data || []) as unknown as NegotiationInquiry[]).map((inquiry) => [inquiry.id, inquiry]),
  )
  const latestNegotiationEventByInquiry = new Map<string, string>()
  for (const event of latestNegotiationEventsResult.data || []) {
    if (!latestNegotiationEventByInquiry.has(event.inquiry_id)) latestNegotiationEventByInquiry.set(event.inquiry_id, event.id)
  }
  const newBalloonProposalById = new Map(
    ((newBalloonProposalsResult.data || []) as NewBalloonProposalRecovery[]).map((proposal) => [proposal.id, proposal]),
  )
  const newBalloonResponseEventById = new Map(
    ((newBalloonResponseEventsResult.data || []) as NewBalloonProposalResponseRecovery[]).map((event) => [event.id, event]),
  )
  const sellerAvailabilitySellerById = new Map(
    ((sellerAvailabilitySellersResult.data || []) as SellerAvailabilityRetrySeller[]).map((seller) => [seller.id, seller]),
  )
  const sellerAvailabilityListings = (sellerAvailabilityListingsResult.data || []) as SellerAvailabilityRetryListing[]
  const publicNewsletterSubscriptionById = new Map(
    ((publicNewsletterSubscriptionsResult.data || []) as PublicNewsletterSubscriptionRecovery[]).map((subscription) => [subscription.id, subscription]),
  )
  const listingVerificationEventById = new Map(
    ((listingVerificationEventsResult.data || []) as ListingVerificationInstructionEvent[]).map((event) => [event.id, event]),
  )
  const listingVerificationListingById = new Map(
    ((listingVerificationListingsResult.data || []) as unknown as ListingVerificationInstructionListing[]).map((listing) => [listing.id, listing]),
  )
  const sellerAvailabilityListingIds = sellerAvailabilityListings.map((listing) => listing.id)
  const sellerAvailabilityConfirmationsResult = sellerAvailabilityListingIds.length > 0
    ? await supabase
      .from('listing_availability_confirmations')
      .select('id,listing_id,confirmed_at')
      .in('listing_id', sellerAvailabilityListingIds)
      .order('confirmed_at', { ascending: false })
    : { data: [], error: null }
  if (sellerAvailabilityConfirmationsResult.error) {
    return NextResponse.json({ error: 'Seller availability recovery evidence could not be loaded' }, { status: 500 })
  }
  const latestSellerAvailabilityConfirmationByListing = new Map<string, SellerAvailabilityRetryConfirmation>()
  for (const confirmation of (sellerAvailabilityConfirmationsResult.data || []) as SellerAvailabilityRetryConfirmation[]) {
    if (!latestSellerAvailabilityConfirmationByListing.has(confirmation.listing_id)) {
      latestSellerAvailabilityConfirmationByListing.set(confirmation.listing_id, confirmation)
    }
  }
  const newBalloonQuoteIds = [...new Set([...newBalloonProposalById.values()].map((proposal) => proposal.quote_request_id))]
  const [newBalloonQuotesResult, allRelevantNewBalloonProposalsResult] = await Promise.all([
    newBalloonQuoteIds.length > 0
      ? supabase.from('quote_requests').select('id,name,email,status').in('id', newBalloonQuoteIds)
      : Promise.resolve({ data: [], error: null }),
    newBalloonQuoteIds.length > 0
      ? supabase
        .from('new_balloon_quote_proposals')
        .select('id,quote_request_id,created_at')
        .in('quote_request_id', newBalloonQuoteIds)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])
  if (newBalloonQuotesResult.error || allRelevantNewBalloonProposalsResult.error) {
    return NextResponse.json({ error: 'New-balloon proposal recovery relationships could not be loaded' }, { status: 500 })
  }
  const newBalloonQuoteById = new Map(
    ((newBalloonQuotesResult.data || []) as NewBalloonQuoteRecovery[]).map((quote) => [quote.id, quote]),
  )
  const latestNewBalloonProposalByQuote = new Map<string, string>()
  for (const proposal of allRelevantNewBalloonProposalsResult.data || []) {
    if (!latestNewBalloonProposalByQuote.has(proposal.quote_request_id)) latestNewBalloonProposalByQuote.set(proposal.quote_request_id, proposal.id)
  }
  const newBalloonProposalDeliveryRetries = newBalloonProposalDeliveryCandidates.filter((receipt) =>
    receipt.status !== 'accepted' || newBalloonProposalById.get(receipt.entity_id)?.delivery_status !== 'accepted',
  )
  const newBalloonResponseAdminRetries = newBalloonResponseAdminCandidates.filter((receipt) => {
    const eventId = parseNewBalloonProposalResponseNotificationEventId(receipt.idempotency_key)
    return receipt.status !== 'accepted' || !eventId || newBalloonResponseEventById.get(eventId)?.admin_notification_status !== 'accepted'
  })
  const result = {
    dueSellerEnquiries: inquiries.length,
    dueSellerEnquiryEscalations: sellerEnquiryEscalations.length,
    dueNewBalloonQuotes: quotes.length,
    dueNewBalloonProposalResponses: buyerResponseQuotes.length,
    duePremiumListingCheckouts: premiumListings.length,
    dueSellerAssistance: sellerAssistance.length,
    dueNewBalloonBuyerAcknowledgementRetries: newBalloonBuyerAcknowledgementRetries.length,
    dueMarketplaceInquiryBuyerAcknowledgementRetries: inquiryBuyerAcknowledgementRetries.length,
    dueNegotiationNotificationRetries: negotiationRetries.length,
    dueNewBalloonProposalDeliveryRetries: newBalloonProposalDeliveryRetries.length,
    dueNewBalloonResponseAdminNotificationRetries: newBalloonResponseAdminRetries.length,
    dueBuyerEarlyAccessCheckoutRecoveries: buyerEarlyAccessRecoveries.length,
    dueSellerAvailabilityDigestRetries: sellerAvailabilityDigestRetries.length,
    duePublicNewsletterConfirmationRetries: publicNewsletterConfirmationRetries.length,
    dueListingVerificationInstructionRetries: listingVerificationInstructionRetries.length,
    accepted: 0,
    alreadyAccepted: 0,
    retryDeferred: 0,
    failed: 0,
    configurationBlocked: 0,
    negotiationNotificationsAccepted: 0,
    negotiationNotificationsAlreadyAccepted: 0,
    negotiationNotificationsDeferred: 0,
    negotiationNotificationsFailed: 0,
    negotiationNotificationsSuperseded: 0,
    newBalloonProposalDeliveriesAccepted: 0,
    newBalloonProposalDeliveriesAlreadyAccepted: 0,
    newBalloonProposalDeliveriesDeferred: 0,
    newBalloonProposalDeliveriesFailed: 0,
    newBalloonProposalDeliveriesSuperseded: 0,
    newBalloonResponseNotificationsAccepted: 0,
    newBalloonResponseNotificationsAlreadyAccepted: 0,
    newBalloonResponseNotificationsDeferred: 0,
    newBalloonResponseNotificationsFailed: 0,
    newBalloonResponseNotificationsSuperseded: 0,
    sellerAvailabilityDigestsAccepted: 0,
    sellerAvailabilityDigestsAlreadyAccepted: 0,
    sellerAvailabilityDigestsDeferred: 0,
    sellerAvailabilityDigestsFailed: 0,
    sellerAvailabilityDigestsSuperseded: 0,
    publicNewsletterConfirmationsAccepted: 0,
    publicNewsletterConfirmationsAlreadyAccepted: 0,
    publicNewsletterConfirmationsDeferred: 0,
    publicNewsletterConfirmationsFailed: 0,
    publicNewsletterConfirmationsSuperseded: 0,
    listingVerificationInstructionsAccepted: 0,
    listingVerificationInstructionsAlreadyAccepted: 0,
    listingVerificationInstructionsDeferred: 0,
    listingVerificationInstructionsFailed: 0,
    listingVerificationInstructionsSuperseded: 0,
    dryRun: !commit,
  }
  if (!commit) return NextResponse.json(result)

  const adminEmail = process.env.ADMIN_EMAIL?.trim()
  const exhaustNewBalloonReceipt = async (receiptId: string, message: string) => {
    const { data, error } = await supabase
      .from('commercial_notification_receipts')
      .update({ status: 'failed', delivery_attempts: 2, next_attempt_at: null, error_message: message })
      .eq('id', receiptId)
      .in('status', ['pending', 'failed'])
      .select('id,delivery_attempts,next_attempt_at')
      .single()
    return !error && data?.delivery_attempts === 2 && data.next_attempt_at === null
  }
  const exhaustSellerAvailabilityReceipt = async (receiptId: string, message: string) => {
    const { data, error } = await supabase
      .from('commercial_notification_receipts')
      .update({ status: 'failed', delivery_attempts: 2, next_attempt_at: null, error_message: message })
      .eq('id', receiptId)
      .in('status', ['pending', 'failed'])
      .select('id,delivery_attempts,next_attempt_at')
      .single()
    return !error && data?.delivery_attempts === 2 && data.next_attempt_at === null
  }

  const exhaustPublicNewsletterReceipt = async (receiptId: string, message: string) => {
    const { data, error } = await supabase
      .from('commercial_notification_receipts')
      .update({ status: 'failed', delivery_attempts: 2, next_attempt_at: null, error_message: message })
      .eq('id', receiptId)
      .in('status', ['pending', 'failed'])
      .select('id,delivery_attempts,next_attempt_at')
      .single()
    return !error && data?.delivery_attempts === 2 && data.next_attempt_at === null
  }

  const exhaustListingVerificationInstructionReceipt = async (receiptId: string, message: string) => {
    const { data, error } = await supabase
      .from('commercial_notification_receipts')
      .update({ status: 'failed', delivery_attempts: 2, next_attempt_at: null, error_message: message })
      .eq('id', receiptId)
      .in('status', ['pending', 'failed'])
      .select('id,delivery_attempts,next_attempt_at')
      .single()
    return !error && data?.delivery_attempts === 2 && data.next_attempt_at === null
  }

  for (const retry of publicNewsletterConfirmationRetries) {
    const parsedKey = parsePublicNewsletterConfirmationIdempotencyKey(retry.idempotency_key)
    const subscription = publicNewsletterSubscriptionById.get(retry.entity_id)
    const exactPendingRequest = Boolean(parsedKey
      && parsedKey.subscriptionId === retry.entity_id
      && subscription?.id === retry.entity_id
      && subscription.status === 'PENDING'
      && subscription.confirmation_cycle === parsedKey.confirmationCycle)
    if (!exactPendingRequest || !subscription) {
      const exhausted = await exhaustPublicNewsletterReceipt(retry.id, 'Public newsletter confirmation recovery was superseded by the current consent state.')
      if (exhausted) result.publicNewsletterConfirmationsSuperseded += 1
      else result.publicNewsletterConfirmationsFailed += 1
      continue
    }

    const confirmation = buildPublicNewsletterConfirmation({
      subscriptionId: subscription.id,
      email: subscription.email,
      confirmationCycle: subscription.confirmation_cycle,
      secret: serviceRoleKey,
      baseUrl: siteUrl,
    })
    if (!confirmation || confirmation.idempotencyKey !== retry.idempotency_key) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'newsletter_public_optin_confirmation',
        entityType: 'newsletter_subscription',
        entityId: subscription.id,
        recipientRole: 'buyer',
        to: subscription.email,
        subject: confirmation.subject,
        html: confirmation.html,
        idempotencyKey: confirmation.idempotencyKey,
      })
      if (delivery.duplicate) result.publicNewsletterConfirmationsAlreadyAccepted += 1
      else if (delivery.success) result.publicNewsletterConfirmationsAccepted += 1
      else if (delivery.skipped) result.publicNewsletterConfirmationsDeferred += 1
      else result.publicNewsletterConfirmationsFailed += 1
    } catch (error) {
      console.error('Public newsletter confirmation recovery failed:', error)
      result.publicNewsletterConfirmationsFailed += 1
    }
  }

  for (const retry of listingVerificationInstructionRetries) {
    const eventId = parseListingVerificationEvidenceInstructionKey(retry.idempotency_key)
    const event = eventId ? listingVerificationEventById.get(eventId) : null
    const listing = listingVerificationListingById.get(retry.entity_id)
    const verificationRelation = listing?.listing_verifications
    const currentVerification = Array.isArray(verificationRelation) ? verificationRelation[0] : verificationRelation
    const userRelation = listing?.users
    const sellerProfile = Array.isArray(userRelation) ? userRelation[0] : userRelation
    const sellerEmail = sellerProfile?.email || listing?.contact_email || null
    const exactOpenRequest = Boolean(eventId
      && event?.id === eventId
      && event.listing_id === retry.entity_id
      && event.event_type === 'REQUESTED'
      && event.to_status === 'IN_REVIEW'
      && currentVerification?.status === 'IN_REVIEW'
      && listing
      && ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing.status)
      && retry.idempotency_key === listingVerificationEvidenceInstructionKey(eventId))
    if (!adminEmail || !sellerEmail) {
      result.configurationBlocked += 1
      continue
    }
    if (!exactOpenRequest || !listing) {
      const exhausted = await exhaustListingVerificationInstructionReceipt(retry.id, 'Listing verification evidence handoff was superseded by the current review state.')
      if (exhausted) result.listingVerificationInstructionsSuperseded += 1
      else result.listingVerificationInstructionsFailed += 1
      continue
    }

    const instructions = buildListingVerificationEvidenceInstructions({
      adminEmail,
      listingId: listing.id,
      listingTitle: listing.title,
      dashboardUrl: `${siteUrl}/dashboard`,
      listingUrl: `${siteUrl}/catalog/${listing.id}`,
    })
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'listing_verification_evidence_instructions',
        entityType: 'listing',
        entityId: listing.id,
        recipientRole: 'seller',
        to: sellerEmail,
        subject: instructions.subject,
        html: instructions.html,
        idempotencyKey: retry.idempotency_key,
        replyTo: instructions.replyTo,
      })
      if (delivery.duplicate) result.listingVerificationInstructionsAlreadyAccepted += 1
      else if (delivery.success) result.listingVerificationInstructionsAccepted += 1
      else if (delivery.skipped) result.listingVerificationInstructionsDeferred += 1
      else result.listingVerificationInstructionsFailed += 1
    } catch (error) {
      console.error('Listing verification evidence handoff recovery failed:', error)
      result.listingVerificationInstructionsFailed += 1
    }
  }

  for (const retry of sellerAvailabilityDigestRetries) {
    const seller = sellerAvailabilitySellerById.get(retry.entity_id)
    const activeListings = sellerAvailabilityListings.filter((listing) => listing.seller_id === retry.entity_id)
    const dueListings = activeListings.filter((listing) => (
      !getListingAvailabilityState(latestSellerAvailabilityConfirmationByListing.get(listing.id)?.confirmed_at).publiclyFresh
    ))
    let currentInventoryKey: string | null = null
    try {
      if (dueListings.length > 0) {
        currentInventoryKey = sellerAvailabilityDigestIdempotencyKey(retry.entity_id, dueListings.map((listing) => ({
          listingId: listing.id,
          confirmationId: latestSellerAvailabilityConfirmationByListing.get(listing.id)?.id || null,
        })))
      }
    } catch {
      currentInventoryKey = null
    }

    const receiptInventoryKey = sellerAvailabilityDigestInventoryKey(retry.idempotency_key)
    if (!seller?.email || !currentInventoryKey || receiptInventoryKey !== currentInventoryKey) {
      const exhausted = await exhaustSellerAvailabilityReceipt(retry.id, 'Seller availability recovery was superseded by current seller inventory.')
      if (exhausted) result.sellerAvailabilityDigestsSuperseded += 1
      else result.sellerAvailabilityDigestsFailed += 1
      continue
    }

    const expiresAt = new Date(Date.now() + sellerAvailabilityCapabilityLifetimeMs)
    const capabilityToken = signSellerAvailabilityCapability({
      sellerId: seller.id,
      sellerEmail: seller.email,
      digestKey: retry.idempotency_key,
      expiresAt,
      secret: serviceRoleKey,
    })
    if (!capabilityToken) {
      result.configurationBlocked += 1
      continue
    }
    const capabilityParams = new URLSearchParams({ seller: seller.id, digest: retry.idempotency_key, token: capabilityToken })
    const notification = buildSellerAvailabilityDigestNotification({
      dueListings,
      capabilityUrl: `${siteUrl}/seller/availability?${capabilityParams.toString()}`,
      dashboardUrl: `${siteUrl}/dashboard`,
    })
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'seller_availability_digest',
        entityType: 'user',
        entityId: seller.id,
        recipientRole: 'seller',
        to: seller.email,
        subject: notification.subject,
        html: notification.html,
        idempotencyKey: retry.idempotency_key,
      })
      if (delivery.duplicate) result.sellerAvailabilityDigestsAlreadyAccepted += 1
      else if (delivery.success) result.sellerAvailabilityDigestsAccepted += 1
      else if (delivery.skipped) result.sellerAvailabilityDigestsDeferred += 1
      else result.sellerAvailabilityDigestsFailed += 1
    } catch (error) {
      console.error('Seller availability digest recovery failed:', error)
      result.sellerAvailabilityDigestsFailed += 1
    }
  }

  for (const retry of newBalloonProposalDeliveryRetries) {
    const proposal = newBalloonProposalById.get(retry.entity_id)
    const quote = proposal ? newBalloonQuoteById.get(proposal.quote_request_id) : null
    const exactReceipt = Boolean(proposal && retry.idempotency_key === `new-balloon-proposal-${proposal.proposal_fingerprint}`)

    const proposalRecoveryDecision = getNewBalloonProposalDeliveryRecoveryDecision({
      receiptStatus: retry.status,
      hasProviderMessageId: Boolean(retry.provider_message_id),
      proposal,
      quoteStatus: quote?.status,
      exactReceipt,
      latestProposalId: proposal ? latestNewBalloonProposalByQuote.get(proposal.quote_request_id) : null,
    })
    if (proposalRecoveryDecision === 'blocked') {
      result.configurationBlocked += 1
      continue
    }
    if (proposalRecoveryDecision === 'reconcile') {
      if (!proposal || !retry.provider_message_id || !exactReceipt) {
        result.configurationBlocked += 1
        continue
      }
      try {
        const { data: acceptedId, error } = await supabase.rpc('accept_new_balloon_proposal_delivery', {
          p_proposal_id: proposal.id,
          p_provider_message_id: retry.provider_message_id,
        })
        const { data: readback, error: readbackError } = await supabase
          .from('new_balloon_quote_proposals')
          .select('id,delivery_status,provider_message_id,accepted_at')
          .eq('id', proposal.id)
          .single()
        if (error || readbackError || acceptedId !== proposal.id || readback?.delivery_status !== 'accepted' || readback.provider_message_id !== retry.provider_message_id || !readback.accepted_at) {
          throw new Error('Accepted proposal delivery reconciliation failed')
        }
        result.newBalloonProposalDeliveriesAlreadyAccepted += 1
      } catch (error) {
        console.error('Accepted new-balloon proposal delivery could not be reconciled:', error)
        result.newBalloonProposalDeliveriesFailed += 1
      }
      continue
    }

    if (proposalRecoveryDecision === 'superseded') {
      const exhausted = await exhaustNewBalloonReceipt(retry.id, 'Proposal delivery recovery was superseded by current commercial state.')
      if (proposal && proposal.delivery_status !== 'accepted') {
        await supabase
          .from('new_balloon_quote_proposals')
          .update({ delivery_status: 'failed', provider_message_id: null, delivery_error: 'Delivery recovery superseded by current commercial state.', accepted_at: null })
          .eq('id', proposal.id)
      }
      if (exhausted) result.newBalloonProposalDeliveriesSuperseded += 1
      else result.newBalloonProposalDeliveriesFailed += 1
      continue
    }

    const responseExpiry = proposal ? newBalloonProposalResponseExpiry(proposal.valid_until) : null
    if (!proposal || !quote || !responseExpiry) {
      result.configurationBlocked += 1
      continue
    }

    const responseToken = signNewBalloonProposalCapability({
      proposalId: proposal.id,
      quoteRequestId: quote.id,
      buyerEmail: quote.email,
      expiresAt: responseExpiry,
      secret: serviceRoleKey,
    })
    if (!responseToken) {
      result.configurationBlocked += 1
      continue
    }
    const responseUrl = new URL('/new-balloon/proposal', siteUrl)
    responseUrl.searchParams.set('id', proposal.id)
    responseUrl.searchParams.set('token', responseToken)
    const notification = buildNewBalloonProposalBuyerNotification({ quote, proposal, responseUrl: responseUrl.toString() })
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'new_balloon_proposal_buyer',
        entityType: 'quote_proposal',
        entityId: proposal.id,
        recipientRole: 'buyer',
        to: quote.email,
        subject: notification.subject,
        html: notification.html,
        idempotencyKey: retry.idempotency_key,
      })
      if (delivery.skipped) {
        result.newBalloonProposalDeliveriesDeferred += 1
        continue
      }
      if (!delivery.success || !delivery.providerMessageId) {
        const { data: failedReadback, error: failedError } = await supabase
          .from('new_balloon_quote_proposals')
          .update({ delivery_status: 'failed', provider_message_id: null, delivery_error: 'Provider acceptance was not confirmed after the retry budget.', accepted_at: null })
          .eq('id', proposal.id)
          .select('delivery_status')
          .single()
        if (failedError || failedReadback?.delivery_status !== 'failed') throw new Error('Failed proposal recovery result could not be persisted')
        result.newBalloonProposalDeliveriesFailed += 1
        continue
      }
      const { data: acceptedId, error: acceptanceError } = await supabase.rpc('accept_new_balloon_proposal_delivery', {
        p_proposal_id: proposal.id,
        p_provider_message_id: delivery.providerMessageId,
      })
      const [{ data: proposalReadback }, { data: quoteReadback }] = await Promise.all([
        supabase.from('new_balloon_quote_proposals').select('id,delivery_status,provider_message_id,accepted_at').eq('id', proposal.id).single(),
        supabase.from('quote_requests').select('id,status').eq('id', quote.id).single(),
      ])
      if (acceptanceError || acceptedId !== proposal.id || proposalReadback?.delivery_status !== 'accepted' || proposalReadback.provider_message_id !== delivery.providerMessageId || !proposalReadback.accepted_at || quoteReadback?.status !== 'QUOTE_SENT') {
        throw new Error('Recovered proposal delivery transition was not verified')
      }
      if (delivery.duplicate) result.newBalloonProposalDeliveriesAlreadyAccepted += 1
      else result.newBalloonProposalDeliveriesAccepted += 1
    } catch (error) {
      console.error('New-balloon proposal delivery recovery failed:', error)
      result.newBalloonProposalDeliveriesFailed += 1
    }
  }

  for (const retry of newBalloonResponseAdminRetries) {
    const eventId = parseNewBalloonProposalResponseNotificationEventId(retry.idempotency_key)
    const event = eventId ? newBalloonResponseEventById.get(eventId) : null
    const proposal = newBalloonProposalById.get(retry.entity_id)
    const quote = proposal ? newBalloonQuoteById.get(proposal.quote_request_id) : null
    const exactRelationships = Boolean(event && proposal && quote
      && event.proposal_id === proposal.id
      && event.quote_request_id === quote.id)

    const responseRecoveryDecision = getNewBalloonResponseNotificationRecoveryDecision({
      receiptStatus: retry.status,
      hasProviderMessageId: Boolean(retry.provider_message_id),
      event,
      exactRelationships,
      quoteStatus: quote?.status,
    })
    if (responseRecoveryDecision === 'blocked') {
      result.configurationBlocked += 1
      continue
    }
    if (responseRecoveryDecision === 'reconcile') {
      if (!event || !retry.provider_message_id || !exactRelationships) {
        result.configurationBlocked += 1
        continue
      }
      const { data: readback, error } = await supabase
        .from('new_balloon_proposal_response_events')
        .update({ admin_notification_status: 'accepted', admin_notification_provider_id: retry.provider_message_id, admin_notification_error: null })
        .eq('id', event.id)
        .eq('proposal_id', proposal!.id)
        .select('admin_notification_status,admin_notification_provider_id')
        .single()
      if (error || readback?.admin_notification_status !== 'accepted' || readback.admin_notification_provider_id !== retry.provider_message_id) {
        result.newBalloonResponseNotificationsFailed += 1
      } else {
        result.newBalloonResponseNotificationsAlreadyAccepted += 1
      }
      continue
    }

    if (responseRecoveryDecision === 'superseded') {
      const exhausted = await exhaustNewBalloonReceipt(retry.id, 'Proposal response notification recovery was superseded by current commercial state.')
      if (event && event.admin_notification_status !== 'accepted') {
        await supabase
          .from('new_balloon_proposal_response_events')
          .update({ admin_notification_status: 'failed', admin_notification_provider_id: null, admin_notification_error: 'Notification recovery superseded by current commercial state.' })
          .eq('id', event.id)
      }
      if (exhausted) result.newBalloonResponseNotificationsSuperseded += 1
      else result.newBalloonResponseNotificationsFailed += 1
      continue
    }
    if (!event || !proposal || !quote || !exactRelationships) {
      result.configurationBlocked += 1
      continue
    }
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    const notification = buildNewBalloonProposalResponseAdminNotification({
      quote,
      proposal,
      event,
      responseLabel: newBalloonProposalResponseLabel(event.response_type),
      commercialPipelineUrl: `${siteUrl}/admin/commercial#quote-${quote.id}`,
    })
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'new_balloon_proposal_response_admin',
        entityType: 'quote_proposal',
        entityId: proposal.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: notification.subject,
        html: notification.html,
        idempotencyKey: retry.idempotency_key,
      })
      if (delivery.skipped) {
        result.newBalloonResponseNotificationsDeferred += 1
        continue
      }
      const notificationStatus = delivery.success ? 'accepted' : 'failed'
      const { data: readback, error } = await supabase
        .from('new_balloon_proposal_response_events')
        .update({
          admin_notification_status: notificationStatus,
          admin_notification_provider_id: delivery.providerMessageId,
          admin_notification_error: delivery.success ? null : 'Provider acceptance was not confirmed after the retry budget.',
        })
        .eq('id', event.id)
        .eq('proposal_id', proposal.id)
        .select('admin_notification_status,admin_notification_provider_id')
        .single()
      if (error || readback?.admin_notification_status !== notificationStatus) throw new Error('New-balloon response notification retry readback failed')
      if (delivery.duplicate) result.newBalloonResponseNotificationsAlreadyAccepted += 1
      else if (delivery.success) result.newBalloonResponseNotificationsAccepted += 1
      else result.newBalloonResponseNotificationsFailed += 1
    } catch (error) {
      console.error('New-balloon response admin notification recovery failed:', error)
      result.newBalloonResponseNotificationsFailed += 1
    }
  }

  for (const retry of negotiationRetries) {
    const eventId = parseNegotiationNotificationEventId(retry.notification_type, retry.idempotency_key)
    const event = eventId ? negotiationEventById.get(eventId) : null
    const inquiry = negotiationInquiryById.get(retry.entity_id)
    const listing = inquiry ? getNegotiationListing(inquiry) : null
    const notLatest = event?.inquiry_id === retry.entity_id
      && latestNegotiationEventByInquiry.get(retry.entity_id) !== event.id
    const terminallySuperseded = inquiry?.status === 'SPAM' || inquiry?.status === 'WON' || notLatest
    if (terminallySuperseded) {
      const { data: exhausted, error: exhaustedError } = await supabase
        .from('commercial_notification_receipts')
        .update({
          status: 'failed',
          delivery_attempts: 2,
          next_attempt_at: null,
          error_message: 'Notification superseded by later negotiation state.',
        })
        .eq('id', retry.id)
        .in('status', ['pending', 'failed'])
        .select('id,delivery_attempts,next_attempt_at')
        .single()
      if (exhaustedError || exhausted?.delivery_attempts !== 2 || exhausted.next_attempt_at !== null) result.negotiationNotificationsFailed += 1
      else result.negotiationNotificationsSuperseded += 1
      continue
    }
    if (!eventId || !event || event.inquiry_id !== retry.entity_id || !inquiry || !listing?.id || !listing.title || !listing.contact_email) {
      result.configurationBlocked += 1
      continue
    }

    try {
      if (retry.notification_type === 'inquiry_buyer_seller_response') {
        if (!['SELLER_ACCEPTED_FOR_NEGOTIATION', 'SELLER_COUNTERED', 'SELLER_DECLINED'].includes(event.event_type) || !inquiry.buyer_email) {
          result.configurationBlocked += 1
          continue
        }
        const capabilityExpiresAt = new Date(new Date(event.created_at).getTime() + inquiryBuyerCapabilityLifetimeMs)
        if (event.event_type !== 'SELLER_DECLINED' && capabilityExpiresAt <= new Date()) {
          result.configurationBlocked += 1
          continue
        }
        const buyerCapability = event.event_type === 'SELLER_DECLINED' ? null : signInquiryBuyerCapability({
          inquiryId: inquiry.id,
          eventId: event.id,
          buyerEmail: inquiry.buyer_email,
          expiresAt: capabilityExpiresAt,
          secret: serviceRoleKey,
        })
        if (event.event_type !== 'SELLER_DECLINED' && !buyerCapability) {
          result.configurationBlocked += 1
          continue
        }
        const buyerResponseUrl = buyerCapability
          ? `${siteUrl}/inquiry/respond?id=${encodeURIComponent(inquiry.id)}&event=${encodeURIComponent(event.id)}&token=${encodeURIComponent(buyerCapability)}`
          : null
        const buyerPortalCapability = signInquiryBuyerPortalCapability({
          inquiryId: inquiry.id,
          buyerEmail: inquiry.buyer_email,
          expiresAt: new Date(Date.now() + inquiryBuyerPortalCapabilityLifetimeMs),
          secret: serviceRoleKey,
        })
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
          buyerPortalUrl: buyerPortalCapability
            ? `${siteUrl}/inquiry/status?id=${encodeURIComponent(inquiry.id)}&token=${encodeURIComponent(buyerPortalCapability)}`
            : null,
        })
        const delivery = await sendCommercialReceiptEmail(supabase, {
          notificationType: retry.notification_type,
          entityType: 'inquiry',
          entityId: inquiry.id,
          recipientRole: 'buyer',
          to: inquiry.buyer_email,
          subject: notification.subject,
          html: notification.html,
          idempotencyKey: retry.idempotency_key,
        })
        if (delivery.skipped) {
          result.negotiationNotificationsDeferred += 1
          continue
        }
        const notificationStatus = delivery.success ? 'accepted' : 'failed'
        const { data: readback, error } = await supabase
          .from('marketplace_inquiry_offer_events')
          .update({
            buyer_notification_status: notificationStatus,
            buyer_notification_provider_id: delivery.providerMessageId,
            buyer_notification_error: delivery.success ? null : 'Provider acceptance was not confirmed after the retry budget.',
          })
          .eq('id', event.id)
          .eq('inquiry_id', inquiry.id)
          .select('buyer_notification_status,buyer_notification_provider_id')
          .single()
        if (error || readback?.buyer_notification_status !== notificationStatus) throw new Error('Buyer negotiation notification retry readback failed')
        if (delivery.duplicate) result.negotiationNotificationsAlreadyAccepted += 1
        else if (delivery.success) result.negotiationNotificationsAccepted += 1
        else result.negotiationNotificationsFailed += 1
      } else {
        if (!['BUYER_ACCEPTED_FOR_NEGOTIATION', 'BUYER_COUNTERED', 'BUYER_DECLINED'].includes(event.event_type) || !inquiry.buyer_name) {
          result.configurationBlocked += 1
          continue
        }
        const notification = buildBuyerResponseSellerNotification({
          listing: { title: listing.title },
          inquiry: { buyerName: inquiry.buyer_name },
          event: {
            eventType: event.event_type,
            amountMinor: event.amount_minor === null ? null : Number(event.amount_minor),
            currency: event.currency,
            note: event.note,
          },
          dashboardUrl: `${siteUrl}/dashboard`,
        })
        const delivery = await sendCommercialReceiptEmail(supabase, {
          notificationType: retry.notification_type,
          entityType: 'inquiry',
          entityId: inquiry.id,
          recipientRole: 'seller',
          to: listing.contact_email,
          subject: notification.subject,
          html: notification.html,
          idempotencyKey: retry.idempotency_key,
        })
        if (delivery.skipped) {
          result.negotiationNotificationsDeferred += 1
          continue
        }
        const notificationStatus = delivery.success ? 'accepted' : 'failed'
        const { data: readback, error } = await supabase
          .from('marketplace_inquiry_offer_events')
          .update({
            seller_notification_status: notificationStatus,
            seller_notification_provider_id: delivery.providerMessageId,
            seller_notification_error: delivery.success ? null : 'Provider acceptance was not confirmed after the retry budget.',
          })
          .eq('id', event.id)
          .eq('inquiry_id', inquiry.id)
          .select('seller_notification_status,seller_notification_provider_id')
          .single()
        if (error || readback?.seller_notification_status !== notificationStatus) throw new Error('Seller negotiation notification retry readback failed')
        if (delivery.duplicate) result.negotiationNotificationsAlreadyAccepted += 1
        else if (delivery.success) result.negotiationNotificationsAccepted += 1
        else result.negotiationNotificationsFailed += 1
      }
    } catch (error) {
      console.error('Negotiation notification recovery failed:', error)
      result.negotiationNotificationsFailed += 1
    }
  }

  for (const retry of inquiryBuyerAcknowledgementRetries) {
    const inquiry = buyerAcknowledgementInquiryById.get(retry.entity_id)
    const listing = Array.isArray(inquiry?.listings) ? inquiry.listings[0] : inquiry?.listings
    if (!inquiry?.buyer_email || !listing?.id || !listing.title) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const buyerPortalToken = signInquiryBuyerPortalCapability({
        inquiryId: inquiry.id,
        buyerEmail: inquiry.buyer_email,
        expiresAt: new Date(Date.now() + inquiryBuyerPortalCapabilityLifetimeMs),
        secret: serviceRoleKey,
      })
      const buyerPortalUrl = buyerPortalToken
        ? `${siteUrl}/inquiry/status?id=${encodeURIComponent(inquiry.id)}&token=${encodeURIComponent(buyerPortalToken)}`
        : null
      const indicativeOffer = inquiry.initial_offer_amount_minor === null
        ? null
        : (inquiry.initial_offer_amount_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: inquiry.currency })
      const acknowledgement = buildInquiryBuyerAcknowledgement({
        listingTitle: listing.title,
        listingUrl: `${siteUrl}/catalog/${listing.id}`,
        buyerPortalUrl,
        indicativeOffer,
        sellerDeliveryAccepted: inquiry.seller_notification_status === 'accepted',
      })
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'inquiry_buyer_ack',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'buyer',
        to: inquiry.buyer_email,
        subject: acknowledgement.subject,
        html: acknowledgement.html,
        idempotencyKey: `inquiry-buyer-ack-${inquiry.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('Marketplace enquiry buyer acknowledgement retry failed:', error)
      result.failed += 1
    }
  }

  for (const retry of newBalloonBuyerAcknowledgementRetries) {
    const quote = buyerAcknowledgementQuoteById.get(retry.entity_id)
    if (!quote?.email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const acknowledgement = buildNewBalloonBuyerAcknowledgement(quote, siteUrl)
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'new_balloon_buyer_ack',
        entityType: 'quote_request',
        entityId: quote.id,
        recipientRole: 'buyer',
        to: quote.email,
        subject: acknowledgement.subject,
        html: acknowledgement.html,
        idempotencyKey: `new-balloon-buyer-ack-${quote.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('New-balloon buyer acknowledgement retry failed:', error)
      result.failed += 1
    }
  }

  for (const intent of buyerEarlyAccessRecoveries) {
    if (!intent.buyer_email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'buyer_early_access_checkout_recovery',
        entityType: 'premium_checkout_intent',
        entityId: intent.intent_id,
        recipientRole: 'buyer',
        to: intent.buyer_email,
        subject: `Resume your ${buyerEarlyAccessProduct.publicName} checkout`,
        html: `<h2>Your Buyer Early Access checkout expired</h2>
        <p>AeroTrade has no verified Buyer Early Access payment from the checkout you started. Your account remains active.</p>
        <p>If you still want 48-hour early access and instant listing alerts for 9.99 EUR per year, <a href="${escapeHtml(`${siteUrl}/dashboard`)}">sign in to your dashboard and choose Get Buyer Early Access</a>.</p>
        <p>This email creates no checkout and makes no charge. A new Stripe checkout is created only after you choose to continue from your dashboard. You can ignore this message if you no longer want Buyer Early Access.</p>
        <p>This is the only recovery reminder for this expired checkout.</p>`,
        idempotencyKey: `buyer-early-access-checkout-recovery-${intent.intent_id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('Buyer Early Access checkout recovery failed:', error)
      result.failed += 1
    }
  }

  for (const inquiry of inquiries) {
    const listing = getInquiryListing(inquiry)
    if (!listing?.contact_email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'inquiry_seller_followup',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'seller',
        to: listing.contact_email,
        subject: `AeroTrade reminder: buyer enquiry awaiting your response`,
        html: `<h2>A buyer enquiry still needs attention</h2>
        <p>Your AeroTrade listing <strong>${escapeHtml(listing.title)}</strong> has an enquiry that has remained open for more than 24 hours.</p>
        <p><a href="${escapeHtml(`${siteUrl}/dashboard`)}">Open your dashboard to contact the buyer and update the opportunity</a>.</p>
        <p>This is a single operational reminder, not a marketing campaign.</p>`,
        idempotencyKey: `inquiry-seller-followup-${inquiry.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('Seller enquiry follow-up failed:', error)
      result.failed += 1
    }
  }

  for (const inquiry of sellerEnquiryEscalations) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'inquiry_seller_escalation',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: seller response overdue after reminder',
        html: `<h2>A marketplace enquiry needs manual recovery</h2>
        <p>The seller has not advanced an open buyer enquiry at least 48 hours after AeroTrade received provider acceptance for the single seller reminder.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial#inquiry-${inquiry.id}`)}">Open this enquiry in the commercial pipeline</a> and decide whether to contact the seller manually.</p>
        <p>This internal escalation sends nothing to the buyer, makes no promise and performs no reservation, payment or contract action.</p>`,
        idempotencyKey: `inquiry-seller-escalation-${inquiry.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('Seller enquiry escalation failed:', error)
      result.failed += 1
    }
  }

  for (const quote of quotes) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'quote_admin_followup',
        entityType: 'quote_request',
        entityId: quote.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: new-balloon quote awaiting action',
        html: `<h2>A new-balloon opportunity is still open</h2>
        <p>A factory-new Pasha or Schroeder quote request has remained in NEW status for more than 24 hours.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the commercial pipeline and assign the next action</a>.</p>`,
        idempotencyKey: `quote-admin-followup-${quote.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('New-balloon quote follow-up failed:', error)
      result.failed += 1
    }
  }

  for (const quote of buyerResponseQuotes) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'new_balloon_proposal_response_followup',
        entityType: 'quote_request',
        entityId: quote.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: buyer response awaiting action',
        html: `<h2>A new-balloon buyer response still needs action</h2>
        <p>The buyer responded to an indicative Pasha or Schroeder proposal more than 24 hours ago, but the opportunity is still in BUYER_RESPONDED.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the commercial pipeline and record the next action</a>.</p>
        <p>This is one operational reminder. It does not create an order, reservation, payment or contract.</p>`,
        idempotencyKey: `new-balloon-proposal-response-followup-${quote.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('New-balloon proposal response follow-up failed:', error)
      result.failed += 1
    }
  }

  for (const listing of premiumListings) {
    if (!listing.contact_email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'premium_listing_checkout_recovery',
        entityType: 'listing',
        entityId: listing.id,
        recipientRole: 'seller',
        to: listing.contact_email,
        subject: 'AeroTrade: your Seller Launch Promotion checkout is incomplete',
        html: `<h2>Your listing is safely stored</h2>
        <p><strong>${escapeHtml(listing.title)}</strong> is still not public because its one-time Seller Launch Promotion checkout has not completed.</p>
        <p><a href="${escapeHtml(`${siteUrl}/dashboard`)}">Open your AeroTrade dashboard</a> to continue the 5 EUR promotion checkout or publish the listing using the free option.</p>
        <p>No new account or duplicate listing is required. This is a single operational reminder.</p>`,
        idempotencyKey: `premium-listing-checkout-recovery-${listing.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1

      if (delivery.success) {
        await persistSellerFunnelEvent(supabase, {
          sellerId: listing.seller_id,
          listingId: listing.id,
          listingPlan: 'premium',
          stage: 'CHECKOUT_RECOVERY_SENT',
          source: 'recovery',
        })
      }
    } catch (error) {
      console.error('Premium listing checkout recovery failed:', error)
      result.failed += 1
    }
  }

  for (const request of sellerAssistance) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'seller_assistance_admin_followup',
        entityType: 'seller_assistance',
        entityId: request.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: assisted seller is still awaiting review',
        html: `<h2>An assisted-sale opportunity still needs attention</h2>
        <p>A private seller request has remained in NEW status for more than 24 hours.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the existing commercial pipeline and record the next action</a>.</p>`,
        idempotencyKey: `seller-assistance-admin-followup-${request.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('Seller-assistance follow-up failed:', error)
      result.failed += 1
    }
  }

  const hasFailure = result.failed > 0 || result.configurationBlocked > 0 || result.sellerAvailabilityDigestsFailed > 0 || result.publicNewsletterConfirmationsFailed > 0 || result.listingVerificationInstructionsFailed > 0
  return NextResponse.json(result, { status: hasFailure ? 502 : 200 })
}
