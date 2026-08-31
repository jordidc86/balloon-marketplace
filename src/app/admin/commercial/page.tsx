import { createAdminClient } from '@/utils/supabase/server'
import { BellRing, CheckCircle2, CircleDollarSign, CreditCard, MessageSquare, Plane, Store, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { listingMatchesWantedRequest } from '@/utils/wanted-request.mjs'
import { buildNewBalloonManufacturerFunnel, newBalloonManufacturers } from '@/utils/new-balloon-manufacturers.mjs'
import { getListingAvailabilityState } from '@/utils/listing-availability.mjs'
import { buildComparableBuyerFunnel } from '@/utils/buyer-funnel.mjs'
import { isSellerEnquiryEscalationDue } from '@/utils/opportunity-followup.mjs'
import { sellerAvailabilityDigestIdempotencyKey, sellerAvailabilityDigestReadiness } from '@/utils/seller-availability-digest.mjs'
import { getSocialAcquisitionMode } from '@/utils/social-publication.mjs'
import { clarifyListingSale, recordCommercialOutcome, recordCommercialUnitEconomics, requestSellerAvailabilityDigest, sendNewBalloonProposal, updateAdminInquiryStatus, updateQuoteRequestStatus, updateSellerAssistanceStatus, updateWantedRequestStatus } from '../actions'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  listing_id: string
  buyer_name: string
  buyer_email: string
  currency: string
  initial_offer_amount_minor: number | null
  status: string
  seller_notification_status: string
  created_at: string
  last_activity_at: string
  journey_key: string | null
  listings: { id: string; title: string } | null
}

type NegotiationEvent = {
  id: string
  inquiry_id: string
  event_type: 'BUYER_OFFERED' | 'BUYER_ACCEPTED_FOR_NEGOTIATION' | 'BUYER_COUNTERED' | 'BUYER_DECLINED' | 'SELLER_ACCEPTED_FOR_NEGOTIATION' | 'SELLER_COUNTERED' | 'SELLER_DECLINED'
  actor_role: 'BUYER' | 'SELLER' | 'ADMIN'
  amount_minor: number | null
  currency: string
  buyer_notification_status: 'pending' | 'accepted' | 'failed' | 'not_required'
  seller_notification_status: 'pending' | 'accepted' | 'failed' | 'not_required'
  created_at: string
}

type Quote = {
  id: string
  name: string
  email: string
  equipment_type: string
  manufacturer_preference: string | null
  source_context: string
  status: string
  created_at: string
  journey_key: string | null
}

type NewBalloonProposal = { id: string; quote_request_id: string; manufacturer: string; currency: string; amount_min_minor: number; amount_max_minor: number; delivery_status: string; valid_until: string; created_at: string }
type NewBalloonProposalResponse = { id: string; proposal_id: string; quote_request_id: string; response_type: 'INTERESTED' | 'QUESTION' | 'DECLINED'; note: string | null; admin_notification_status: 'pending' | 'accepted' | 'failed'; created_at: string }

type WantedRequest = {
  id: string
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  category: string
  location_preference: string | null
  currency: string
  budget_min_minor: number | null
  budget_max_minor: number | null
  details: string
  notify_on_match: boolean
  status: string
  utm_source: string | null
  created_at: string
  journey_key: string | null
}

type MatchableListing = {
  id: string
  title: string
  category: string
  status: string
  currency: string
  price: number
}

type WantedMatchDispatch = {
  id: string
  wanted_request_id: string
  listing_ids: string[]
  status: 'PENDING' | 'ACCEPTED' | 'FAILED' | 'CANCELLED'
  accepted_at: string | null
  updated_at: string
}

type CatalogSearchEvent = {
  id: string
  entry_context: 'catalog_search' | 'buyer_landing_en' | 'buyer_landing_de' | 'buyer_landing_fr' | 'buyer_landing_es'
  query_text: string | null
  category: string | null
  country: string | null
  result_count: number
  zero_results: boolean
  utm_source: string | null
  journey_key: string | null
  created_at: string
}

type ListingEvent = {
  event_type: 'VIEW' | 'CONTACT_REVEAL' | string
  journey_key: string | null
  utm_source: string | null
  created_at: string
}

type SellerFunnelEvent = {
  id: string
  seller_id: string
  listing_id: string | null
  stage: string
  listing_plan: string | null
  source: string
  entry_context: string
  created_at: string
}

type SellerPipelineListing = {
  id: string
  seller_id: string
  title: string
  status: string
  contact_email: string
  created_at: string
  updated_at: string
}

type SellerUser = {
  id: string
  email: string
  is_premium: boolean
  premium_source: string | null
  stripe_subscription_id: string | null
}

type SellerAssistance = {
  id: string
  seller_user_id: string | null
  linked_listing_id: string | null
  name: string
  email: string
  phone: string | null
  category: string
  manufacturer: string | null
  model: string | null
  manufacture_year: number | null
  location_country: string | null
  expected_price_minor: number | null
  currency: string
  existing_listing_url: string | null
  documentation_readiness: string
  photo_readiness: string
  timeline: string
  help_needed: string[]
  notes: string | null
  status: string
  source_context: string
  created_at: string
  last_activity_at: string
}

type CommercialNotification = {
  id: string
  notification_type: string
  entity_type: string
  entity_id: string
  status: string
  idempotency_key: string
  delivery_attempts: number
  next_attempt_at: string | null
  accepted_at: string | null
  created_at: string
}

type ListingWatcher = {
  id: string
  listing_id: string
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'UNSUBSCRIBED' | 'BLOCKED' | 'LISTING_CLOSED'
  journey_key: string | null
  created_at: string
  confirmed_at: string | null
}

type ListingWatchDispatch = {
  id: string
  watcher_id: string
  status: 'PENDING' | 'ACCEPTED' | 'FAILED' | 'CANCELLED'
  accepted_at: string | null
  updated_at: string
}

type ListingAvailabilityConfirmation = {
  id: string
  listing_id: string
  confirmed_at: string
}

type ListingLifecycleEvent = {
  id: string
  listing_id: string
  actor_role: 'SELLER' | 'ADMIN'
  event_type: 'SOLD' | 'WITHDRAWN'
  sale_channel: 'AEROTRADE' | 'OTHER_CHANNEL' | 'NOT_DISCLOSED' | null
  marketplace_inquiry_id: string | null
  gross_amount_minor: number | null
  currency: string | null
  created_at: string
  listings: { title: string } | null
}

type ListingSaleClarification = {
  id: string
  lifecycle_event_id: string
  listing_id: string
  sale_channel: 'AEROTRADE' | 'OTHER_CHANNEL'
  marketplace_inquiry_id: string | null
  gross_amount_minor: number | null
  currency: string | null
  actor_role: 'ADMIN'
  created_at: string
}

type EffectiveListingLifecycleEvent = ListingLifecycleEvent & {
  clarification_id: string | null
  clarified_at: string | null
}

type OutcomeSuggestion = {
  gross_amount_minor: number | null
  currency: string | null
  reported_at: string
}

type CommercialOutcome = {
  id: string
  entity_type: 'marketplace_inquiry' | 'quote_request'
  entity_id: string
  outcome_type: string
  currency: string
  gross_amount_minor: number
  aerotrade_revenue_minor: number
  evidence_level: string
  evidence_source: string
  evidence_reference: string | null
  notes: string | null
  direct_cost_minor: number | null
  payment_fee_minor: number | null
  tax_amount_minor: number | null
  contribution_margin_minor: number | null
  economics_evidence_level: 'reported' | 'documented' | 'settled' | null
  economics_evidence_source: string | null
  economics_evidence_reference: string | null
  economics_notes: string | null
  economics_recorded_at: string | null
  closed_at: string
  settled_at: string | null
}

type IndexingSubmissionReceipt = {
  id: string
  provider: 'INDEXNOW'
  url_count: number
  status: 'PENDING' | 'ACCEPTED' | 'FAILED'
  attempts: number
  provider_status_code: number | null
  attempted_at: string | null
  accepted_at: string | null
}

type SocialPublicationReceipt = {
  status: 'pending' | 'accepted' | 'failed'
  network: 'instagram' | 'facebook'
  placement: 'post' | 'story' | 'carousel' | 'reel' | 'video'
  content_kind: 'listing' | 'brand'
  attempt_count: number
  retryable: boolean
  created_at: string
  accepted_at: string | null
}

type PublicNewsletterSubscriptionEvidence = {
  id: string
  status: 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED'
  source_context: 'home' | 'catalog' | 'unknown'
  utm_source: string | null
  journey_key: string | null
  requested_at: string
  confirmed_at: string | null
  unsubscribed_at: string | null
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
}).format(new Date(value))

const openInquiryStatuses = ['NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING']

