#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildNewBalloonManufacturerFunnel } from '../src/utils/new-balloon-manufacturers.mjs'
import { getListingAvailabilityState } from '../src/utils/listing-availability.mjs'
import { buildComparableBuyerFunnel } from '../src/utils/buyer-funnel.mjs'
import { isOptionalSupabaseSchemaError } from '../src/utils/audit-schema-compatibility.mjs'
import { isActiveNewsletterConsent, normalizeNewsletterEmail } from '../src/utils/newsletter-consent.mjs'
import { isActivePublicNewsletterConsent } from '../src/utils/newsletter-recipients.mjs'
import { isSellerEnquiryEscalationDue } from '../src/utils/opportunity-followup.mjs'
import { sellerAvailabilityDigestIdempotencyKey, sellerAvailabilityDigestReadiness } from '../src/utils/seller-availability-digest.mjs'
import { getSocialAcquisitionMode } from '../src/utils/social-publication.mjs'

if (process.env.CONFIRM_READ_ONLY_PRODUCTION !== '1') {
  throw new Error('Set CONFIRM_READ_ONLY_PRODUCTION=1 only after explicit approval for a read-only production audit.')
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase production configuration.')

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const now = new Date()
const since30d = new Date(now.getTime() - 30 * 86_400_000).toISOString()
const staleListingCutoff = new Date(now.getTime() - 180 * 86_400_000).toISOString()

async function rows(table, columns, configure = (query) => query) {
  const { data, error } = await configure(supabase.from(table).select(columns))
  if (error) throw new Error(`${table}: ${error.message}`)
  return data || []
}

async function optionalRows(table, columns) {
  const { data, error } = await supabase.from(table).select(columns)
  if (!error) return { rows: data || [], available: true, reason: null }
  if (isOptionalSupabaseSchemaError(error)) return { rows: [], available: false, reason: 'not_deployed' }
  throw new Error(`${table}: ${error.message}`)
}

// Named query specifications prevent a positional result from ever being attributed to the wrong dataset.
const querySpecs = {
  users: ['users', 'id,email,is_premium,premium_source,created_at'],
  listings: ['listings', 'id,seller_id,category,status,price,currency,condition,location_country,contact_phone,details,created_at,updated_at,public_at,instagram_posted,facebook_posted'],
  images: ['images', 'listing_id,url,is_primary'],
  events: ['listing_events', 'listing_id,user_id,event_type,utm_source,utm_medium,utm_campaign,created_at'],
  quotes: ['quote_requests', 'id,status,name,email,phone,country,manufacturer_preference,equipment_type,volume_or_capacity,intended_use,budget_range,timeline,colors_or_branding,notes,source_context,journey_key,created_at,updated_at'],
  newsletterRuns: ['newsletter_runs', 'id,status,dry_run,recipients_count,sent_count,failed_count,listing_ids,created_at,completed_at'],
  premiumAlertRuns: ['premium_alert_runs', 'id,listing_id,status,recipients_count,sent_count,failed_count,created_at,completed_at'],
  stripeEvents: ['stripe_webhook_events', 'event_id,event_type,status,attempts,stripe_created_at,processed_at'],
  paymentReceipts: ['payment_notification_receipts', 'charge_id,payment_type,livemode,amount_minor,currency,stripe_checkout_session_id,user_id,listing_id,accepted_at'],
  premiumCheckoutIntents: ['premium_checkout_intents', 'id,user_id,source,status,created_at,completed_at,updated_at'],
  inquiries: ['marketplace_inquiries', 'id,listing_id,currency,initial_offer_amount_minor,status,seller_notification_status,created_at,last_activity_at,closed_at'],
  negotiationEvents: ['marketplace_inquiry_offer_events', 'id,inquiry_id,event_type,actor_role,amount_minor,currency,buyer_notification_status,seller_notification_status,responding_to_event_id,created_at'],
  verifications: ['listing_verifications', 'listing_id,status,identity_checked,supporting_documents_checked,verified_at'],
  commercialNotifications: ['commercial_notification_receipts', 'id,notification_type,entity_type,entity_id,status,idempotency_key,delivery_attempts,next_attempt_at,created_at,attempted_at,accepted_at'],
  commercialOutcomes: ['commercial_outcomes', 'id,entity_type,entity_id,outcome_type,currency,gross_amount_minor,aerotrade_revenue_minor,evidence_level,evidence_source,evidence_reference,closed_at,settled_at'],
  newBalloonProposals: ['new_balloon_quote_proposals', 'id,quote_request_id,manufacturer,currency,amount_min_minor,amount_max_minor,delivery_status,valid_until,accepted_at,created_at'],
  wantedRequests: ['wanted_requests', 'id,category,currency,budget_min_minor,budget_max_minor,notify_on_match,status,referrer_host,utm_source,utm_medium,utm_campaign,journey_key,created_at,last_activity_at,closed_at'],
  catalogSearchEvents: ['catalog_search_events', 'id,category,country,result_count,zero_results,utm_source,created_at'],
  sellerFunnelEvents: ['seller_funnel_events', 'id,seller_id,listing_id,stage,listing_plan,source,created_at'],
  listingWatchers: ['listing_watchers', 'id,listing_id,status,journey_key,created_at,confirmed_at,last_notified_at,closed_at'],
  listingWatchDispatches: ['listing_watch_dispatches', 'id,watcher_id,listing_id,status,created_at,accepted_at'],
  listingAvailabilityConfirmations: ['listing_availability_confirmations', 'id,listing_id,seller_id,listing_status,source,confirmed_on,confirmed_at'],
  listingLifecycleEvents: ['listing_lifecycle_events', 'id,listing_id,actor_role,event_type,sale_channel,marketplace_inquiry_id,gross_amount_minor,currency,previous_status,new_status,created_at'],
}

const auditData = Object.fromEntries(await Promise.all(Object.entries(querySpecs).map(async ([name, [table, columns]]) => [name, await rows(table, columns)])))
const optionalQuerySpecs = {
  commercialOutcomeEconomics: ['commercial_outcomes', 'id,direct_cost_minor,payment_fee_minor,tax_amount_minor,contribution_margin_minor,economics_evidence_level,economics_evidence_source,economics_recorded_at'],
  commercialUnitEconomicsEvents: ['commercial_unit_economics_events', 'id,outcome_id,event_type,currency,aerotrade_revenue_minor,direct_cost_minor,payment_fee_minor,tax_amount_minor,contribution_margin_minor,evidence_level,evidence_source,created_at'],
  newBalloonProposalResponses: ['new_balloon_proposal_response_events', 'id,proposal_id,quote_request_id,response_type,admin_notification_status,created_at'],
  socialPublicationReceipts: ['social_publication_receipts', 'status,network,placement,content_kind,content_id,attempt_count,retryable,created_at,accepted_at'],
  newsletterConsentProfiles: ['users', 'id,email,newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at'],
  newsletterPublicSubscriptions: ['newsletter_public_subscriptions', 'id,email,status,source_context,journey_key,referrer_host,utm_source,utm_medium,utm_campaign,requested_at,confirmed_at,unsubscribed_at'],
  catalogDemandEntryContexts: ['catalog_search_events', 'id,entry_context'],
  listingCheckoutIntents: ['listing_checkout_intents', 'id,listing_id,user_id,stripe_session_id,source,status,created_at,completed_at,updated_at'],
  wantedMatchDispatches: ['wanted_match_dispatches', 'listing_ids,status,accepted_at,created_at'],
  listingSaleClarifications: ['listing_sale_clarifications', 'id,lifecycle_event_id,listing_id,sale_channel,marketplace_inquiry_id,gross_amount_minor,currency,actor_role,created_at'],
  sellerDistributionEvents: ['seller_funnel_events', 'id,seller_id,listing_id,stage,channel,created_at'],
}
const optionalAuditResults = Object.fromEntries(await Promise.all(Object.entries(optionalQuerySpecs).map(async ([name, [table, columns]]) => [name, await optionalRows(table, columns)])))
const {
  users,
  listings,
  images,
  events,
  quotes,
  newsletterRuns,
  premiumAlertRuns,
  stripeEvents,
  paymentReceipts,
  premiumCheckoutIntents,
  inquiries,
  negotiationEvents,
  verifications,
  commercialNotifications,
  commercialOutcomes: baseCommercialOutcomes,
  newBalloonProposals,
  wantedRequests,
  catalogSearchEvents: baseCatalogSearchEvents,
  sellerFunnelEvents,
  listingWatchers,
  listingWatchDispatches,
  listingAvailabilityConfirmations,
  listingLifecycleEvents,
} = auditData
const commercialOutcomeEconomicsById = new Map(optionalAuditResults.commercialOutcomeEconomics.rows.map((row) => [row.id, row]))
const commercialOutcomes = baseCommercialOutcomes.map((outcome) => ({
  ...outcome,
  direct_cost_minor: null,
  payment_fee_minor: null,
  tax_amount_minor: null,
  contribution_margin_minor: null,
  economics_evidence_level: null,
  economics_evidence_source: null,
  economics_recorded_at: null,
  ...(commercialOutcomeEconomicsById.get(outcome.id) || {}),
}))
const commercialUnitEconomicsEvents = optionalAuditResults.commercialUnitEconomicsEvents.rows
const newBalloonProposalResponses = optionalAuditResults.newBalloonProposalResponses.rows
const socialPublicationReceipts = optionalAuditResults.socialPublicationReceipts.rows
const listingCheckoutIntents = optionalAuditResults.listingCheckoutIntents.rows
const wantedMatchDispatches = optionalAuditResults.wantedMatchDispatches.rows
const listingSaleClarifications = optionalAuditResults.listingSaleClarifications.rows
const sellerDistributionEvents = optionalAuditResults.sellerDistributionEvents.rows.filter((event) => event.stage === 'LISTING_SHARED')
const catalogDemandEntryContextById = new Map(optionalAuditResults.catalogDemandEntryContexts.rows.map((row) => [row.id, row.entry_context]))
const catalogSearchEvents = baseCatalogSearchEvents.map((event) => ({
  ...event,
  entry_context: catalogDemandEntryContextById.get(event.id) || 'catalog_search',
}))
const newsletterConsentByUserId = new Map(optionalAuditResults.newsletterConsentProfiles.rows.map((row) => [row.id, row]))
const newsletterConsentProfiles = users.map((user) => ({
  id: user.id,
  newsletter_consent_status: 'NOT_DEPLOYED',
  newsletter_consented_at: null,
  newsletter_unsubscribed_at: null,
  ...(newsletterConsentByUserId.get(user.id) || {}),
}))
const newsletterPublicSubscriptions = optionalAuditResults.newsletterPublicSubscriptions.rows
const activeNewsletterAudienceEmails = new Set([
  ...newsletterConsentProfiles
    .filter(isActiveNewsletterConsent)
    .map((profile) => normalizeNewsletterEmail(profile.email))
    .filter(Boolean),
  ...newsletterPublicSubscriptions
    .filter(isActivePublicNewsletterConsent)
    .map((subscription) => normalizeNewsletterEmail(subscription.email))
    .filter(Boolean),
])

const countBy = (items, key) => items.reduce((counts, item) => {
  const value = String(item[key] ?? 'unknown')
  counts[value] = (counts[value] || 0) + 1
  return counts
}, {})
const countByValue = (items, valueFor) => items.reduce((counts, item) => {
  const value = String(valueFor(item) || 'unknown')
  counts[value] = (counts[value] || 0) + 1
  return counts
}, {})
const completedSellerLaunchListingIds = new Set(listingCheckoutIntents.filter((intent) => intent.status === 'COMPLETED').map((intent) => intent.listing_id))
const newsletterPromotedListingIds = new Set(newsletterRuns
  .filter((run) => !run.dry_run && ['sent', 'partial'].includes(run.status))
  .flatMap((run) => Array.isArray(run.listing_ids) ? run.listing_ids : []))
const sociallyPromotedListingIds = new Set(socialPublicationReceipts
  .filter((receipt) => receipt.status === 'accepted' && receipt.content_kind === 'listing')
  .map((receipt) => receipt.content_id))
const wantedMatchedListingIds = new Set(wantedMatchDispatches
  .filter((dispatch) => dispatch.status === 'ACCEPTED')
  .flatMap((dispatch) => Array.isArray(dispatch.listing_ids) ? dispatch.listing_ids : []))

const activeStatuses = new Set(['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
const activeListings = listings.filter((listing) => activeStatuses.has(listing.status))
const imageStats = new Map()
for (const image of images) {
  const current = imageStats.get(image.listing_id) || { count: 0, primary: 0 }
  current.count += 1
  if (image.is_primary) current.primary += 1
  imageStats.set(image.listing_id, current)
}

const activeListingIds = new Set(activeListings.map((listing) => listing.id))
const latestAvailabilityRowsByListing = [...listingAvailabilityConfirmations]
  .sort((left, right) => String(right.confirmed_at).localeCompare(String(left.confirmed_at)))
  .reduce((latest, confirmation) => {
    if (!latest.has(confirmation.listing_id)) latest.set(confirmation.listing_id, confirmation)
    return latest
  }, new Map())
const latestAvailabilityByListing = new Map([...latestAvailabilityRowsByListing].map(([listingId, confirmation]) => [listingId, confirmation.confirmed_at]))
const availabilityStateByListing = new Map(activeListings.map((listing) => [
  listing.id,
  getListingAvailabilityState(latestAvailabilityByListing.get(listing.id), now),
]))
const activeImageRows = images.filter((image) => activeListingIds.has(image.listing_id))
const imageAvailability = await Promise.all(activeImageRows.map(async (image) => {
  try {
    const response = await fetch(image.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'image/*' },
    })
    const contentType = response.headers.get('content-type') || ''
    return { listingId: image.listing_id, available: response.ok && contentType.startsWith('image/'), unknown: false }
  } catch {
    return { listingId: image.listing_id, available: false, unknown: true }
  }
}))
const listingsWithReachableImage = new Set(imageAvailability.filter((probe) => probe.available).map((probe) => probe.listingId))

const detailsPresent = (listing, field) => {
  const value = listing.details?.[field]
  return value !== null && value !== undefined && String(value).trim().length > 0
}

const flightListings = activeListings.filter((listing) => ['complete', 'envelopes'].includes(listing.category))
const flightFieldCoverage = Object.fromEntries(
  ['manufacturer', 'model', 'year', 'hours', 'registration', 'serial'].map((field) => [
    field,
    {
      complete: flightListings.filter((listing) => detailsPresent(listing, field)).length,
      eligible: flightListings.length,
    },
  ]),
)

const sellerListingCounts = countBy(activeListings, 'seller_id')
const sellerConcentration = Object.values(sellerListingCounts).sort((a, b) => b - a)
const availabilityDueListings = activeListings.filter((listing) => !availabilityStateByListing.get(listing.id)?.publiclyFresh)
const availabilityDueBySeller = countBy(availabilityDueListings, 'seller_id')
const availabilityDueListingRowsBySeller = availabilityDueListings.reduce((grouped, listing) => {
  const due = grouped.get(listing.seller_id) || []
  due.push(listing)
  grouped.set(listing.seller_id, due)
  return grouped
}, new Map())
const availabilityDuePortfolioDistribution = Object.values(availabilityDueBySeller).reduce((distribution, listingCount) => {
  const key = String(listingCount)
  distribution[key] = (distribution[key] || 0) + 1
  return distribution
}, {})
const recentEvents = events.filter((event) => event.created_at >= since30d)
const recentViews = recentEvents.filter((event) => event.event_type === 'VIEW')
const recentSoldListingViews = recentEvents.filter((event) => event.event_type === 'SOLD_VIEW')
const recentContacts = recentEvents.filter((event) => event.event_type === 'CONTACT_REVEAL')
const recentEnquiryCtaClicks = recentEvents.filter((event) => event.event_type === 'ENQUIRY_CTA_CLICKED')
const recentEnquiryFormViews = recentEvents.filter((event) => event.event_type === 'ENQUIRY_FORM_VIEWED')
const recentEnquiryFormStarts = recentEvents.filter((event) => event.event_type === 'ENQUIRY_FORM_STARTED')
const uniqueViewedListings = new Set(recentViews.map((event) => event.listing_id)).size
const uniqueContactedListings = new Set(recentContacts.map((event) => event.listing_id)).size
const registeredContacts = recentContacts.filter((event) => event.user_id).length
const anonymousContacts = recentContacts.length - registeredContacts
const recentQuotes = quotes.filter((quote) => quote.created_at >= since30d)
const recentWantedRequests = wantedRequests.filter((request) => request.created_at >= since30d)
const soldListingViewJourneyKeys = new Set(recentSoldListingViews.map((event) => event.journey_key).filter(Boolean))
const soldListingNewBalloonRequests = recentQuotes.filter((quote) => quote.source_context === 'sold-listing')
const soldListingWantedRequests = recentWantedRequests.filter((request) => request.utm_source === 'sold_listing')
const soldListingRecoveredJourneyKeys = new Set([
  ...soldListingNewBalloonRequests.map((quote) => quote.journey_key),
  ...soldListingWantedRequests.map((request) => request.journey_key),
].filter((journeyKey) => journeyKey && soldListingViewJourneyKeys.has(journeyKey)))
const newBalloonBuyerAcknowledgements = commercialNotifications.filter((notification) => notification.notification_type === 'new_balloon_buyer_ack')
const exhaustedNewBalloonBuyerAcknowledgements = newBalloonBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && Number(notification.delivery_attempts || 0) >= 2)
const inquiryBuyerAcknowledgements = commercialNotifications.filter((notification) => notification.notification_type === 'inquiry_buyer_ack')
const exhaustedInquiryBuyerAcknowledgements = inquiryBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && Number(notification.delivery_attempts || 0) >= 2)
const wantedBuyerAcknowledgements = commercialNotifications.filter((notification) => notification.notification_type === 'wanted_buyer_ack')
const exhaustedWantedBuyerAcknowledgements = wantedBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && Number(notification.delivery_attempts || 0) >= 2)
const buyerEarlyAccessCheckoutRecoveries = commercialNotifications.filter((notification) => notification.notification_type === 'buyer_early_access_checkout_recovery')
const exhaustedBuyerEarlyAccessCheckoutRecoveries = buyerEarlyAccessCheckoutRecoveries.filter((notification) => notification.status === 'failed' && Number(notification.delivery_attempts || 0) >= 2)
const listingAvailabilityRequests = commercialNotifications.filter((notification) => notification.notification_type === 'listing_availability_request')
const sellerAvailabilityDigests = commercialNotifications.filter((notification) => notification.notification_type === 'seller_availability_digest')
const latestSellerDigestBySeller = [...sellerAvailabilityDigests]
  .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
  .reduce((latest, receipt) => {
    if (!latest.has(receipt.entity_id)) latest.set(receipt.entity_id, receipt)
    return latest
  }, new Map())
