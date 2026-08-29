#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildNewBalloonManufacturerFunnel } from '../src/utils/new-balloon-manufacturers.mjs'
import { getListingAvailabilityState } from '../src/utils/listing-availability.mjs'

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

// Named query specifications prevent a positional result from ever being attributed to the wrong dataset.
const querySpecs = {
  users: ['users', 'id,is_premium,premium_source,created_at'],
  listings: ['listings', 'id,seller_id,category,status,price,currency,condition,location_country,contact_phone,details,created_at,updated_at,public_at,instagram_posted,facebook_posted'],
  images: ['images', 'listing_id,url,is_primary'],
  events: ['listing_events', 'listing_id,user_id,event_type,utm_source,utm_medium,utm_campaign,created_at'],
  quotes: ['quote_requests', 'id,status,name,email,phone,country,manufacturer_preference,equipment_type,volume_or_capacity,intended_use,budget_range,timeline,colors_or_branding,notes,created_at,updated_at'],
  newsletterRuns: ['newsletter_runs', 'id,status,dry_run,recipients_count,sent_count,failed_count,created_at,completed_at'],
  premiumAlertRuns: ['premium_alert_runs', 'id,listing_id,status,recipients_count,sent_count,failed_count,created_at,completed_at'],
  stripeEvents: ['stripe_webhook_events', 'event_id,event_type,status,attempts,stripe_created_at,processed_at'],
  paymentReceipts: ['payment_notification_receipts', 'charge_id,payment_type,livemode,amount_minor,currency,accepted_at'],
  inquiries: ['marketplace_inquiries', 'id,listing_id,currency,initial_offer_amount_minor,status,seller_notification_status,created_at,last_activity_at,closed_at'],
  negotiationEvents: ['marketplace_inquiry_offer_events', 'id,inquiry_id,event_type,actor_role,amount_minor,currency,buyer_notification_status,seller_notification_status,responding_to_event_id,created_at'],
  verifications: ['listing_verifications', 'listing_id,status,identity_checked,supporting_documents_checked,verified_at'],
  commercialNotifications: ['commercial_notification_receipts', 'id,notification_type,entity_type,status,delivery_attempts,next_attempt_at,created_at,attempted_at,accepted_at'],
  commercialOutcomes: ['commercial_outcomes', 'id,entity_type,entity_id,outcome_type,currency,gross_amount_minor,aerotrade_revenue_minor,evidence_level,evidence_source,evidence_reference,closed_at,settled_at'],
  newBalloonProposals: ['new_balloon_quote_proposals', 'id,quote_request_id,manufacturer,currency,amount_min_minor,amount_max_minor,delivery_status,valid_until,accepted_at,created_at'],
  wantedRequests: ['wanted_requests', 'id,category,currency,budget_min_minor,budget_max_minor,notify_on_match,status,referrer_host,utm_source,utm_medium,utm_campaign,created_at,last_activity_at,closed_at'],
  catalogSearchEvents: ['catalog_search_events', 'id,category,country,result_count,zero_results,utm_source,created_at'],
  sellerFunnelEvents: ['seller_funnel_events', 'id,seller_id,listing_id,stage,listing_plan,source,created_at'],
  listingWatchers: ['listing_watchers', 'id,listing_id,status,journey_key,created_at,confirmed_at,last_notified_at'],
  listingWatchDispatches: ['listing_watch_dispatches', 'id,watcher_id,listing_id,status,created_at,accepted_at'],
  listingAvailabilityConfirmations: ['listing_availability_confirmations', 'id,listing_id,seller_id,listing_status,source,confirmed_on,confirmed_at'],
  listingLifecycleEvents: ['listing_lifecycle_events', 'id,listing_id,actor_role,event_type,sale_channel,marketplace_inquiry_id,gross_amount_minor,currency,previous_status,new_status,created_at'],
}

const auditData = Object.fromEntries(await Promise.all(Object.entries(querySpecs).map(async ([name, [table, columns]]) => [name, await rows(table, columns)])))
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
  inquiries,
  negotiationEvents,
  verifications,
  commercialNotifications,
  commercialOutcomes,
  newBalloonProposals,
  wantedRequests,
  catalogSearchEvents,
  sellerFunnelEvents,
  listingWatchers,
  listingWatchDispatches,
  listingAvailabilityConfirmations,
  listingLifecycleEvents,
} = auditData