export default async function CommercialPage() {
  const supabase = await createAdminClient()
  // This is a force-dynamic server component; the cutoff is intentionally evaluated per request.
  /* eslint-disable react-hooks/purity */
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const nowMs = Date.now()
  /* eslint-enable react-hooks/purity */
  const defaultProposalValidUntil = new Date(nowMs + 30 * 86_400_000).toISOString().slice(0, 10)
  const [{ data: inquiries, error: inquiriesError }, { data: negotiationEvents, error: negotiationEventsError }, { data: quotes, error: quotesError }, { data: proposals, error: proposalsError }, { data: proposalResponses, error: proposalResponsesError }, { data: wantedRequests, error: wantedError }, { data: wantedMatchDispatches, error: wantedMatchDispatchError }, { data: matchableListings }, { data: searchEvents, error: searchEventsError }, { data: sellerFunnelEvents, error: sellerFunnelError }, { data: sellerPipelineListings, error: sellerListingsError }, { data: sellerUsers, error: sellerUsersError }, { data: sellerAssistance, error: sellerAssistanceError }, { data: receipts }, { data: events }, { data: notifications, error: notificationsError }, { data: outcomes, error: outcomesError }, { data: indexingReceipts, error: indexingError }, { data: listingWatchers, error: listingWatchersError }, { data: listingWatchDispatches, error: listingWatchDispatchesError }, { data: socialPublicationReceipts, error: socialPublicationError }, { data: newsletterPublicSubscriptions, error: newsletterPublicSubscriptionsError }] = await Promise.all([
    supabase.from('marketplace_inquiries').select('id,listing_id,buyer_name,buyer_email,currency,initial_offer_amount_minor,status,seller_notification_status,created_at,last_activity_at,journey_key,listings(id,title)').order('created_at', { ascending: false }).limit(100),
    supabase.from('marketplace_inquiry_offer_events').select('id,inquiry_id,event_type,actor_role,amount_minor,currency,buyer_notification_status,seller_notification_status,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('quote_requests').select('id,name,email,equipment_type,manufacturer_preference,source_context,status,created_at,journey_key').order('created_at', { ascending: false }).limit(100),
    supabase.from('new_balloon_quote_proposals').select('id,quote_request_id,manufacturer,currency,amount_min_minor,amount_max_minor,delivery_status,valid_until,created_at').order('created_at', { ascending: false }).limit(300),
    supabase.from('new_balloon_proposal_response_events').select('id,proposal_id,quote_request_id,response_type,note,admin_notification_status,created_at').order('created_at', { ascending: false }).limit(300),
    supabase.from('wanted_requests').select('id,buyer_name,buyer_email,buyer_phone,category,location_preference,currency,budget_min_minor,budget_max_minor,details,notify_on_match,status,utm_source,created_at,journey_key').order('created_at', { ascending: false }).limit(100),
    supabase.from('wanted_match_dispatches').select('id,wanted_request_id,listing_ids,status,accepted_at,updated_at').order('updated_at', { ascending: false }).limit(500),
    supabase.from('listings').select('id,title,category,status,currency,price').in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']),
    supabase.from('catalog_search_events').select('id,entry_context,query_text,category,country,result_count,zero_results,utm_source,journey_key,created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(500),
    supabase.from('seller_funnel_events').select('id,seller_id,listing_id,stage,listing_plan,source,entry_context,created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(500),
    supabase.from('listings').select('id,seller_id,title,status,contact_email,created_at,updated_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('users').select('id,email,is_premium,premium_source,stripe_subscription_id').limit(500),
    supabase.from('seller_assistance_requests').select('id,seller_user_id,linked_listing_id,name,email,phone,category,manufacturer,model,manufacture_year,location_country,expected_price_minor,currency,documentation_readiness,photo_readiness,timeline,help_needed,notes,existing_listing_url,status,source_context,created_at,last_activity_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('payment_notification_receipts').select('payment_type,livemode,amount_minor,currency,stripe_checkout_session_id,user_id,listing_id,accepted_at').order('accepted_at', { ascending: false }).limit(100),
    supabase.from('listing_events').select('event_type,journey_key,utm_source,created_at').gte('created_at', thirtyDaysAgo),
    supabase.from('commercial_notification_receipts').select('id,notification_type,entity_type,entity_id,status,idempotency_key,delivery_attempts,next_attempt_at,accepted_at,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('commercial_outcomes').select('id,entity_type,entity_id,outcome_type,currency,gross_amount_minor,aerotrade_revenue_minor,evidence_level,evidence_source,evidence_reference,notes,direct_cost_minor,payment_fee_minor,tax_amount_minor,contribution_margin_minor,economics_evidence_level,economics_evidence_source,economics_evidence_reference,economics_notes,economics_recorded_at,closed_at,settled_at').order('closed_at', { ascending: false }).limit(200),
    supabase.from('indexing_submission_receipts').select('id,provider,url_count,status,attempts,provider_status_code,attempted_at,accepted_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('listing_watchers').select('id,listing_id,status,journey_key,created_at,confirmed_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('listing_watch_dispatches').select('id,watcher_id,status,accepted_at,updated_at').order('updated_at', { ascending: false }).limit(500),
    supabase.from('social_publication_receipts').select('status,network,placement,content_kind,attempt_count,retryable,created_at,accepted_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(1000),
    supabase.from('newsletter_public_subscriptions').select('id,status,source_context,utm_source,journey_key,requested_at,confirmed_at,unsubscribed_at').gte('requested_at', thirtyDaysAgo).order('requested_at', { ascending: false }).limit(1000),
  ])

  const typedInquiries = (inquiries || []) as unknown as Inquiry[]
  const typedNegotiationEvents = (negotiationEvents || []) as NegotiationEvent[]
  const typedQuotes = (quotes || []) as Quote[]
  const typedProposals = (proposals || []) as NewBalloonProposal[]
  const typedProposalResponses = (proposalResponses || []) as NewBalloonProposalResponse[]
  const typedWantedRequests = (wantedRequests || []) as WantedRequest[]
  const typedWantedMatchDispatches = (wantedMatchDispatches || []) as WantedMatchDispatch[]
  const typedMatchableListings = (matchableListings || []) as MatchableListing[]
  const typedSearchEvents = (searchEvents || []) as CatalogSearchEvent[]
  const typedSellerFunnelEvents = (sellerFunnelEvents || []) as SellerFunnelEvent[]
  const typedSellerPipelineListings = (sellerPipelineListings || []) as SellerPipelineListing[]
  const typedSellerUsers = (sellerUsers || []) as SellerUser[]
  const typedSellerAssistance = (sellerAssistance || []) as SellerAssistance[]
  const typedNotifications = (notifications || []) as CommercialNotification[]
  const typedListingEvents = (events || []) as ListingEvent[]
  const typedListingWatchers = (listingWatchers || []) as ListingWatcher[]
  const typedListingWatchDispatches = (listingWatchDispatches || []) as ListingWatchDispatch[]
  const typedSocialPublicationReceipts = (socialPublicationReceipts || []) as SocialPublicationReceipt[]
  const typedPublicNewsletterSubscriptions = (newsletterPublicSubscriptions || []) as PublicNewsletterSubscriptionEvidence[]
  const { data: listingAvailabilityConfirmations, error: listingAvailabilityError } = await supabase
    .from('listing_availability_confirmations')
    .select('id,listing_id,confirmed_at')
    .order('confirmed_at', { ascending: false })
    .limit(2000)
  const { data: listingCheckoutIntents, error: listingCheckoutIntentsError } = await supabase
    .from('listing_checkout_intents')
    .select('id,listing_id,user_id,source,status,created_at,completed_at')
    .order('created_at', { ascending: false })
    .limit(500)
  const { data: lifecycleEvents, error: lifecycleEventsError } = await supabase
    .from('listing_lifecycle_events')
    .select('id,listing_id,actor_role,event_type,sale_channel,marketplace_inquiry_id,gross_amount_minor,currency,created_at,listings(title)')
    .order('created_at', { ascending: false })
    .limit(500)
  const { data: saleClarifications, error: saleClarificationsError } = await supabase
    .from('listing_sale_clarifications')
    .select('id,lifecycle_event_id,listing_id,sale_channel,marketplace_inquiry_id,gross_amount_minor,currency,actor_role,created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  const latestAvailabilityRowsByListing = ((listingAvailabilityConfirmations as ListingAvailabilityConfirmation[] | null) || []).reduce<Map<string, ListingAvailabilityConfirmation>>((latest, confirmation) => {
    if (!latest.has(confirmation.listing_id)) latest.set(confirmation.listing_id, confirmation)
    return latest
  }, new Map())
  const latestAvailabilityByListing = new Map([...latestAvailabilityRowsByListing].map(([listingId, confirmation]) => [listingId, confirmation.confirmed_at]))
  const negotiationEventsByInquiry = typedNegotiationEvents.reduce<Map<string, NegotiationEvent[]>>((byInquiry, event) => {
    const inquiryEvents = byInquiry.get(event.inquiry_id) || []
    inquiryEvents.push(event)
    byInquiry.set(event.inquiry_id, inquiryEvents)
    return byInquiry
  }, new Map())
  const wantedDispatchesByRequest = typedWantedMatchDispatches.reduce<Map<string, WantedMatchDispatch[]>>((byRequest, dispatch) => {
    const rows = byRequest.get(dispatch.wanted_request_id) || []
    rows.push(dispatch)
    byRequest.set(dispatch.wanted_request_id, rows)
    return byRequest
  }, new Map())
  const premiumRecoveryByListing = new Map(typedNotifications
    .filter((notification) => notification.notification_type === 'premium_listing_checkout_recovery')
    .map((notification) => [notification.entity_id, notification.status]))
  const sellerReminderByInquiry = new Map(typedNotifications
    .filter((notification) => notification.notification_type === 'inquiry_seller_followup')
    .map((notification) => [notification.entity_id, notification]))
  const sellerEscalationByInquiry = new Map(typedNotifications
    .filter((notification) => notification.notification_type === 'inquiry_seller_escalation')
    .map((notification) => [notification.entity_id, notification]))
  const stalledSellerInquiryIds = new Set(typedInquiries
    .filter((inquiry) => {
      const reminder = sellerReminderByInquiry.get(inquiry.id)
      return isSellerEnquiryEscalationDue({ inquiryStatus: inquiry.status, reminderStatus: reminder?.status, reminderAcceptedAt: reminder?.accepted_at }, new Date(nowMs))
    })
    .map((inquiry) => inquiry.id))
  const availabilityDigestBySeller = new Map<string, CommercialNotification>()
  for (const notification of typedNotifications.filter((item) => item.notification_type === 'seller_availability_digest')) {
    if (!availabilityDigestBySeller.has(notification.entity_id)) availabilityDigestBySeller.set(notification.entity_id, notification)
  }
  const availabilityDueBySeller = typedSellerPipelineListings
    .filter((listing) => (
      ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(listing.status)
      && !getListingAvailabilityState(latestAvailabilityByListing.get(listing.id), new Date(nowMs)).publiclyFresh
    ))
    .reduce<Map<string, SellerPipelineListing[]>>((bySeller, listing) => {
      const due = bySeller.get(listing.seller_id) || []
      due.push(listing)
      bySeller.set(listing.seller_id, due)
      return bySeller
    }, new Map())
  const typedOutcomes = (outcomes || []) as CommercialOutcome[]
  const typedLifecycleEvents = (lifecycleEvents || []) as unknown as ListingLifecycleEvent[]
  const typedSaleClarifications = (saleClarifications || []) as ListingSaleClarification[]
  const clarificationByLifecycleEvent = new Map(typedSaleClarifications.map((clarification) => [clarification.lifecycle_event_id, clarification]))
  const effectiveLifecycleEvents: EffectiveListingLifecycleEvent[] = typedLifecycleEvents.map((event) => {
    const clarification = clarificationByLifecycleEvent.get(event.id)
    return clarification ? {
      ...event,
      sale_channel: clarification.sale_channel,
      marketplace_inquiry_id: clarification.marketplace_inquiry_id,
      gross_amount_minor: clarification.gross_amount_minor,
      currency: clarification.currency,
      clarification_id: clarification.id,
      clarified_at: clarification.created_at,
    } : { ...event, clarification_id: null, clarified_at: null }
  })
  const effectiveLifecycleEventById = new Map(effectiveLifecycleEvents.map((event) => [event.id, event]))
  const typedIndexingReceipts = (indexingReceipts || []) as IndexingSubmissionReceipt[]
  const latestIndexingReceipt = typedIndexingReceipts[0]
  const outcomesByEntity = new Map(typedOutcomes.map((outcome) => [`${outcome.entity_type}:${outcome.entity_id}`, outcome]))
  const pendingReportedSaleReview = effectiveLifecycleEvents.filter((event) => (
    event.event_type === 'SOLD'
    && event.sale_channel === 'AEROTRADE'
    && event.marketplace_inquiry_id
    && !outcomesByEntity.has(`marketplace_inquiry:${event.marketplace_inquiry_id}`)
  ))
  const closureSuggestionByInquiry = new Map<string, OutcomeSuggestion>(effectiveLifecycleEvents
    .filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'AEROTRADE' && event.marketplace_inquiry_id)
    .map((event) => [event.marketplace_inquiry_id as string, {
      gross_amount_minor: event.gross_amount_minor,
      currency: event.currency,
      reported_at: event.clarified_at || event.created_at,
    }]))
  const sellerReportedAeroTradeSales = effectiveLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'AEROTRADE')
  const sellerReportedOtherSales = effectiveLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'OTHER_CHANNEL')
  const sellerReportedUndisclosedSales = effectiveLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'NOT_DISCLOSED')
  const withdrawnListings = effectiveLifecycleEvents.filter((event) => event.event_type === 'WITHDRAWN')
  const latestProposalByQuote = new Map<string, NewBalloonProposal>()
  for (const proposal of typedProposals) if (!latestProposalByQuote.has(proposal.quote_request_id)) latestProposalByQuote.set(proposal.quote_request_id, proposal)
  const responseByProposal = new Map<string, NewBalloonProposalResponse>()
  for (const response of typedProposalResponses) if (!responseByProposal.has(response.proposal_id)) responseByProposal.set(response.proposal_id, response)
  const newBalloonManufacturerFunnel = buildNewBalloonManufacturerFunnel({
    quotes: typedQuotes,
    proposals: typedProposals,
    responses: typedProposalResponses,
    outcomes: typedOutcomes,
  })
  const views = typedListingEvents.filter((event) => event.event_type === 'VIEW').length
  const soldListingViews = typedListingEvents.filter((event) => event.event_type === 'SOLD_VIEW')
  const reveals = typedListingEvents.filter((event) => event.event_type === 'CONTACT_REVEAL').length
  const sharedLinkViews = typedListingEvents.filter((event) => event.event_type === 'VIEW' && ['seller_share', 'listing_share'].includes(event.utm_source || '')).length
  const recentInquiries = typedInquiries.filter((inquiry) => inquiry.created_at >= thirtyDaysAgo)
  const comparableBuyerFunnel = buildComparableBuyerFunnel({ events: typedListingEvents, inquiries: typedInquiries, now: new Date(nowMs) })
  const enquiryCtaClicks = comparableBuyerFunnel.ctaClicks
  const enquiryFormViews = comparableBuyerFunnel.formViews
  const enquiryFormStarts = comparableBuyerFunnel.formStarts
  const recentQuotes = typedQuotes.filter((quote) => quote.created_at >= thirtyDaysAgo)
  const recentWanted = typedWantedRequests.filter((request) => request.created_at >= thirtyDaysAgo)
  const soldListingNewBalloonRequests = recentQuotes.filter((quote) => quote.source_context === 'sold-listing')
  const soldListingWantedRequests = recentWanted.filter((request) => request.utm_source === 'sold_listing')
  const soldListingViewJourneyKeys = new Set(soldListingViews.map((event) => event.journey_key).filter((key): key is string => Boolean(key)))
  const soldListingRecoveredJourneyKeys = new Set([
    ...soldListingNewBalloonRequests.map((quote) => quote.journey_key),
    ...soldListingWantedRequests.map((request) => request.journey_key),
  ].filter((key): key is string => typeof key === 'string' && soldListingViewJourneyKeys.has(key)))
  const viewJourneyKeys = new Set(typedListingEvents.filter((event) => event.event_type === 'VIEW' && event.journey_key).map((event) => event.journey_key as string))
  const searchJourneyKeys = new Set(typedSearchEvents.filter((event) => event.journey_key).map((event) => event.journey_key as string))
  const revealJourneyKeys = new Set(typedListingEvents.filter((event) => event.event_type === 'CONTACT_REVEAL' && event.journey_key).map((event) => event.journey_key as string))
  const watchJourneyKeys = new Set(typedListingWatchers.filter((watcher) => watcher.status === 'ACTIVE' && watcher.created_at >= thirtyDaysAgo && watcher.journey_key).map((watcher) => watcher.journey_key as string))
  const requestJourneyKeys = new Set([
    ...recentInquiries.map((inquiry) => inquiry.journey_key),
    ...recentWanted.map((request) => request.journey_key),
    ...recentQuotes.map((quote) => quote.journey_key),
  ].filter((key): key is string => Boolean(key)))
  const catalogOnlySearchEvents = typedSearchEvents.filter((event) => event.entry_context === 'catalog_search')
  const localizedBuyerEntryEvents = typedSearchEvents.filter((event) => event.entry_context.startsWith('buyer_landing_'))
  const localizedBuyerJourneyKeys = new Set(localizedBuyerEntryEvents.map((event) => event.journey_key).filter((key): key is string => Boolean(key)))
  const localizedBuyerListingViewJourneys = new Set(typedListingEvents
    .filter((event) => event.event_type === 'VIEW' && event.journey_key && localizedBuyerJourneyKeys.has(event.journey_key))
    .map((event) => event.journey_key as string))
  const localizedBuyerHighIntentJourneys = new Set([...watchJourneyKeys, ...requestJourneyKeys]
    .filter((journeyKey) => localizedBuyerJourneyKeys.has(journeyKey)))
  const localizedBuyerEntryCounts = localizedBuyerEntryEvents.reduce<Map<string, number>>((counts, event) => {
    counts.set(event.entry_context, (counts.get(event.entry_context) || 0) + 1)
    return counts
  }, new Map())
  const attributableJourneyKeys = new Set([
    ...viewJourneyKeys,
    ...searchJourneyKeys,
    ...revealJourneyKeys,
    ...watchJourneyKeys,
    ...requestJourneyKeys,
  ])
  const unattributedLegacyViews = typedListingEvents.filter((event) => event.event_type === 'VIEW' && !event.journey_key).length
  const openInquiries = typedInquiries.filter((inquiry) => openInquiryStatuses.includes(inquiry.status)).length
  const openWanted = typedWantedRequests.filter((request) => !['CLOSED', 'SPAM'].includes(request.status)).length
  const openSellerAssistance = typedSellerAssistance.filter((request) => !['LISTED', 'CLOSED', 'SPAM'].includes(request.status)).length
  const activeListingWatchers = typedListingWatchers.filter((watcher) => watcher.status === 'ACTIVE').length
  const pendingListingWatchers = typedListingWatchers.filter((watcher) => watcher.status === 'PENDING_CONFIRMATION').length
  const closedListingWatchers = typedListingWatchers.filter((watcher) => watcher.status === 'LISTING_CLOSED').length
  const acceptedListingWatchUpdates = typedListingWatchDispatches.filter((dispatch) => dispatch.status === 'ACCEPTED').length
  const failedListingWatchUpdates = typedListingWatchDispatches.filter((dispatch) => dispatch.status === 'FAILED').length
  const activeListingsWithFreshAvailability = typedMatchableListings.filter((listing) => getListingAvailabilityState(latestAvailabilityByListing.get(listing.id), new Date(nowMs)).status === 'fresh').length
  const activeListingsWithStaleAvailability = typedMatchableListings.filter((listing) => getListingAvailabilityState(latestAvailabilityByListing.get(listing.id), new Date(nowMs)).status === 'stale').length
  const activeListingsNeverConfirmed = typedMatchableListings.length - activeListingsWithFreshAvailability - activeListingsWithStaleAvailability
  const zeroResultSearches = catalogOnlySearchEvents.filter((event) => event.zero_results)
  const zeroDemandCounts = zeroResultSearches.reduce<Map<string, number>>((counts, event) => {
    const label = event.query_text || event.category || event.country || 'Unspecified catalog search'
    counts.set(label, (counts.get(label) || 0) + 1)
    return counts
  }, new Map())
  const topZeroDemand = [...zeroDemandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const uniqueSellerStageCount = (stage: string) => new Set(typedSellerFunnelEvents.filter((event) => event.stage === stage).map((event) => event.seller_id)).size
  const uniqueListingStageCount = (stage: string) => new Set(typedSellerFunnelEvents.filter((event) => event.stage === stage).map((event) => event.listing_id).filter(Boolean)).size
  const sellerEntryCounts = typedSellerFunnelEvents
    .filter((event) => event.stage === 'SELL_PAGE_VIEWED' && event.entry_context !== 'system')
    .reduce<Map<string, Set<string>>>((counts, event) => {
      const sellers = counts.get(event.entry_context) || new Set<string>()
      sellers.add(event.seller_id)
      counts.set(event.entry_context, sellers)
      return counts
    }, new Map())
  const pendingPaymentListings = typedSellerPipelineListings.filter((listing) => listing.status === 'PENDING_PAYMENT')
  const latestFormStartBySeller = typedSellerFunnelEvents
    .filter((event) => event.stage === 'FORM_STARTED')
    .reduce<Map<string, SellerFunnelEvent>>((latest, event) => {
      if (!latest.has(event.seller_id)) latest.set(event.seller_id, event)
      return latest
    }, new Map())
  const stalledFormStarts = [...latestFormStartBySeller.values()].filter((event) => {
    if (nowMs - new Date(event.created_at).getTime() < 24 * 60 * 60 * 1000) return false
    return !typedSellerPipelineListings.some((listing) => listing.seller_id === event.seller_id && listing.created_at >= event.created_at)
  })
  const sellerEmailById = new Map(typedSellerUsers.map((user) => [user.id, user.email]))
  const won = typedInquiries.filter((inquiry) => inquiry.status === 'WON').length + typedQuotes.filter((quote) => quote.status === 'WON').length
  const buyerOffers = typedNegotiationEvents.filter((event) => event.event_type === 'BUYER_OFFERED')
  const sellerNegotiationResponses = typedNegotiationEvents.filter((event) => event.actor_role !== 'BUYER')
  const failedBuyerResponseNotifications = sellerNegotiationResponses.filter((event) => event.buyer_notification_status === 'failed').length
  const failedSellerResponseNotifications = typedNegotiationEvents.filter((event) => event.actor_role === 'BUYER' && event.event_type !== 'BUYER_OFFERED' && event.seller_notification_status === 'failed').length
  const failedNotifications = typedInquiries.filter((inquiry) => inquiry.seller_notification_status === 'failed').length
    + typedNotifications.filter((notification) => notification.status === 'failed').length
    + failedBuyerResponseNotifications
    + failedSellerResponseNotifications
  const newBalloonBuyerAcknowledgements = typedNotifications.filter((notification) => notification.notification_type === 'new_balloon_buyer_ack')
  const acceptedNewBalloonBuyerAcknowledgements = newBalloonBuyerAcknowledgements.filter((notification) => notification.status === 'accepted').length
  const failedNewBalloonBuyerAcknowledgements = newBalloonBuyerAcknowledgements.filter((notification) => notification.status === 'failed').length
  const exhaustedNewBalloonBuyerAcknowledgements = newBalloonBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && notification.delivery_attempts >= 2).length
  const inquiryBuyerAcknowledgements = typedNotifications.filter((notification) => notification.notification_type === 'inquiry_buyer_ack')
  const acceptedInquiryBuyerAcknowledgements = inquiryBuyerAcknowledgements.filter((notification) => notification.status === 'accepted').length
  const failedInquiryBuyerAcknowledgements = inquiryBuyerAcknowledgements.filter((notification) => notification.status === 'failed').length
  const exhaustedInquiryBuyerAcknowledgements = inquiryBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && notification.delivery_attempts >= 2).length
  const wantedBuyerAcknowledgements = typedNotifications.filter((notification) => notification.notification_type === 'wanted_buyer_ack')
  const acceptedWantedBuyerAcknowledgements = wantedBuyerAcknowledgements.filter((notification) => notification.status === 'accepted').length
  const failedWantedBuyerAcknowledgements = wantedBuyerAcknowledgements.filter((notification) => notification.status === 'failed').length
  const exhaustedWantedBuyerAcknowledgements = wantedBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && notification.delivery_attempts >= 2).length
  const buyerEarlyAccessCheckoutRecoveries = typedNotifications.filter((notification) => notification.notification_type === 'buyer_early_access_checkout_recovery')
  const acceptedBuyerEarlyAccessCheckoutRecoveries = buyerEarlyAccessCheckoutRecoveries.filter((notification) => notification.status === 'accepted').length
  const failedBuyerEarlyAccessCheckoutRecoveries = buyerEarlyAccessCheckoutRecoveries.filter((notification) => notification.status === 'failed').length
  const exhaustedBuyerEarlyAccessCheckoutRecoveries = buyerEarlyAccessCheckoutRecoveries.filter((notification) => notification.status === 'failed' && notification.delivery_attempts >= 2).length
  const liveReceipts = (receipts || []).filter((receipt) => receipt.livemode)
  const liveLinkedReceipts = liveReceipts.filter((receipt) => receipt.user_id || receipt.listing_id)
  const stripePremiumEntitlements = typedSellerUsers.filter((user) => user.is_premium && user.premium_source === 'stripe')
  const stripePremiumEntitlementsWithSubscription = stripePremiumEntitlements.filter((user) => user.stripe_subscription_id).length
  const completedSellerLaunchCheckouts = (listingCheckoutIntents || []).filter((intent) => intent.status === 'COMPLETED').length
  const openSellerLaunchCheckouts = (listingCheckoutIntents || []).filter((intent) => intent.status === 'STARTED').length
  const liveGross = liveReceipts.reduce((sum, receipt) => receipt.currency === 'eur' ? sum + Number(receipt.amount_minor || 0) : sum, 0)
  const settledRevenueByCurrency = typedOutcomes
    .filter((outcome) => outcome.evidence_level === 'settled')
    .reduce<Record<string, number>>((totals, outcome) => {
      totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.aerotrade_revenue_minor || 0)
      return totals
    }, {})
  const reportedGrossByCurrency = typedOutcomes.reduce<Record<string, number>>((totals, outcome) => {
    totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.gross_amount_minor || 0)
    return totals
  }, {})
  const outcomesWithEconomics = typedOutcomes.filter((outcome) => outcome.contribution_margin_minor !== null)
  const outcomesMissingEconomics = typedOutcomes.length - outcomesWithEconomics.length
  const evidencedContributionByCurrency = outcomesWithEconomics.reduce<Record<string, number>>((totals, outcome) => {
    totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.contribution_margin_minor)
    return totals
  }, {})
  const settledContributionByCurrency = outcomesWithEconomics
    .filter((outcome) => outcome.economics_evidence_level === 'settled')
    .reduce<Record<string, number>>((totals, outcome) => {
      totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.contribution_margin_minor)
      return totals
    }, {})
  const acceptedSocialPublications = typedSocialPublicationReceipts.filter((receipt) => receipt.status === 'accepted')
  const pendingSocialPublications = typedSocialPublicationReceipts.filter((receipt) => receipt.status === 'pending')
  const failedSocialPublications = typedSocialPublicationReceipts.filter((receipt) => receipt.status === 'failed')
  const retryableSocialPublications = failedSocialPublications.filter((receipt) => receipt.retryable)
  const instagramSocialPublications = acceptedSocialPublications.filter((receipt) => receipt.network === 'instagram').length
  const facebookSocialPublications = acceptedSocialPublications.filter((receipt) => receipt.network === 'facebook').length
  const socialPublicationModes = acceptedSocialPublications.reduce<Record<string, number>>((counts, receipt) => {
    const mode = getSocialAcquisitionMode(receipt)
    counts[mode] = (counts[mode] || 0) + 1
    return counts
  }, {})
  const socialDestinationCandidates = (socialPublicationModes.destination_text_candidate || 0) + (socialPublicationModes.destination_caption_only || 0)
  const socialAwarenessOnlyPlacements = (socialPublicationModes.awareness_image_only || 0) + (socialPublicationModes.awareness_only || 0)
  const attributedSocialViews = typedListingEvents.filter((event) => ['instagram', 'facebook'].includes(event.utm_source || '')).length
  const socialPublicationAttention = pendingSocialPublications.length + failedSocialPublications.length
  const pendingPublicNewsletterSubscriptions = typedPublicNewsletterSubscriptions.filter((subscription) => subscription.status === 'PENDING').length
  const activePublicNewsletterSubscriptions = typedPublicNewsletterSubscriptions.filter((subscription) => subscription.status === 'ACTIVE' && subscription.confirmed_at && !subscription.unsubscribed_at).length
  const stoppedPublicNewsletterSubscriptions = typedPublicNewsletterSubscriptions.filter((subscription) => subscription.status === 'UNSUBSCRIBED').length
  const attributedPublicNewsletterSubscriptions = typedPublicNewsletterSubscriptions.filter((subscription) => subscription.journey_key || subscription.utm_source).length
  const publicNewsletterSourceCounts = typedPublicNewsletterSubscriptions.reduce<Map<string, number>>((counts, subscription) => {
    const source = subscription.utm_source || subscription.source_context
    counts.set(source, (counts.get(source) || 0) + 1)
    return counts
  }, new Map())

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Commercial Pipeline</h1>
        <p className="mt-1 text-muted-foreground">Evidence from interest to opportunity, outcome and verified payment notification.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Views (30d)" value={views} icon={<Plane className="h-5 w-5" />} detail={`${reveals} contact reveals · ${activeListingWatchers} active watchers · ${closedListingWatchers} closed with listing · ${sharedLinkViews} from shared links`} />
        <Metric title="Open opportunities" value={openInquiries + openWanted + openSellerAssistance + typedQuotes.filter((quote) => !['WON', 'LOST'].includes(quote.status)).length} icon={<MessageSquare className="h-5 w-5" />} detail={`${typedInquiries.length} enquiries · ${typedWantedRequests.length} wanted · ${typedQuotes.length} new balloon · ${typedSellerAssistance.length} assisted sellers`} />
        <Metric title="Won outcomes" value={won} icon={<CircleDollarSign className="h-5 w-5" />} detail="Recorded outcomes, not assumed sales" />
        <Metric title="Needs attention" value={failedNotifications + pendingReportedSaleReview.length + socialPublicationAttention + stalledSellerInquiryIds.size} icon={<TriangleAlert className="h-5 w-5" />} detail={`${stalledSellerInquiryIds.size} seller response overdue · ${failedNotifications} email delivery · ${pendingReportedSaleReview.length} reported sale review · ${socialPublicationAttention} social publication`} warning={failedNotifications + pendingReportedSaleReview.length + socialPublicationAttention + stalledSellerInquiryIds.size > 0} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Enquiry form starts" value={enquiryFormStarts} icon={<MessageSquare className="h-5 w-5" />} detail={`${enquiryCtaClicks} CTA clicks · ${enquiryFormViews} form views · ${comparableBuyerFunnel.storedInquiries} stored enquiries in comparable cohort`} />
        <Metric title="Confirmed listing watches" value={activeListingWatchers} icon={<BellRing className="h-5 w-5" />} detail={`${pendingListingWatchers} awaiting double opt-in`} />
        <Metric title="Watch updates accepted" value={acceptedListingWatchUpdates} icon={<BellRing className="h-5 w-5" />} detail="Material listing changes accepted by the email provider" />
        <Metric title="Watch updates failed" value={failedListingWatchUpdates} icon={<TriangleAlert className="h-5 w-5" />} detail="Retryable without repeating accepted alerts" warning={failedListingWatchUpdates > 0} />
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Comparable buyer conversion cohort</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only events collected after the complete listing-to-enquiry instrumentation went live are compared. Earlier views remain visible in traffic totals but no longer create a false 0% funnel.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FunnelStep label="Comparable views" value={comparableBuyerFunnel.views} />
          <FunnelStep label="CTA clicks" value={comparableBuyerFunnel.ctaClicks} />
          <FunnelStep label="Form views" value={comparableBuyerFunnel.formViews} />
          <FunnelStep label="Form starts" value={comparableBuyerFunnel.formStarts} />
          <FunnelStep label="Stored enquiries" value={comparableBuyerFunnel.storedInquiries} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ConversionRate label="View → CTA" value={comparableBuyerFunnel.rates.viewToCta} />
          <ConversionRate label="Form view → start" value={comparableBuyerFunnel.rates.formViewToStart} />
          <ConversionRate label="Form start → stored" value={comparableBuyerFunnel.rates.formStartToStoredInquiry} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Comparable since {formatDate(comparableBuyerFunnel.comparableFrom)} · {comparableBuyerFunnel.observedDays} observed day(s) · {comparableBuyerFunnel.excludedEarlierEvents} earlier event(s) excluded from rate denominators.</p>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Demand recovered from sold inventory (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Previously public sold adverts remain truthful reference pages. Their traffic is separated from active-listing conversion and can continue into used-equipment sourcing or a factory-new estimate.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric title="Sold-page views" value={soldListingViews.length} icon={<Plane className="h-5 w-5" />} detail={`${soldListingViewJourneyKeys.size} attributable journey(s)`} />
          <Metric title="Used-equipment requests" value={soldListingWantedRequests.length} icon={<MessageSquare className="h-5 w-5" />} detail="Source: sold listing" />
          <Metric title="New-balloon requests" value={soldListingNewBalloonRequests.length} icon={<Store className="h-5 w-5" />} detail="Source: sold listing" />
          <Metric title="Joined recoveries" value={soldListingRecoveredJourneyKeys.size} icon={<CheckCircle2 className="h-5 w-5" />} detail="Same private daily journey" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">A sold-page view is not an active listing view and cannot dilute the active marketplace conversion rate. A request counts only after its normal durable intake succeeds.</p>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Social acquisition delivery (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Meta acceptance, destination transport and attributable traffic are separate evidence. Stories published by the current image-only integration count as awareness, never as click-capable acquisition.</p>
        {socialPublicationError ? <p className="mt-4 text-sm text-destructive">Social publication evidence is unavailable: {socialPublicationError.message}</p> : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Accepted placements" value={acceptedSocialPublications.length} icon={<CheckCircle2 className="h-5 w-5" />} detail={`${instagramSocialPublications} Instagram · ${facebookSocialPublications} Facebook`} />
            <Metric title="Destination candidates" value={socialDestinationCandidates} icon={<Plane className="h-5 w-5" />} detail={`${socialAwarenessOnlyPlacements} image-only awareness placement(s) excluded`} />
            <Metric title="Attributed social views" value={attributedSocialViews} icon={<Plane className="h-5 w-5" />} detail="Observed on AeroTrade, not inferred from Meta acceptance" warning={socialDestinationCandidates > 0 && attributedSocialViews === 0} />
            <Metric title="Delivery attention" value={pendingSocialPublications.length + failedSocialPublications.length} icon={<TriangleAlert className="h-5 w-5" />} detail={`${pendingSocialPublications.length} unverified · ${failedSocialPublications.length} failed · ${retryableSocialPublications.length} safe retry`} warning={pendingSocialPublications.length + failedSocialPublications.length > 0} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Public newsletter acquisition (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Visitors without an account enter the existing newsletter only after double opt-in. Counts are aggregate and retain no raw visitor, IP address, browser string or URL.</p>
        {newsletterPublicSubscriptionsError ? <p className="mt-4 text-sm text-destructive">Public newsletter acquisition evidence is unavailable: {newsletterPublicSubscriptionsError.message}</p> : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric title="Requests" value={typedPublicNewsletterSubscriptions.length} icon={<BellRing className="h-5 w-5" />} detail={`${attributedPublicNewsletterSubscriptions} with bounded acquisition context`} />
              <Metric title="Awaiting confirmation" value={pendingPublicNewsletterSubscriptions} icon={<TriangleAlert className="h-5 w-5" />} detail="Not part of the newsletter audience" />
              <Metric title="Confirmed" value={activePublicNewsletterSubscriptions} icon={<CheckCircle2 className="h-5 w-5" />} detail="Provider accepted + signed explicit confirmation" />
              <Metric title="Stopped" value={stoppedPublicNewsletterSubscriptions} icon={<BellRing className="h-5 w-5" />} detail="Excluded immediately from delivery" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {publicNewsletterSourceCounts.size === 0 ? <span className="text-muted-foreground">No public newsletter request has been recorded yet.</span> : [...publicNewsletterSourceCounts.entries()].map(([source, count]) => <span key={source} className="rounded-full border bg-background px-3 py-1 font-semibold">{source} · {count}</span>)}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Listing availability evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only explicit seller confirmations count. Listing edits, publication dates and administrator activity never imply availability.</p>
        {listingAvailabilityError ? <p className="mt-4 text-sm text-destructive">Availability evidence is unavailable: {listingAvailabilityError.message}</p> : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Metric title="Fresh confirmations" value={activeListingsWithFreshAvailability} icon={<Store className="h-5 w-5" />} detail="Seller-confirmed within 90 days" />
              <Metric title="Never confirmed" value={activeListingsNeverConfirmed} icon={<TriangleAlert className="h-5 w-5" />} detail="No availability evidence yet" warning={activeListingsNeverConfirmed > 0} />
              <Metric title="Confirmation expired" value={activeListingsWithStaleAvailability} icon={<TriangleAlert className="h-5 w-5" />} detail="Last confirmation is older than 90 days" warning={activeListingsWithStaleAvailability > 0} />
            </div>
            <div className="mt-5 divide-y rounded-xl border">
              {Array.from(availabilityDueBySeller.entries()).map(([sellerId, dueListings]) => {
                const request = availabilityDigestBySeller.get(sellerId)
                const currentKey = sellerAvailabilityDigestIdempotencyKey(sellerId, dueListings.map((listing) => ({
                  listingId: listing.id,
                  confirmationId: latestAvailabilityRowsByListing.get(listing.id)?.id || null,
                })))
                const readiness = sellerAvailabilityDigestReadiness({
                  hasContact: sellerEmailById.has(sellerId),
                  currentKey,
                  latestReceipt: request,
                  now: new Date(nowMs),
                })
                return <div key={sellerId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{sellerEmailById.get(sellerId) || 'Seller contact unavailable'} · {dueListings.length} active listing{dueListings.length === 1 ? '' : 's'}</p><ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{dueListings.map((listing) => <li key={listing.id}>{listing.title} · {latestAvailabilityByListing.has(listing.id) ? 'confirmation expired' : 'never confirmed'}</li>)}</ul>{request ? <p className="mt-1 text-xs text-muted-foreground">Latest grouped request: {request.status} · {request.delivery_attempts} attempt{request.delivery_attempts === 1 ? '' : 's'}</p> : null}</div>{readiness.status === 'current' ? <span className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700">Grouped request accepted · link current</span> : readiness.status === 'invalid_receipt' || readiness.status === 'invalid_inventory' ? <span className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-800">Availability request evidence needs review</span> : readiness.status === 'retry_pending' ? <span className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800">Automatic safe retry after {formatDate(request!.next_attempt_at!)}</span> : readiness.status === 'cooling_down' ? <span className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800">Inventory changed · outreach cooldown protects the seller</span> : readiness.status === 'missing_contact' ? <span className="text-xs font-semibold text-destructive">Seller email missing</span> : readiness.actionable ? <form action={requestSellerAvailabilityDigest.bind(null, sellerId)}><button className="rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted">{readiness.status === 'ready_reissue' ? 'Reissue expired grouped request' : readiness.status === 'ready_retry' ? 'Retry grouped request' : `Request all ${dueListings.length} confirmations`}</button></form> : null}</div>
              })}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Buyer journey evidence (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Daily pseudonymous journey keys connect demand to contact or a request without exposing a browser identifier. Administrator and listing-owner activity is excluded from new buyer measurements.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FunnelStep label="Catalog search" value={searchJourneyKeys.size} />
          <FunnelStep label="Listing viewed" value={viewJourneyKeys.size} />
          <FunnelStep label="Listing watched" value={watchJourneyKeys.size} />
          <FunnelStep label="Contact revealed" value={revealJourneyKeys.size} />
          <FunnelStep label="Request sent" value={requestJourneyKeys.size} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{attributableJourneyKeys.size} attributable buyer journey(s). Each stage is a distinct journey count, not a claim that every visitor moved through every preceding step.</p>
        {unattributedLegacyViews > 0 ? <p className="mt-2 text-xs text-amber-700">{unattributedLegacyViews} older or unattributed listing view(s) remain visible but cannot be reconstructed into a journey.</p> : null}
        {listingWatchersError || listingWatchDispatchesError ? <p className="mt-2 text-xs text-destructive">Listing-watch evidence is unavailable: {listingWatchersError?.message || listingWatchDispatchesError?.message}</p> : null}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Negotiation evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">A structured price indication is optional. Seller acceptances, counteroffers and declines are stored before notification and remain explicitly non-binding.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStep label="Tracked enquiries" value={typedInquiries.length} />
          <FunnelStep label="Buyer offers" value={buyerOffers.length} />
          <FunnelStep label="Seller responses" value={sellerNegotiationResponses.length} />
          <FunnelStep label="Buyer emails failed" value={failedBuyerResponseNotifications} />
        </div>
        <p className={`mt-4 text-xs ${failedInquiryBuyerAcknowledgements > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>Initial buyer acknowledgements: {acceptedInquiryBuyerAcknowledgements} accepted · {failedInquiryBuyerAcknowledgements} failed · {exhaustedInquiryBuyerAcknowledgements} exhausted after the safe retry.</p>
      </section>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Revenue evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">{liveReceipts.length} live payment notification receipt(s) · {(liveGross / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' })} gross EUR represented. This is not net revenue.</p>
        <p className={`mt-2 text-sm ${liveLinkedReceipts.length < liveReceipts.length ? 'font-semibold text-amber-700' : 'text-muted-foreground'}`}>Entitlement traceability: {liveLinkedReceipts.length}/{liveReceipts.length} live receipt(s) linked to an AeroTrade user or listing · Seller Launch checkout intents: {completedSellerLaunchCheckouts} completed, {openSellerLaunchCheckouts} open.</p>
        <p className={`mt-2 text-sm ${stripePremiumEntitlementsWithSubscription < stripePremiumEntitlements.length ? 'font-semibold text-amber-700' : 'text-muted-foreground'}`}>Stripe Premium entitlements: {stripePremiumEntitlements.length} active in AeroTrade · {stripePremiumEntitlementsWithSubscription} linked to a Stripe subscription. Historical entitlements may predate the receipt and checkout-intent ledgers and are not treated as new revenue.</p>
        {listingCheckoutIntentsError ? <p className="mt-2 text-xs font-semibold text-destructive">Seller Launch checkout evidence unavailable: {listingCheckoutIntentsError.message}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">{typedOutcomes.length} recorded commercial outcome(s) · gross outcomes {formatCurrencyTotals(reportedGrossByCurrency)} · settled AeroTrade revenue {formatCurrencyTotals(settledRevenueByCurrency)}.</p>
        <p className={`mt-2 text-sm ${failedBuyerEarlyAccessCheckoutRecoveries > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>Buyer Early Access checkout recovery: {acceptedBuyerEarlyAccessCheckoutRecoveries} accepted · {failedBuyerEarlyAccessCheckoutRecoveries} failed · {exhaustedBuyerEarlyAccessCheckoutRecoveries} exhausted.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStep label="Economics measured" value={outcomesWithEconomics.length} />
          <FunnelStep label="Economics missing" value={outcomesMissingEconomics} />
          <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium text-muted-foreground">Evidence-backed contribution</p><p className="mt-2 font-bold">{formatCurrencyTotals(evidencedContributionByCurrency)}</p></div>
          <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium text-muted-foreground">Settled contribution</p><p className="mt-2 font-bold">{formatCurrencyTotals(settledContributionByCurrency)}</p></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Reported and documented outcomes are not counted as settled revenue. Missing costs remain unmeasured and are never converted to zero. Contribution may legitimately be negative. Stripe receipts and marketplace outcomes remain separate evidence sources.</p>
      </div>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Listing closure evidence</h2><p className="mt-1 text-sm text-muted-foreground">Seller and administrator closures are immutable and attributed. Seller-reported sales remain unverified until the normal commercial-outcome evidence is recorded.</p></div>
        {lifecycleEventsError || saleClarificationsError ? <p className="p-6 text-destructive">Listing closure evidence unavailable: {lifecycleEventsError?.message || saleClarificationsError?.message}</p> : (
          <>
            <div className="grid gap-3 border-b p-6 sm:grid-cols-2 lg:grid-cols-5">
              <FunnelStep label="AeroTrade reported" value={sellerReportedAeroTradeSales.length} />
              <FunnelStep label="Other channel" value={sellerReportedOtherSales.length} />
              <FunnelStep label="Not disclosed" value={sellerReportedUndisclosedSales.length} />
              <FunnelStep label="Withdrawn" value={withdrawnListings.length} />
              <FunnelStep label="Outcome review" value={pendingReportedSaleReview.length} />
            </div>
            {typedLifecycleEvents.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No listing has been closed through the audited workflow yet.</p> : <div className="divide-y">{typedLifecycleEvents.map((event) => {
              const effectiveEvent = effectiveLifecycleEventById.get(event.id) || { ...event, clarification_id: null, clarified_at: null }
              const reportedAmount = effectiveEvent.gross_amount_minor !== null && effectiveEvent.currency
                ? (Number(effectiveEvent.gross_amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: effectiveEvent.currency })
                : null
              const pendingReview = pendingReportedSaleReview.some((candidate) => candidate.id === event.id)
              const matchingInquiries = typedInquiries.filter((inquiry) => inquiry.listing_id === event.listing_id && inquiry.status !== 'SPAM')
              const canClarify = event.event_type === 'SOLD' && event.sale_channel === 'NOT_DISCLOSED' && !effectiveEvent.clarification_id
              return <div key={event.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-semibold">{event.listings?.title || 'Listing'} · {event.event_type === 'WITHDRAWN' ? 'withdrawn' : `sold · ${(effectiveEvent.sale_channel || '').replaceAll('_', ' ').toLowerCase()}`}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Closed {formatDate(event.created_at)} · recorded by {event.actor_role.toLowerCase()}{reportedAmount ? ` · reported gross ${reportedAmount}` : ''}</p>
                  {effectiveEvent.clarified_at ? <p className="mt-1 text-xs font-semibold text-emerald-700">Channel clarified by an administrator {formatDate(effectiveEvent.clarified_at)}. The original closure remains unchanged.</p> : null}
                </div>
                {canClarify ? <details className="w-full max-w-xl rounded-xl border bg-muted/20 p-4">
                  <summary className="cursor-pointer text-sm font-semibold">Clarify sale channel</summary>
                  <p className="mt-2 text-xs text-muted-foreground">Adds one append-only clarification. It does not create revenue, a commercial outcome or reopen the listing.</p>
                  <form action={clarifyListingSale.bind(null, event.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold">Effective channel
                      <select name="sale_channel" required defaultValue="" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal">
                        <option value="" disabled>Select one</option>
                        <option value="OTHER_CHANNEL">Other channel</option>
                        {matchingInquiries.length > 0 ? <option value="AEROTRADE">AeroTrade</option> : null}
                      </select>
                    </label>
                    <label className="text-xs font-semibold">Matching AeroTrade enquiry
                      <select name="marketplace_inquiry_id" defaultValue="" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal">
                        <option value="">None</option>
                        {matchingInquiries.map((inquiry) => <option key={inquiry.id} value={inquiry.id}>{formatDate(inquiry.created_at)} · {inquiry.buyer_name}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold">Reported gross (optional)
                      <input name="gross_amount" inputMode="decimal" placeholder="e.g. 24500" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal" />
                    </label>
                    <div className="flex items-end"><button type="submit" className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Store immutable clarification</button></div>
                  </form>
                </details> : pendingReview && effectiveEvent.marketplace_inquiry_id ? <a href={`#inquiry-${effectiveEvent.marketplace_inquiry_id}`} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-900">Review reported AeroTrade sale</a> : <span className="text-xs text-muted-foreground">{effectiveEvent.sale_channel === 'AEROTRADE' ? 'Outcome evidence recorded' : 'No AeroTrade revenue claim'}</span>}
              </div>
            })}</div>}
          </>
        )}
      </section>

      {notificationsError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Commercial notification evidence unavailable: {notificationsError.message}</p> : null}
      {outcomesError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Commercial outcome evidence unavailable: {outcomesError.message}</p> : null}

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">European buyer acquisition (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Daily-deduplicated visits to the localized high-intent entries, joined to later marketplace stages through the existing privacy-minimized journey key.</p>
        {searchEventsError ? <p className="mt-4 text-sm text-destructive">Localized acquisition evidence unavailable: {searchEventsError.message}</p> : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <FunnelStep label="Landing visits" value={localizedBuyerEntryEvents.length} />
              <FunnelStep label="Opened a listing" value={localizedBuyerListingViewJourneys.size} />
              <FunnelStep label="High-intent journey" value={localizedBuyerHighIntentJourneys.size} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {localizedBuyerEntryCounts.size === 0 ? <span className="text-muted-foreground">No localized acquisition visit has been recorded yet.</span> : [...localizedBuyerEntryCounts.entries()].map(([entry, count]) => <span key={entry} className="rounded-full border bg-background px-3 py-1 font-semibold">{entry.replace('buyer_landing_', '').toUpperCase()} · {count}</span>)}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">A high-intent journey means a stored watch, enquiry, wanted request or new-balloon request. Page code and internal operator visits do not count as commercial proof.</p>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Catalog demand gaps (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">{catalogOnlySearchEvents.length} deduplicated search(es) · {zeroResultSearches.length} with no matching inventory. Localized landing visits are reported separately; likely email, phone and URL searches are not retained.</p>
        {searchEventsError ? <p className="mt-4 text-sm text-destructive">Search-demand evidence unavailable: {searchEventsError.message}</p> : topZeroDemand.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No zero-result demand has been recorded yet.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{topZeroDemand.map(([label, count]) => <div key={label} className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm"><span className="font-medium">{label}</span><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{count}</span></div>)}</div>}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-xl font-semibold">Search discovery</h2><p className="mt-1 text-sm text-muted-foreground">The public sitemap remains authoritative. IndexNow submits only public commercial URLs and keeps aggregate provider evidence without retaining the submitted URL list.</p></div>
          <a href="/sitemap.xml" className="text-sm font-semibold text-primary underline">Open sitemap</a>
        </div>
        {indexingError ? <p className="mt-4 text-sm text-destructive">Indexing submission evidence is unavailable: {indexingError.message}</p> : !latestIndexingReceipt ? <p className="mt-4 text-sm text-muted-foreground">No public URL submission has run yet.</p> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <FunnelStep label="Latest URLs" value={latestIndexingReceipt.url_count} />
            <FunnelStep label="Attempts" value={latestIndexingReceipt.attempts} />
            <div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-medium text-muted-foreground">Provider result</p><p className={`mt-2 text-lg font-bold ${latestIndexingReceipt.status === 'FAILED' ? 'text-destructive' : 'text-foreground'}`}>{latestIndexingReceipt.status}</p></div>
            <div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-medium text-muted-foreground">Last evidence</p><p className="mt-2 text-sm font-bold">{latestIndexingReceipt.accepted_at ? formatDate(latestIndexingReceipt.accepted_at) : latestIndexingReceipt.attempted_at ? formatDate(latestIndexingReceipt.attempted_at) : 'Not attempted'}</p></div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">IndexNow supports participating search engines; it does not prove Google indexing. Search Console ownership remains a separate external setup step.</p>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-xl font-semibold">Seller activation (30d)</h2><p className="mt-1 text-sm text-muted-foreground">Private, account-linked funnel evidence. It starts collecting from this release and never stores passwords, card data, IP addresses or draft form text.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><Store className="h-4 w-4" />No automatic outreach</span>
        </div>
        {sellerFunnelError || sellerListingsError || sellerUsersError ? <p className="mt-4 text-sm text-destructive">Seller-activation evidence is incomplete.</p> : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <FunnelStep label="Sell page" value={uniqueSellerStageCount('SELL_PAGE_VIEWED')} />
              <FunnelStep label="Form started" value={uniqueSellerStageCount('FORM_STARTED')} />
              <FunnelStep label="Submitted" value={uniqueListingStageCount('LISTING_SUBMITTED')} />
              <FunnelStep label="Checkout" value={uniqueListingStageCount('CHECKOUT_CREATED')} />
              <FunnelStep label="Paid" value={uniqueListingStageCount('PAYMENT_CONFIRMED')} />
              <FunnelStep label="Published" value={uniqueListingStageCount('LISTING_PUBLISHED')} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {[...sellerEntryCounts.entries()].length === 0 ? <span className="text-muted-foreground">No attributed seller entry has been recorded yet.</span> : [...sellerEntryCounts.entries()].sort((a, b) => b[1].size - a[1].size).map(([source, sellers]) => <span key={source} className="rounded-full border bg-background px-3 py-1 font-semibold">{source.replaceAll('_', ' ')} · {sellers.size} seller(s)</span>)}
            </div>
            <div className="mt-6 rounded-xl border bg-muted/20">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">Recovery queue</h3><p className="text-xs text-muted-foreground">Only evidence-backed interruptions are shown. Contact remains a manual decision.</p></div>
              {pendingPaymentListings.length === 0 && stalledFormStarts.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No seller activation interruption currently needs review.</p> : (
                <div className="divide-y">
                  {pendingPaymentListings.map((listing) => {
                    const recoveryStatus = premiumRecoveryByListing.get(listing.id)
                    return <div key={listing.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Seller Launch Promotion payment incomplete · {listing.title}</p><p className="text-xs text-muted-foreground">Stored {formatDate(listing.created_at)} · seller can resume the one-time checkout securely from their dashboard.</p>{recoveryStatus ? <p className={`mt-1 text-xs font-semibold ${recoveryStatus === 'failed' ? 'text-destructive' : 'text-emerald-700'}`}>Automatic recovery: {recoveryStatus}</p> : null}</div>{recoveryStatus === 'accepted' ? <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700"><CreditCard className="h-4 w-4" />Reminder accepted</span> : <a href={`mailto:${listing.contact_email}`} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"><CreditCard className="h-4 w-4" />Contact manually</a>}</div>
                  })}
                  {stalledFormStarts.map((event) => <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Listing form started but no later submission</p><p className="text-xs text-muted-foreground">Last start {formatDate(event.created_at)} · no listing created afterwards.</p></div>{sellerEmailById.get(event.seller_id) ? <a href={`mailto:${sellerEmailById.get(event.seller_id)}`} className="rounded-lg border px-3 py-2 text-center text-sm font-semibold hover:bg-muted">Contact manually</a> : null}</div>)}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">New-balloon manufacturer funnel</h2>
            <p className="mt-1 text-sm text-muted-foreground">Preference, operator-priced proposal, provider acceptance, buyer response and evidence-backed outcome. No sale or revenue is inferred.</p>
          </div>
          <Link href="/new-balloon" className="text-sm font-semibold text-primary underline">Open public request path</Link>
        </div>
        {proposalResponsesError ? <p className="mt-4 text-sm text-destructive">Buyer proposal responses are unavailable: {proposalResponsesError.message}</p> : null}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {newBalloonManufacturers.map((manufacturer) => {
            const manufacturerKey = manufacturer.slug === 'pasha' ? 'pasha' : 'schroeder'
            const funnel = newBalloonManufacturerFunnel[manufacturerKey]
            return <div key={manufacturer.slug} className="rounded-xl border bg-muted/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-bold">{manufacturer.name}</p><Link href={manufacturer.path} className="text-xs font-semibold text-primary underline">Open acquisition page</Link></div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{funnel.wonOutcomes} won</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <FunnelStep label="Preferred" value={funnel.preferredRequests} />
                <FunnelStep label="Proposals" value={funnel.proposals} />
                <FunnelStep label="Accepted" value={funnel.acceptedProposals} />
                <FunnelStep label="Responses" value={funnel.buyerResponses} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Interested {funnel.interestedResponses} · questions {funnel.questionResponses} · declined {funnel.declinedResponses}</p>
              <p className="mt-3 text-xs text-muted-foreground">Settled AeroTrade revenue: {formatCurrencyTotals(funnel.settledRevenueMinorByCurrency)}</p>
            </div>
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Requests marked “advise me” remain outside either manufacturer until an operator proposal selects one.</p>
        <p className={`mt-2 text-xs ${failedNewBalloonBuyerAcknowledgements > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>Buyer acknowledgements: {acceptedNewBalloonBuyerAcknowledgements} accepted · {failedNewBalloonBuyerAcknowledgements} failed · {exhaustedNewBalloonBuyerAcknowledgements} exhausted after the safe retry.</p>
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Assisted seller pipeline</h2><p className="mt-1 text-sm text-muted-foreground">Private owner requests that reduce listing abandonment. Nothing here is public; LISTED must point to the completed normal marketplace listing.</p></div>
        {sellerAssistanceError ? <p className="p-6 text-destructive">Assisted-sale pipeline unavailable: {sellerAssistanceError.message}</p> : typedSellerAssistance.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No assisted-sale requests yet.</p> : (
          <div className="divide-y">
            {typedSellerAssistance.map((request) => {
              const candidates = typedSellerPipelineListings.filter((listing) => (
                (request.seller_user_id && listing.seller_id === request.seller_user_id)
                || listing.contact_email.trim().toLowerCase() === request.email.trim().toLowerCase()
              ))
              const expectedPrice = request.expected_price_minor === null
                ? 'Price not specified'
                : (request.expected_price_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: request.currency })
              return (
                <div key={request.id} className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                  <div><p className="font-semibold">{request.name} · {[request.manufacturer, request.model].filter(Boolean).join(' ') || request.category}</p><a href={`mailto:${request.email}`} className="text-sm text-primary hover:underline">{request.email}</a>{request.phone ? <p className="text-sm">{request.phone}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{formatDate(request.created_at)} · {request.location_country || 'Location not specified'} · {expectedPrice} · source {request.source_context.replaceAll('_', ' ')}</p>{request.existing_listing_url ? <a href={request.existing_listing_url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm font-semibold text-primary underline">Open existing public advert</a> : null}{request.notes ? <p className="mt-3 whitespace-pre-wrap text-sm">{request.notes}</p> : null}</div>
                  <div className="space-y-2 text-sm"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{request.status}</span><p>Documents: {request.documentation_readiness} · photos: {request.photo_readiness}</p><p>Timing: {request.timeline}</p><p className="text-xs text-muted-foreground">Help: {request.help_needed.length ? request.help_needed.join(', ') : 'not specified'}</p>{request.linked_listing_id ? <Link href={`/catalog/${request.linked_listing_id}`} className="block font-semibold text-primary underline">Open completed listing</Link> : null}</div>
                  <form action={updateSellerAssistanceStatus.bind(null, request.id)} className="grid min-w-64 gap-2">
                    <select name="status" defaultValue={request.status} className="rounded-lg border bg-background px-3 py-2 text-sm">{['NEW', 'CONTACTED', 'QUALIFIED', 'LISTING_PREPARATION', 'LISTED', 'CLOSED', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}</select>
                    <select name="linked_listing_id" defaultValue={request.linked_listing_id || ''} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">No linked listing</option>{candidates.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.status}</option>)}</select>
                    <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save & verify</button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Buyer demand without a listing</h2><p className="mt-1 text-sm text-muted-foreground">Private wanted requests and basic matches against active supply. Consented buyers receive one deduplicated operational digest when new compatible listings appear.</p></div>
        {wantedMatchDispatchError ? <p className="border-b p-6 text-sm text-destructive">Wanted-match delivery evidence is unavailable: {wantedMatchDispatchError.message}</p> : null}
        <p className={`border-b px-6 py-3 text-xs ${failedWantedBuyerAcknowledgements > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>Initial buyer acknowledgements: {acceptedWantedBuyerAcknowledgements} accepted · {failedWantedBuyerAcknowledgements} failed · {exhaustedWantedBuyerAcknowledgements} exhausted after the safe retry.</p>
        {wantedError ? <p className="p-6 text-destructive">Wanted-demand pipeline unavailable: {wantedError.message}</p> : typedWantedRequests.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked wanted-equipment requests yet.</p> : (
          <div className="divide-y">
            {typedWantedRequests.map((request) => {
              const matches = typedMatchableListings.filter((listing) => listingMatchesWantedRequest(listing, request))
              const budget = request.budget_min_minor === null && request.budget_max_minor === null
                ? 'Budget not specified'
                : `${request.budget_min_minor === null ? '0' : (request.budget_min_minor / 100).toLocaleString('en-IE')}–${request.budget_max_minor === null ? 'open' : (request.budget_max_minor / 100).toLocaleString('en-IE')} ${request.currency}`
              const matchDispatches = wantedDispatchesByRequest.get(request.id) || []
              const acceptedDispatches = matchDispatches.filter((dispatch) => dispatch.status === 'ACCEPTED')
              const notifiedListings = acceptedDispatches.reduce((count, dispatch) => count + dispatch.listing_ids.length, 0)
              const failedDispatches = matchDispatches.filter((dispatch) => dispatch.status === 'FAILED').length
              return (
                <div key={request.id} className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                  <div><p className="font-semibold">{request.buyer_name} · {request.category}</p><a href={`mailto:${request.buyer_email}`} className="text-sm text-primary hover:underline">{request.buyer_email}</a><p className="mt-1 text-xs text-muted-foreground">{formatDate(request.created_at)} · {request.location_preference || 'No location preference'} · {budget}</p><p className="mt-3 whitespace-pre-wrap text-sm">{request.details}</p></div>
                  <div className="space-y-2 text-sm"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{request.status}</span><p>{request.notify_on_match ? 'Buyer consented to match email.' : 'No match-email consent.'}</p><p className="font-semibold">{matches.length} basic catalog match(es)</p><p className="text-xs text-muted-foreground">{notifiedListings} listing alert(s) accepted by provider · {failedDispatches} failed digest(s)</p>{matches.slice(0, 3).map((listing) => <Link key={listing.id} href={`/catalog/${listing.id}`} className="block text-primary hover:underline">{listing.title}</Link>)}{matches.length > 3 ? <p className="text-xs text-muted-foreground">+{matches.length - 3} more</p> : null}</div>
                  <form action={updateWantedRequestStatus.bind(null, request.id)} className="flex gap-2"><select name="status" defaultValue={request.status} className="rounded-lg border bg-background px-3 py-2 text-sm">{['NEW', 'REVIEWING', 'MATCHED', 'CONTACTED', 'CLOSED', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}</select><button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button></form>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Marketplace enquiries</h2><p className="mt-1 text-sm text-muted-foreground">Structured offers and seller responses are non-binding commercial evidence; they never reserve equipment or execute payment.</p></div>
        {inquiriesError || negotiationEventsError ? <p className="p-6 text-destructive">Pipeline unavailable: {inquiriesError?.message || negotiationEventsError?.message}</p> : typedInquiries.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked enquiries yet.</p> : (
          <div className="divide-y">
            {typedInquiries.map((inquiry) => {
              const inquiryNegotiationEvents = negotiationEventsByInquiry.get(inquiry.id) || []
              const latestNegotiationEvent = inquiryNegotiationEvents[0]
              const displayAmount = latestNegotiationEvent?.amount_minor
                ? (Number(latestNegotiationEvent.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: latestNegotiationEvent.currency })
                : null
              return <div id={`inquiry-${inquiry.id}`} key={inquiry.id} className="grid scroll-mt-24 gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div>
                  <p className="font-semibold">{inquiry.buyer_name} · {inquiry.listings?.title || 'Listing'}</p>
                  <a href={`mailto:${inquiry.buyer_email}`} className="text-sm text-primary hover:underline">{inquiry.buyer_email}</a>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(inquiry.created_at)}</p>
                  {latestNegotiationEvent ? <p className="mt-2 text-sm font-medium">Latest negotiation: {latestNegotiationEvent.event_type.replaceAll('_', ' ').toLowerCase()}{displayAmount ? ` · ${displayAmount}` : ''}</p> : <p className="mt-2 text-xs text-muted-foreground">No structured offer or response yet.</p>}
                </div>
                <div className="text-sm">
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{inquiry.status}</span>
                  {inquiry.seller_notification_status === 'failed' ? <p className="mt-2 text-destructive">Seller email not accepted; lead remains visible.</p> : null}
                  {stalledSellerInquiryIds.has(inquiry.id) ? <p className="mt-2 font-semibold text-amber-700">Seller response overdue after an accepted reminder{sellerEscalationByInquiry.get(inquiry.id)?.status === 'accepted' ? ' · admin escalation accepted' : ' · awaiting internal escalation'}.</p> : null}
                  {latestNegotiationEvent && latestNegotiationEvent.actor_role !== 'BUYER' ? <p className={`mt-2 text-xs ${latestNegotiationEvent.buyer_notification_status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>Buyer response email: {latestNegotiationEvent.buyer_notification_status}</p> : null}
                  {latestNegotiationEvent && latestNegotiationEvent.actor_role === 'BUYER' && latestNegotiationEvent.event_type !== 'BUYER_OFFERED' ? <p className={`mt-2 text-xs ${latestNegotiationEvent.seller_notification_status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>Seller response email: {latestNegotiationEvent.seller_notification_status}</p> : null}
                </div>
                {inquiry.status === 'WON' ? <p className="text-sm font-semibold text-emerald-700">Won · managed through the outcome evidence below</p> : <form action={updateAdminInquiryStatus.bind(null, inquiry.id)} className="flex gap-2">
                  <select name="status" defaultValue={inquiry.status} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    {['NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'LOST', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                  <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                </form>}
                <div className="lg:col-span-3">
                  <OutcomeEditor entityType="marketplace_inquiry" entityId={inquiry.id} outcome={outcomesByEntity.get(`marketplace_inquiry:${inquiry.id}`)} suggestion={closureSuggestionByInquiry.get(inquiry.id)} />
                </div>
              </div>
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">New balloon opportunities</h2></div>
        {quotesError || proposalsError ? <p className="p-6 text-destructive">Quote pipeline unavailable: {quotesError?.message || proposalsError?.message}</p> : typedQuotes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No new-balloon requests yet.</p> : (
          <div className="divide-y">
            {typedQuotes.map((quote) => {
              const latestProposal = latestProposalByQuote.get(quote.id)
              const proposalResponse = latestProposal ? responseByProposal.get(latestProposal.id) : undefined
              return <div key={quote.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div><p className="font-semibold">{quote.name} · {quote.equipment_type}</p><a href={`mailto:${quote.email}`} className="text-sm text-primary hover:underline">{quote.email}</a><p className="mt-1 text-xs text-muted-foreground">Source: {quote.source_context} · {formatDate(quote.created_at)}</p></div>
                <div><span className="text-sm font-bold">{quote.status}</span>{latestProposal ? <p className={`mt-1 text-xs font-semibold ${latestProposal.delivery_status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>Latest proposal: {latestProposal.delivery_status} · {(Number(latestProposal.amount_min_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: latestProposal.currency })}–{(Number(latestProposal.amount_max_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: latestProposal.currency })}</p> : null}{proposalResponse ? <><p className={`mt-1 text-xs font-bold ${proposalResponse.response_type === 'DECLINED' ? 'text-destructive' : 'text-emerald-700'}`}>Buyer response: {proposalResponse.response_type.toLowerCase()}</p>{proposalResponse.note ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{proposalResponse.note}</p> : null}<p className={`mt-1 text-xs ${proposalResponse.admin_notification_status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>Internal email: {proposalResponse.admin_notification_status}</p></> : null}</div>
                {quote.status === 'WON' ? <p className="text-sm font-semibold text-emerald-700">Won · managed through the outcome evidence below</p> : <form action={updateQuoteRequestStatus.bind(null, quote.id)} className="flex gap-2">
                  <select name="status" defaultValue={quote.status} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    {['NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'BUYER_RESPONDED', 'LOST'].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                  <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                </form>}
                <div className="lg:col-span-3">
                  {!['WON', 'LOST'].includes(quote.status) ? <NewBalloonProposalEditor quote={quote} defaultValidUntil={defaultProposalValidUntil} /> : null}
                </div>
                <div className="lg:col-span-3">
                  <OutcomeEditor entityType="quote_request" entityId={quote.id} outcome={outcomesByEntity.get(`quote_request:${quote.id}`)} />
                </div>
              </div>
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ title, value, detail, icon, warning = false }: { title: string; value: number; detail: string; icon: React.ReactNode; warning?: boolean }) {
  return <div className={`rounded-2xl border bg-card p-5 ${warning ? 'border-destructive/30' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">{title}</p><span className={warning ? 'text-destructive' : 'text-primary'}>{icon}</span></div><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>
}

function ConversionRate({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value === null ? 'Awaiting traffic' : `${(value * 100).toFixed(1)}%`}</p></div>
}

function formatCurrencyTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals)
  if (entries.length === 0) return 'none recorded'
  return entries.map(([currency, minor]) => (minor / 100).toLocaleString('en-IE', { style: 'currency', currency })).join(' · ')
}

function OutcomeEditor({ entityType, entityId, outcome, suggestion }: {
  entityType: 'marketplace_inquiry' | 'quote_request'
  entityId: string
  outcome?: CommercialOutcome
  suggestion?: OutcomeSuggestion
}) {
  const amount = (minor?: number) => ((minor || 0) / 100).toFixed(2)
  const suggestedAmount = suggestion?.gross_amount_minor === null || suggestion?.gross_amount_minor === undefined
    ? ''
    : amount(suggestion.gross_amount_minor)
  const economicsLocked = outcome?.contribution_margin_minor !== null && outcome?.contribution_margin_minor !== undefined
  return (
    <details className="rounded-xl border bg-muted/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        {outcome ? `Outcome: ${outcome.evidence_level} · ${amount(outcome.gross_amount_minor)} ${outcome.currency}` : suggestion ? 'Review seller-reported AeroTrade sale' : 'Record commercial outcome'}
      </summary>
      <form action={recordCommercialOutcome.bind(null, entityType, entityId)} className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-8">
        <select name="outcome_type" defaultValue={outcome?.outcome_type || 'sale'} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="sale">Sale</option><option value="intermediation">Intermediation</option><option value="other">Other</option>
        </select>
        {economicsLocked ? <input type="hidden" name="currency" value={outcome?.currency} /> : null}
        <select name={economicsLocked ? undefined : 'currency'} disabled={economicsLocked} defaultValue={outcome?.currency || suggestion?.currency || 'EUR'} className="rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70">
          <option value="EUR">EUR</option><option value="GBP">GBP</option><option value="USD">USD</option>
        </select>
        <input name="gross_amount" required inputMode="decimal" defaultValue={outcome ? amount(outcome.gross_amount_minor) : suggestedAmount} placeholder="Gross transaction amount" aria-label="Gross transaction amount" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <input name="aerotrade_revenue" required readOnly={economicsLocked} inputMode="decimal" defaultValue={amount(outcome?.aerotrade_revenue_minor)} placeholder="AeroTrade revenue" aria-label="AeroTrade revenue" className="rounded-lg border bg-background px-3 py-2 text-sm read-only:cursor-not-allowed read-only:opacity-70" />
        <select name="evidence_level" defaultValue={outcome?.evidence_level || 'reported'} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="reported">Reported</option><option value="documented">Documented</option><option value="settled">Settled</option>
        </select>
        <select name="evidence_source" defaultValue={outcome?.evidence_source || 'operator_report'} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="operator_report">Operator report</option><option value="contract">Contract</option><option value="invoice">Invoice</option><option value="bank_transfer">Bank transfer</option><option value="stripe_payment">Stripe payment</option><option value="other_document">Other document</option>
        </select>
        <input name="evidence_reference" defaultValue={outcome?.evidence_reference || ''} placeholder="Evidence reference" aria-label="Evidence reference" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save outcome</button>
        {suggestion && !outcome ? <p className="text-xs font-semibold text-amber-800 sm:col-span-2 lg:col-span-8">The seller reported this sale on {formatDate(suggestion.reported_at)}{suggestedAmount ? ` with a gross amount of ${suggestedAmount} ${suggestion.currency}` : ''}. These fields are only a review aid: verify them before saving. AeroTrade revenue remains 0 until you enter supported evidence.</p> : null}
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-8">Documented results require a document reference. Settled AeroTrade revenue requires a bank-transfer or Stripe reference. The outcome, audit snapshot and WON status commit together.</p>
        {economicsLocked ? <p className="text-xs font-medium text-amber-800 sm:col-span-2 lg:col-span-8">Currency and AeroTrade revenue are locked because unit economics already use that basis. Other outcome evidence can still be strengthened without silently changing contribution.</p> : null}
        <textarea name="outcome_notes" maxLength={2000} defaultValue={outcome?.notes || ''} placeholder="Evidence note (no passwords, card data or full bank details)" className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-8" />
      </form>
      {outcome ? <CommercialEconomicsEditor outcome={outcome} /> : null}
    </details>
  )
}

function CommercialEconomicsEditor({ outcome }: { outcome: CommercialOutcome }) {
  const amount = (minor: number | null) => minor === null ? '' : (minor / 100).toFixed(2)
  const contribution = outcome.contribution_margin_minor === null
    ? 'Not measured'
    : (outcome.contribution_margin_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: outcome.currency })
  return (
    <form action={recordCommercialUnitEconomics.bind(null, outcome.id)} className="grid gap-3 border-t bg-background/40 p-4 sm:grid-cols-2 lg:grid-cols-8">
      <div className="sm:col-span-2 lg:col-span-8">
        <p className="text-sm font-semibold">Unit economics · contribution {contribution}</p>
        <p className="mt-1 text-xs text-muted-foreground">Record every cost component explicitly. Leaving economics unrecorded is safer than treating an unknown cost as zero. Confirm the outcome currency and AeroTrade revenue first; that financial basis is locked once economics are recorded.</p>
      </div>
      <input name="direct_cost" required inputMode="decimal" defaultValue={amount(outcome.direct_cost_minor)} placeholder="Direct cost" aria-label="Direct cost" className="rounded-lg border bg-background px-3 py-2 text-sm" />
      <input name="payment_fee" required inputMode="decimal" defaultValue={amount(outcome.payment_fee_minor)} placeholder="Payment fee" aria-label="Payment fee" className="rounded-lg border bg-background px-3 py-2 text-sm" />
      <input name="tax_amount" required inputMode="decimal" defaultValue={amount(outcome.tax_amount_minor)} placeholder="Tax amount" aria-label="Tax amount" className="rounded-lg border bg-background px-3 py-2 text-sm" />
      <select name="economics_evidence_level" defaultValue={outcome.economics_evidence_level || 'reported'} className="rounded-lg border bg-background px-3 py-2 text-sm">
        <option value="reported">Reported</option><option value="documented">Documented</option><option value="settled">Settled</option>
      </select>
      <select name="economics_evidence_source" defaultValue={outcome.economics_evidence_source || 'operator_report'} className="rounded-lg border bg-background px-3 py-2 text-sm">
        <option value="operator_report">Operator report</option><option value="invoice">Invoice</option><option value="stripe_balance_transaction">Stripe balance transaction</option><option value="bank_statement">Bank statement</option><option value="other_document">Other document</option>
      </select>
      <input name="economics_evidence_reference" defaultValue={outcome.economics_evidence_reference || ''} placeholder="Evidence reference" aria-label="Economics evidence reference" className="rounded-lg border bg-background px-3 py-2 text-sm lg:col-span-2" />
      <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save economics</button>
      <textarea name="economics_notes" maxLength={2000} defaultValue={outcome.economics_notes || ''} placeholder="Cost evidence note (no passwords, card data or full bank details)" className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-8" />
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-8">Reported values use an operator report without a reference. Documented values require a document reference. Settled values require a bank-statement or Stripe balance-transaction reference. Every save creates an immutable audit event and is verified by readback.</p>
    </form>
  )
}

function NewBalloonProposalEditor({ quote, defaultValidUntil }: { quote: Quote; defaultValidUntil: string }) {
  return <details className="rounded-xl border bg-primary/5">
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Prepare and send an indicative new-balloon proposal</summary>
    <form action={sendNewBalloonProposal.bind(null, quote.id)} className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
      <select name="proposal_manufacturer" defaultValue={['pasha', 'schroeder'].includes(quote.manufacturer_preference || '') ? quote.manufacturer_preference || 'pasha' : 'pasha'} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="pasha">Pasha</option><option value="schroeder">Schroeder</option></select>
      <select name="proposal_currency" defaultValue="EUR" className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="USD">USD</option></select>
      <input name="proposal_amount_min" required inputMode="decimal" placeholder="Minimum indicative amount" aria-label="Minimum indicative amount" className="rounded-lg border bg-background px-3 py-2 text-sm" />
      <input name="proposal_amount_max" required inputMode="decimal" placeholder="Maximum indicative amount" aria-label="Maximum indicative amount" className="rounded-lg border bg-background px-3 py-2 text-sm" />
      <textarea name="proposal_configuration" required minLength={20} maxLength={2000} placeholder="Configuration included in this range" className="min-h-24 rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-4" />
      <input name="proposal_delivery_guidance" required maxLength={500} placeholder="Indicative delivery guidance" className="rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2" />
      <label className="grid gap-1 text-xs font-medium">Valid until<input name="proposal_valid_until" type="date" required defaultValue={defaultValidUntil} className="rounded-lg border bg-background px-3 py-2 text-sm" /></label>
      <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Store and send proposal</button>
      <textarea name="proposal_terms" maxLength={2000} placeholder="Conditions, exclusions and assumptions. Never include passwords or payment-card data." className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-4" />
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Nothing is sent until this button is pressed. The proposal is explicitly non-binding. QUOTE_SENT is recorded only after provider acceptance and database readback.</p>
    </form>
  </details>
}