const sellerAvailabilityReadiness = [...availabilityDueListingRowsBySeller].map(([sellerId, dueListings]) => {
  const currentKey = sellerAvailabilityDigestIdempotencyKey(sellerId, dueListings.map((listing) => ({
    listingId: listing.id,
    confirmationId: latestAvailabilityRowsByListing.get(listing.id)?.id || null,
  })))
  return sellerAvailabilityDigestReadiness({
    hasContact: Boolean(users.find((user) => user.id === sellerId)?.email),
    currentKey,
    latestReceipt: latestSellerDigestBySeller.get(sellerId),
    now,
  })
})
const sellerAvailabilityReadinessCounts = countBy(sellerAvailabilityReadiness, 'status')
const listingVerificationEvidenceInstructions = commercialNotifications.filter((notification) => notification.notification_type === 'listing_verification_evidence_instructions')
const sellerFollowupByInquiry = new Map(commercialNotifications
  .filter((notification) => notification.notification_type === 'inquiry_seller_followup')
  .map((notification) => [notification.entity_id, notification]))
const sellerEnquiryEscalations = commercialNotifications.filter((notification) => notification.notification_type === 'inquiry_seller_escalation')
const unresolvedSellerEnquiryEscalations = inquiries.filter((inquiry) => {
  const reminder = sellerFollowupByInquiry.get(inquiry.id)
  return isSellerEnquiryEscalationDue({ inquiryStatus: inquiry.status, reminderStatus: reminder?.status, reminderAcceptedAt: reminder?.accepted_at }, now)
})
const newBalloonManufacturerFunnel = buildNewBalloonManufacturerFunnel({
  quotes,
  proposals: newBalloonProposals,
  responses: newBalloonProposalResponses,
  outcomes: commercialOutcomes,
})
const recentListingWatchers = listingWatchers.filter((watcher) => watcher.created_at >= since30d)
const comparableBuyerFunnel = buildComparableBuyerFunnel({ events, inquiries, now })
const outcomeInquiryIds = new Set(commercialOutcomes.filter((outcome) => outcome.entity_type === 'marketplace_inquiry').map((outcome) => outcome.entity_id))
const listingSaleClarificationByLifecycleEvent = new Map(listingSaleClarifications.map((clarification) => [clarification.lifecycle_event_id, clarification]))
const effectiveListingLifecycleEvents = listingLifecycleEvents.map((event) => {
  const clarification = listingSaleClarificationByLifecycleEvent.get(event.id)
  return clarification ? {
    ...event,
    sale_channel: clarification.sale_channel,
    marketplace_inquiry_id: clarification.marketplace_inquiry_id,
    gross_amount_minor: clarification.gross_amount_minor,
    currency: clarification.currency,
    clarified_at: clarification.created_at,
  } : { ...event, clarified_at: null }
})
const reportedAeroTradeListingSales = effectiveListingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'AEROTRADE')
const pendingReportedSaleReview = reportedAeroTradeListingSales.filter((event) => event.marketplace_inquiry_id && !outcomeInquiryIds.has(event.marketplace_inquiry_id))
const successfulNewsletterRuns = newsletterRuns.filter((run) => !run.dry_run && run.status === 'sent')
const successfulPremiumAlerts = premiumAlertRuns.filter((run) => run.status === 'sent')
const liveReceipts = paymentReceipts.filter((receipt) => receipt.livemode)
const liveGrossByCurrency = liveReceipts.reduce((totals, receipt) => {
  totals[receipt.currency] = (totals[receipt.currency] || 0) + Number(receipt.amount_minor || 0)
  return totals
}, {})