const countBy = (items, key) => items.reduce((counts, item) => {
  const value = String(item[key] ?? 'unknown')
  counts[value] = (counts[value] || 0) + 1
  return counts
}, {})

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
const latestAvailabilityByListing = [...listingAvailabilityConfirmations]
  .sort((left, right) => String(right.confirmed_at).localeCompare(String(left.confirmed_at)))
  .reduce((latest, confirmation) => {
    if (!latest.has(confirmation.listing_id)) latest.set(confirmation.listing_id, confirmation.confirmed_at)
    return latest
  }, new Map())
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
const recentEvents = events.filter((event) => event.created_at >= since30d)
const recentViews = recentEvents.filter((event) => event.event_type === 'VIEW')
const recentContacts = recentEvents.filter((event) => event.event_type === 'CONTACT_REVEAL')
const recentEnquiryCtaClicks = recentEvents.filter((event) => event.event_type === 'ENQUIRY_CTA_CLICKED')
const recentEnquiryFormViews = recentEvents.filter((event) => event.event_type === 'ENQUIRY_FORM_VIEWED')
const recentEnquiryFormStarts = recentEvents.filter((event) => event.event_type === 'ENQUIRY_FORM_STARTED')
const uniqueViewedListings = new Set(recentViews.map((event) => event.listing_id)).size
const uniqueContactedListings = new Set(recentContacts.map((event) => event.listing_id)).size
const registeredContacts = recentContacts.filter((event) => event.user_id).length
const anonymousContacts = recentContacts.length - registeredContacts
const recentQuotes = quotes.filter((quote) => quote.created_at >= since30d)
const newBalloonBuyerAcknowledgements = commercialNotifications.filter((notification) => notification.notification_type === 'new_balloon_buyer_ack')
const exhaustedNewBalloonBuyerAcknowledgements = newBalloonBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && Number(notification.delivery_attempts || 0) >= 2)
const inquiryBuyerAcknowledgements = commercialNotifications.filter((notification) => notification.notification_type === 'inquiry_buyer_ack')
const exhaustedInquiryBuyerAcknowledgements = inquiryBuyerAcknowledgements.filter((notification) => notification.status === 'failed' && Number(notification.delivery_attempts || 0) >= 2)
const newBalloonManufacturerFunnel = buildNewBalloonManufacturerFunnel({
  quotes,
  proposals: newBalloonProposals,
  outcomes: commercialOutcomes,
})
const recentListingWatchers = listingWatchers.filter((watcher) => watcher.created_at >= since30d)
const outcomeInquiryIds = new Set(commercialOutcomes.filter((outcome) => outcome.entity_type === 'marketplace_inquiry').map((outcome) => outcome.entity_id))
const reportedAeroTradeListingSales = listingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'AEROTRADE')
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
    listingClosures: {
      eventsTotal: listingLifecycleEvents.length,
      soldAeroTradeReported: reportedAeroTradeListingSales.length,
      soldOtherChannel: listingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'OTHER_CHANNEL').length,
      soldNotDisclosed: listingLifecycleEvents.filter((event) => event.event_type === 'SOLD' && event.sale_channel === 'NOT_DISCLOSED').length,
      withdrawn: listingLifecycleEvents.filter((event) => event.event_type === 'WITHDRAWN').length,
      pendingOutcomeReview: pendingReportedSaleReview.length,
      caveat: 'A seller-reported AeroTrade sale is a review signal, not settled revenue or a completed commercial outcome.',
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
    contactReveals30d: recentContacts.length,
    contactedListings30d: uniqueContactedListings,
    registeredContactReveals30d: registeredContacts,
    anonymousContactReveals30d: anonymousContacts,
    viewToContactRate: recentViews.length ? Number((recentContacts.length / recentViews.length).toFixed(4)) : 0,
    enquiryCtaClicks30d: recentEnquiryCtaClicks.length,
    enquiryFormViews30d: recentEnquiryFormViews.length,
    enquiryFormStarts30d: recentEnquiryFormStarts.length,
    viewToEnquiryCtaRate: recentViews.length ? Number((recentEnquiryCtaClicks.length / recentViews.length).toFixed(4)) : 0,
    formViewToStartRate: recentEnquiryFormViews.length ? Number((recentEnquiryFormStarts.length / recentEnquiryFormViews.length).toFixed(4)) : 0,
    formStartToStoredInquiryRate: recentEnquiryFormStarts.length ? Number((recentInquiries.length / recentEnquiryFormStarts.length).toFixed(4)) : 0,
    catalogSearches30d: catalogSearchEvents.filter((event) => event.created_at >= since30d).length,
    zeroResultCatalogSearches30d: catalogSearchEvents.filter((event) => event.created_at >= since30d && event.zero_results).length,
    catalogSearchesByCategory30d: countBy(catalogSearchEvents.filter((event) => event.created_at >= since30d), 'category'),
    catalogSearchesByUtmSource30d: countBy(catalogSearchEvents.filter((event) => event.created_at >= since30d), 'utm_source'),
    listingWatchers: listingWatchers.length,
    listingWatchers30d: recentListingWatchers.length,
    listingWatchersByStatus: countBy(listingWatchers, 'status'),
    activeListingWatchers: listingWatchers.filter((watcher) => watcher.status === 'ACTIVE').length,
    watchedListings: new Set(listingWatchers.filter((watcher) => watcher.status === 'ACTIVE').map((watcher) => watcher.listing_id)).size,
  },
  sellerActivation: {
    events30d: sellerFunnelEvents.filter((event) => event.created_at >= since30d).length,
    stages30d: countBy(sellerFunnelEvents.filter((event) => event.created_at >= since30d), 'stage'),
    distinctSellers30d: new Set(sellerFunnelEvents.filter((event) => event.created_at >= since30d).map((event) => event.seller_id)).size,
    checkoutRecoveries30d: sellerFunnelEvents.filter((event) => event.created_at >= since30d && event.stage === 'CHECKOUT_RESUMED').length,
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
    marketplaceBuyerResponseSellerNotificationsFailed: negotiationEvents.filter((event) => event.actor_role === 'BUYER' && event.event_type !== 'BUYER_OFFERED' && event.seller_notification_status === 'failed').length,
    wantedRequests: wantedRequests.length,
    wantedRequests30d: wantedRequests.filter((request) => request.created_at >= since30d).length,
    wantedRequestsByStatus: countBy(wantedRequests, 'status'),
    wantedRequestsByCategory: countBy(wantedRequests, 'category'),
    wantedRequestsByUtmSource: countBy(wantedRequests, 'utm_source'),
    wantedRequestsWithMatchConsent: wantedRequests.filter((request) => request.notify_on_match).length,
    newBalloonProposals: newBalloonProposals.length,
    newBalloonProposalsByDeliveryStatus: countBy(newBalloonProposals, 'delivery_status'),
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
    caveat: 'WON is an explicit recorded outcome; transaction value and settlement are not inferred.',
  },
  communications: {
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
    listingWatchDispatches: listingWatchDispatches.length,
    listingWatchDispatchStatuses: countBy(listingWatchDispatches, 'status'),
    runStatuses: {
      newsletters: countBy(newsletterRuns, 'status'),
      premiumAlerts: countBy(premiumAlertRuns, 'status'),
    },
  },
  revenue: {
    stripeEventsByType: countBy(stripeEvents, 'event_type'),
    stripeEventsByStatus: countBy(stripeEvents, 'status'),
    paymentReceipts: paymentReceipts.length,
    livePaymentReceipts: liveReceipts.length,
    liveGrossMinorByCurrency: liveGrossByCurrency,
    receiptTypes: countBy(paymentReceipts, 'payment_type'),
    caveat: 'Gross accepted amounts are not net revenue and exclude fees, tax, refunds and disputes.',
  },
  integrity: {
    containsPii: false,
    queryProfile: crypto.createHash('sha256').update('aerotrade-marketplace-audit-v2-read-only').digest('hex'),
  },
}

const output = path.resolve(process.argv[2] || 'reviews/marketplace-audit.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
const temporary = `${output}.${process.pid}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
fs.renameSync(temporary, output)
console.log(`Read-only marketplace audit written to ${output}`)