const result = {
  version: 1,
  projectId: 'aerotrade',
  readOnly: true,
  capturedAt: now.toISOString(),
  period: { rollingDays: 30, since: since30d },
  supply: {
    listingsTotal: listings.length,
    listingsByStatus: countBy(listings, 'status'),
    activeListings: activeListings.length,
    activeByCategory: countBy(activeListings, 'category'),
    activeByCountry: countBy(activeListings, 'location_country'),
    activeSellers: Object.keys(sellerListingCounts).length,
    largestSellerActiveListings: sellerConcentration[0] || 0,
    topThreeSellerShare: activeListings.length
      ? Number((sellerConcentration.slice(0, 3).reduce((sum, value) => sum + value, 0) / activeListings.length).toFixed(4))
      : 0,
    staleActiveListings: activeListings.filter((listing) => listing.updated_at < staleListingCutoff).length,
    pendingPaymentListings: listings.filter((listing) => listing.status === 'PENDING_PAYMENT').length,
    usersWithoutListings: users.filter((user) => !sellerListingCounts[user.id]).length,
    availabilityConfirmations: {
      fresh: activeListings.filter((listing) => availabilityStateByListing.get(listing.id)?.status === 'fresh').length,
      stale: activeListings.filter((listing) => availabilityStateByListing.get(listing.id)?.status === 'stale').length,
      never: activeListings.filter((listing) => availabilityStateByListing.get(listing.id)?.status === 'never').length,
      invalid: activeListings.filter((listing) => availabilityStateByListing.get(listing.id)?.status === 'invalid').length,
      eventsTotal: listingAvailabilityConfirmations.length,
    },
    availabilityRecovery: {
      dueListings: availabilityDueListings.length,
      dueSellers: Object.keys(availabilityDueBySeller).length,
      sellerPortfolioDistribution: availabilityDuePortfolioDistribution,
      requestReceipts: listingAvailabilityRequests.length,
      acceptedRequests: listingAvailabilityRequests.filter((request) => request.status === 'accepted').length,
      failedRequests: listingAvailabilityRequests.filter((request) => request.status === 'failed').length,
      sellerDigestReceipts: sellerAvailabilityDigests.length,
      acceptedSellerDigests: sellerAvailabilityDigests.filter((request) => request.status === 'accepted').length,
      failedSellerDigests: sellerAvailabilityDigests.filter((request) => request.status === 'failed').length,
      sellerReadiness: sellerAvailabilityReadinessCounts,
      actionableGroupedRequests: sellerAvailabilityReadiness.filter((readiness) => readiness.actionable).length,
      caveat: 'Counts are grouped without seller identifiers. A request is delivery evidence, not seller confirmation; only a seller-authenticated confirmation makes availability current.',
    },
    listingClosures: {
      eventsTotal: listingLifecycleEvents.length,
      clarificationsTotal: listingSaleClarifications.length,
      originalNotDisclosed: listingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'NOT_DISCLOSED').length,
      soldAeroTradeReported: reportedAeroTradeListingSales.length,
      soldOtherChannel: effectiveListingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'OTHER_CHANNEL').length,
      soldNotDisclosed: effectiveListingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'NOT_DISCLOSED').length,
      withdrawn: effectiveListingLifecycleEvents.filter((event) => event.event_type === 'WITHDRAWN').length,
      pendingOutcomeReview: pendingReportedSaleReview.length,
      caveat: 'A clarification is append-only and never rewrites the original closure. An AeroTrade sale remains a review signal, not settled revenue or a completed commercial outcome.',
    },
  },
  quality: {
    activeWithoutImages: activeListings.filter((listing) => !imageStats.get(listing.id)?.count).length,
    activeWithoutExactlyOnePrimaryImage: activeListings.filter((listing) => imageStats.get(listing.id)?.primary !== 1).length,
    activeWithAtLeastThreeImages: activeListings.filter((listing) => (imageStats.get(listing.id)?.count || 0) >= 3).length,
    activeImageFilesChecked: imageAvailability.length,
    inaccessibleActiveImageFiles: imageAvailability.filter((probe) => !probe.available && !probe.unknown).length,
    imageChecksUnknown: imageAvailability.filter((probe) => probe.unknown).length,
    activeListingsWithNoReachableImage: activeListings.filter((listing) => !listingsWithReachableImage.has(listing.id)).length,
    flightListings: flightListings.length,
    flightFieldCoverage,
    activeWithPhone: activeListings.filter((listing) => Boolean(listing.contact_phone)).length,
    verifiableTrustStateAvailable: true,
    verifiedListings: verifications.filter((verification) => verification.status === 'VERIFIED').length,
    verificationRequestsInReview: verifications.filter((verification) => verification.status === 'IN_REVIEW').length,
    verificationEvidenceInstructionReceipts: listingVerificationEvidenceInstructions.length,
    verificationEvidenceInstructionStatuses: countBy(listingVerificationEvidenceInstructions, 'status'),
    caveat: 'Verification records document review only; they do not represent airworthiness or a physical inspection.',
  },
  demand: {
    usersTotal: users.length,
    newUsers30d: users.filter((user) => user.created_at >= since30d).length,
    premiumUsers: users.filter((user) => user.is_premium).length,
    premiumBySource: countBy(users.filter((user) => user.is_premium), 'premium_source'),
    views30d: recentViews.length,
    viewsByUtmSource30d: countBy(recentViews, 'utm_source'),
    sharedLinkViews30d: recentViews.filter((event) => ['seller_share', 'listing_share'].includes(event.utm_source)).length,
    viewedListings30d: uniqueViewedListings,
    soldListingViews30d: recentSoldListingViews.length,
    soldListingViewJourneys30d: soldListingViewJourneyKeys.size,
    soldListingWantedRequests30d: soldListingWantedRequests.length,
    soldListingNewBalloonRequests30d: soldListingNewBalloonRequests.length,
    soldListingRecoveredJourneys30d: soldListingRecoveredJourneyKeys.size,
    contactReveals30d: recentContacts.length,
    contactedListings30d: uniqueContactedListings,
    registeredContactReveals30d: registeredContacts,
    anonymousContactReveals30d: anonymousContacts,
    viewToContactRate: recentViews.length ? Number((recentContacts.length / recentViews.length).toFixed(4)) : 0,
    enquiryCtaClicks30d: recentEnquiryCtaClicks.length,
    enquiryFormViews30d: recentEnquiryFormViews.length,
    enquiryFormStarts30d: recentEnquiryFormStarts.length,
    buyerFunnelComparable: comparableBuyerFunnel,
    viewToEnquiryCtaRate: comparableBuyerFunnel.rates.viewToCta,
    formViewToStartRate: comparableBuyerFunnel.rates.formViewToStart,
    formStartToStoredInquiryRate: comparableBuyerFunnel.rates.formStartToStoredInquiry,
    catalogSearches30d: catalogSearchEvents.filter((event) => event.created_at >= since30d && event.entry_context === 'catalog_search').length,
    zeroResultCatalogSearches30d: catalogSearchEvents.filter((event) => event.created_at >= since30d && event.entry_context === 'catalog_search' && event.zero_results).length,
    catalogSearchesByCategory30d: countBy(catalogSearchEvents.filter((event) => event.created_at >= since30d && event.entry_context === 'catalog_search'), 'category'),
    catalogSearchesByUtmSource30d: countBy(catalogSearchEvents.filter((event) => event.created_at >= since30d && event.entry_context === 'catalog_search'), 'utm_source'),
    localizedBuyerEntryVisits30d: catalogSearchEvents.filter((event) => event.created_at >= since30d && event.entry_context.startsWith('buyer_landing_')).length,
    localizedBuyerEntryVisitsByLocale30d: countBy(catalogSearchEvents.filter((event) => event.created_at >= since30d && event.entry_context.startsWith('buyer_landing_')), 'entry_context'),
    listingWatchers: listingWatchers.length,
    listingWatchers30d: recentListingWatchers.length,
    listingWatchersByStatus: countBy(listingWatchers, 'status'),
    activeListingWatchers: listingWatchers.filter((watcher) => watcher.status === 'ACTIVE').length,
    listingClosedWatchers: listingWatchers.filter((watcher) => watcher.status === 'LISTING_CLOSED').length,
    watchedListings: new Set(listingWatchers.filter((watcher) => watcher.status === 'ACTIVE').map((watcher) => watcher.listing_id)).size,
  },
  sellerActivation: {
    events30d: sellerFunnelEvents.filter((event) => event.created_at >= since30d).length,
    stages30d: countBy(sellerFunnelEvents.filter((event) => event.created_at >= since30d), 'stage'),
    distinctSellers30d: new Set(sellerFunnelEvents.filter((event) => event.created_at >= since30d).map((event) => event.seller_id)).size,
    checkoutRecoveries30d: sellerFunnelEvents.filter((event) => event.created_at >= since30d && event.stage === 'CHECKOUT_RESUMED').length,
    listingShareActions30d: sellerDistributionEvents.filter((event) => event.created_at >= since30d).length,
    listingShareActionsByChannel30d: countBy(sellerDistributionEvents.filter((event) => event.created_at >= since30d), 'channel'),
    sellerShareAttributedViews30d: recentViews.filter((event) => event.utm_source === 'seller_share').length,
    caveat: 'A share action is authenticated seller intent, not proof that a buyer received or opened the link. Only an attributed listing view proves a return visit.',
  },
  opportunities: {
    quoteRequestsTotal: quotes.length,
    quoteRequests30d: recentQuotes.length,
    quoteRequestsByStatus: countBy(quotes, 'status'),
    newBalloonManufacturerFunnel,
    quotesWithMinimumContactData: quotes.filter((quote) => Boolean(quote.name && quote.email && quote.equipment_type)).length,
    marketplaceLeadPipelineAvailable: true,
    marketplaceInquiries: inquiries.length,
    marketplaceInquiriesByStatus: countBy(inquiries, 'status'),
    marketplaceBuyerOffers: negotiationEvents.filter((event) => event.event_type === 'BUYER_OFFERED').length,
    marketplaceBuyerResponses: negotiationEvents.filter((event) => event.actor_role === 'BUYER' && event.event_type !== 'BUYER_OFFERED').length,
    marketplaceSellerResponses: negotiationEvents.filter((event) => event.actor_role !== 'BUYER').length,
    marketplaceSellerResponseNotificationsFailed: negotiationEvents.filter((event) => event.actor_role !== 'BUYER' && event.buyer_notification_status === 'failed').length,
    unresolvedSellerEnquiryEscalations: unresolvedSellerEnquiryEscalations.length,
    sellerEnquiryEscalationStatuses: countBy(sellerEnquiryEscalations, 'status'),
    marketplaceBuyerResponseSellerNotificationsFailed: negotiationEvents.filter((event) => event.actor_role === 'BUYER' && event.event_type !== 'BUYER_OFFERED' && event.seller_notification_status === 'failed').length,
    wantedRequests: wantedRequests.length,
    wantedRequests30d: wantedRequests.filter((request) => request.created_at >= since30d).length,
    wantedRequestsByStatus: countBy(wantedRequests, 'status'),
    wantedRequestsByCategory: countBy(wantedRequests, 'category'),
    wantedRequestsByUtmSource: countBy(wantedRequests, 'utm_source'),
    wantedRequestsWithMatchConsent: wantedRequests.filter((request) => request.notify_on_match).length,
    newBalloonProposals: newBalloonProposals.length,
    newBalloonProposalsByDeliveryStatus: countBy(newBalloonProposals, 'delivery_status'),
    newBalloonProposalResponses: newBalloonProposalResponses.length,
    newBalloonProposalResponsesByType: countBy(newBalloonProposalResponses, 'response_type'),
    newBalloonProposalResponseNotifications: countBy(newBalloonProposalResponses, 'admin_notification_status'),
    failedSellerNotifications: inquiries.filter((inquiry) => inquiry.seller_notification_status === 'failed').length,
    closedMarketplaceTransactionsKnown: inquiries.filter((inquiry) => inquiry.status === 'WON').length,
    commercialOutcomes: commercialOutcomes.length,
    outcomesByEvidence: countBy(commercialOutcomes, 'evidence_level'),
    grossOutcomeMinorByCurrency: commercialOutcomes.reduce((totals, outcome) => {
      totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.gross_amount_minor || 0)
      return totals
    }, {}),
    settledAerotradeRevenueMinorByCurrency: commercialOutcomes
      .filter((outcome) => outcome.evidence_level === 'settled')
      .reduce((totals, outcome) => {
        totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.aerotrade_revenue_minor || 0)
        return totals
      }, {}),
    outcomesWithCompleteEconomics: commercialOutcomes.filter((outcome) => outcome.contribution_margin_minor !== null).length,
    outcomesMissingEconomics: commercialOutcomes.filter((outcome) => outcome.contribution_margin_minor === null).length,
    unitEconomicsEvents: commercialUnitEconomicsEvents.length,
    unitEconomicsEventsByEvidence: countBy(commercialUnitEconomicsEvents, 'evidence_level'),
    evidenceBackedContributionMinorByCurrency: commercialOutcomes
      .filter((outcome) => outcome.contribution_margin_minor !== null)
      .reduce((totals, outcome) => {
        totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.contribution_margin_minor)
        return totals
      }, {}),
    settledContributionMinorByCurrency: commercialOutcomes
      .filter((outcome) => outcome.contribution_margin_minor !== null && outcome.economics_evidence_level === 'settled')
      .reduce((totals, outcome) => {
        totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.contribution_margin_minor)
        return totals
      }, {}),
    caveat: 'WON is an explicit recorded outcome; transaction value, costs, contribution and settlement are never inferred. Missing economics remain null, and negative contribution is valid.',
  },
  communications: {
    newsletterConsentProfiles: newsletterConsentProfiles.length,
    newsletterActiveConsents: newsletterConsentProfiles.filter(isActiveNewsletterConsent).length,
    newsletterConsentStatuses: countBy(newsletterConsentProfiles, 'newsletter_consent_status'),
    newsletterPublicSubscriptions: newsletterPublicSubscriptions.length,
    newsletterPublicActiveConsents: newsletterPublicSubscriptions.filter(isActivePublicNewsletterConsent).length,
    newsletterPublicConsentStatuses: countBy(newsletterPublicSubscriptions, 'status'),
    newsletterPublicRequestsBySource: countBy(newsletterPublicSubscriptions, 'source_context'),
    newsletterPublicRequestsByUtmSource: countBy(newsletterPublicSubscriptions, 'utm_source'),
    newsletterPublicConfirmedBySource: countBy(newsletterPublicSubscriptions.filter(isActivePublicNewsletterConsent), 'source_context'),
    newsletterPublicAttributedRequests: newsletterPublicSubscriptions.filter((subscription) => subscription.journey_key || subscription.referrer_host || subscription.utm_source || subscription.utm_medium || subscription.utm_campaign).length,
    newsletterCombinedActiveAudience: activeNewsletterAudienceEmails.size,
    newsletterRuns: newsletterRuns.length,
    successfulLiveNewsletterRuns: successfulNewsletterRuns.length,
    newsletterRecipientsAccepted: successfulNewsletterRuns.reduce((sum, run) => sum + Number(run.sent_count || 0), 0),
    premiumAlertRuns: premiumAlertRuns.length,
    successfulPremiumAlertRuns: successfulPremiumAlerts.length,
    premiumAlertRecipientsAccepted: successfulPremiumAlerts.reduce((sum, run) => sum + Number(run.sent_count || 0), 0),
    commercialNotificationReceipts: commercialNotifications.length,
    commercialNotificationStatuses: countBy(commercialNotifications, 'status'),
    newBalloonBuyerAcknowledgements: newBalloonBuyerAcknowledgements.length,
    newBalloonBuyerAcknowledgementStatuses: countBy(newBalloonBuyerAcknowledgements, 'status'),
    newBalloonBuyerAcknowledgementAttempts: countBy(newBalloonBuyerAcknowledgements, 'delivery_attempts'),
    exhaustedNewBalloonBuyerAcknowledgements: exhaustedNewBalloonBuyerAcknowledgements.length,
    inquiryBuyerAcknowledgements: inquiryBuyerAcknowledgements.length,
    inquiryBuyerAcknowledgementStatuses: countBy(inquiryBuyerAcknowledgements, 'status'),
    inquiryBuyerAcknowledgementAttempts: countBy(inquiryBuyerAcknowledgements, 'delivery_attempts'),
    exhaustedInquiryBuyerAcknowledgements: exhaustedInquiryBuyerAcknowledgements.length,
    wantedBuyerAcknowledgements: wantedBuyerAcknowledgements.length,
    wantedBuyerAcknowledgementStatuses: countBy(wantedBuyerAcknowledgements, 'status'),
    wantedBuyerAcknowledgementAttempts: countBy(wantedBuyerAcknowledgements, 'delivery_attempts'),
    exhaustedWantedBuyerAcknowledgements: exhaustedWantedBuyerAcknowledgements.length,
    buyerEarlyAccessCheckoutRecoveries: buyerEarlyAccessCheckoutRecoveries.length,
    buyerEarlyAccessCheckoutRecoveryStatuses: countBy(buyerEarlyAccessCheckoutRecoveries, 'status'),
    buyerEarlyAccessCheckoutRecoveryAttempts: countBy(buyerEarlyAccessCheckoutRecoveries, 'delivery_attempts'),
    exhaustedBuyerEarlyAccessCheckoutRecoveries: exhaustedBuyerEarlyAccessCheckoutRecoveries.length,
    listingWatchDispatches: listingWatchDispatches.length,
    listingWatchDispatchStatuses: countBy(listingWatchDispatches, 'status'),
    socialPublications30d: socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d).length,
    socialPublicationStatuses30d: countBy(socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d), 'status'),
    socialPublicationNetworksAccepted30d: countBy(socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d && receipt.status === 'accepted'), 'network'),
    socialPublicationPlacementsAccepted30d: countBy(socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d && receipt.status === 'accepted'), 'placement'),
    socialPublicationAcquisitionModesAccepted30d: countByValue(
      socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d && receipt.status === 'accepted'),
      (receipt) => getSocialAcquisitionMode(receipt),
    ),
    socialPublicationNeedsAttention30d: socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d && receipt.status !== 'accepted').length,
    socialPublicationRetryable30d: socialPublicationReceipts.filter((receipt) => receipt.created_at >= since30d && receipt.status === 'failed' && receipt.retryable).length,
    runStatuses: {
      newsletters: countBy(newsletterRuns, 'status'),
      premiumAlerts: countBy(premiumAlertRuns, 'status'),
    },
  },
  revenue: {
    buyerEarlyAccessCheckoutIntents: premiumCheckoutIntents.length,
    buyerEarlyAccessCheckoutIntentStatuses: countBy(premiumCheckoutIntents, 'status'),
    buyerEarlyAccessCheckoutIntentSources: countBy(premiumCheckoutIntents, 'source'),
    sellerLaunchCheckoutIntents: listingCheckoutIntents.length,
    sellerLaunchCheckoutIntentStatuses: countBy(listingCheckoutIntents, 'status'),
    sellerLaunchCheckoutIntentSources: countBy(listingCheckoutIntents, 'source'),
    completedSellerLaunchListingsIncludedInNewsletter: [...completedSellerLaunchListingIds].filter((id) => newsletterPromotedListingIds.has(id)).length,
    completedSellerLaunchListingsPublishedSocially: [...completedSellerLaunchListingIds].filter((id) => sociallyPromotedListingIds.has(id)).length,
    completedSellerLaunchListingsMatchedToEligibleDemand: [...completedSellerLaunchListingIds].filter((id) => wantedMatchedListingIds.has(id)).length,
    stripeEventsByType: countBy(stripeEvents, 'event_type'),
    stripeEventsByStatus: countBy(stripeEvents, 'status'),
    paymentReceipts: paymentReceipts.length,
    livePaymentReceipts: liveReceipts.length,
    livePaymentReceiptsLinkedToEntitlement: liveReceipts.filter((receipt) => receipt.user_id || receipt.listing_id).length,
    livePaymentReceiptsWithoutEntitlementLink: liveReceipts.filter((receipt) => !receipt.user_id && !receipt.listing_id).length,
    liveGrossMinorByCurrency: liveGrossByCurrency,
    receiptTypes: countBy(paymentReceipts, 'payment_type'),
    caveat: 'Gross accepted amounts are not net revenue and exclude fees, tax, refunds and disputes.',
  },
  integrity: {
    containsPii: false,
    queryProfile: crypto.createHash('sha256').update('aerotrade-marketplace-audit-v2-read-only').digest('hex'),
    releaseCandidateDatasets: Object.fromEntries(Object.entries(optionalAuditResults).map(([name, value]) => [name, {
      available: value.available,
      reason: value.reason,
    }])),
  },
}

const output = path.resolve(process.argv[2] || 'reviews/marketplace-audit.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
const temporary = `${output}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
fs.renameSync(temporary, output)
console.log(`Read-only marketplace audit written to ${output}`)
