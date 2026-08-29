import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const checks = [
  {
    name: 'Buyer membership and seller promotion have distinct public product names',
    file: 'src/utils/paid-product-labels.mjs',
    required: ['AeroTrade Buyer Early Access', 'AeroTrade Seller Launch Promotion', 'premium_subscription', 'listing_fee'],
  },
  {
    name: 'Seller promotion promises only implemented distribution channels',
    file: 'src/components/SellForm.tsx',
    required: ['eligible opted-in wanted requests', 'rotating social promotion while active', 'It does not include buyer membership'],
    forbidden: ['personal WhatsApp outreach', 'personal buyer outreach'],
  },
  {
    name: 'Runtime dependencies are pinned to the audited release line',
    file: 'package.json',
    required: ['"next": "16.3.3"', '"eslint-config-next": "16.3.3"', '"resend": "6.25.0"'],
  },
  {
    name: 'Netlify skips evidence-only commits but fails safe for runtime changes',
    file: 'scripts/netlify-ignore-build.mjs',
    required: ['CACHED_COMMIT_REF', 'COMMIT_REF', "spawnSync('git', ['diff', '--name-only'", 'runtimeFiles.length === 0', 'process.exit(0)', 'process.exit(1)', "normalized === 'scripts/netlify-ignore-build.mjs'"],
  },
  {
    name: 'Netlify executes the reviewed build gate before consuming a build',
    file: 'netlify.toml',
    required: ['[build]', 'ignore = "node scripts/netlify-ignore-build.mjs"'],
  },
  {
    name: 'Stripe webhook verifies signatures and audits idempotency',
    file: 'src/app/api/webhooks/stripe/route.ts',
    required: ['stripe.webhooks.constructEvent', "from('stripe_webhook_events')", "from('payment_notification_receipts')", "finishWebhookEvent(supabaseAdmin, event.id, 'processed')", "case 'charge.succeeded'", 'buildPaymentNotification', 'buildPaymentNotificationReceipt', 'matchesPaymentNotificationReceipt', 'Premium fulfillment readback failed'],
  },
  {
    name: 'Stripe event audit migration exists and is private',
    file: 'supabase/migrations/20260711120000_audit_stripe_webhook_events.sql',
    required: ['event_id text primary key', 'enable row level security', 'revoke all'],
  },
  {
    name: 'Payment notifications have a private durable receipt',
    file: 'supabase/migrations/20260828120000_payment_notification_receipts.sql',
    required: ['charge_id text primary key', 'stripe_event_id text not null unique', 'provider_message_id text not null unique', 'enable row level security', 'revoke all'],
  },
  {
    name: 'Stripe commercial audit is read-only and PII-free',
    file: 'scripts/capture-stripe-commercial-audit.mjs',
    required: ['CONFIRM_READ_ONLY_STRIPE', 'containsPii: false', 'webhookEndpoints.list', 'requiredEventCoverage', 'grossMinorByCurrency', 'Historical charges without current metadata are not assigned to a product by inference.'],
  },
  {
    name: 'Premium checkout validates current entitlement and uses trusted returns',
    file: 'src/app/pricing/actions.ts',
    required: ["select('is_premium, stripe_customer_id')", 'getApplicationOrigin', 'createPremiumMembershipCheckout'],
  },
  {
    name: 'Premium checkout abandonment is private, recoverable and webhook-closed',
    file: 'supabase/migrations/20260829200000_premium_checkout_intents.sql',
    required: ['premium_checkout_intents', "status in ('STARTED', 'COMPLETED', 'EXPIRED', 'SUPERSEDED')", 'enable row level security', 'revoke all', 'stores no card data, checkout URL or free text'],
  },
  {
    name: 'Premium checkout creation fails closed unless recovery state persists',
    file: 'src/utils/premium-checkout.ts',
    required: ['buildPremiumCheckoutParams', "from('premium_checkout_intents')", 'Premium checkout was not durably recorded', 'checkout.sessions.expire', "status: 'SUPERSEDED'"],
  },
  {
    name: 'Premium checkout has a real safe Stripe test-mode gate',
    file: 'scripts/test-premium-checkout-stripe.mjs',
    required: ['CONFIRM_STRIPE_TEST_MODE', "startsWith('sk_test_')", 'checkout.sessions.create', 'checkout.sessions.expire', 'economicActionsPerformed: 0'],
  },
  {
    name: 'Premium membership can resume an open session or create one tracked replacement',
    file: 'src/app/dashboard/actions.ts',
    required: ['resumePremiumMembershipCheckout', "session.status === 'open'", "session.status === 'expired'", 'createPremiumMembershipCheckout'],
  },
  {
    name: 'Admin Premium payment links use the same recoverable checkout ledger',
    file: 'src/app/admin/actions.ts',
    required: ['createPremiumMembershipCheckout', "source: 'admin'", 'checkout.url'],
  },
  {
    name: 'Premium listing fee is independent from buyer membership',
    file: 'src/app/sell/actions.ts',
    required: ['getInitialListingPublication(listingPlan)', 'createPremiumListingCheckout', 'parseListingImageUrls'],
    forbidden: ['shouldStartPremiumWindow'],
  },
  {
    name: 'Premium listing checkout has trusted metadata and returns',
    file: 'src/utils/listing-checkout.ts',
    required: ['premiumListingFeeCents', "type: 'listing_fee'", 'listing_id: listingId', 'success_url: `${origin}/catalog/${listingId}?success=true`', 'cancel_url: `${origin}/dashboard?listing_payment=canceled`'],
  },
  {
    name: 'Seller contact uses active-listing visibility rules',
    file: 'src/app/catalog/[id]/actions.ts',
    required: ['canRevealSellerContact', 'Buyer Early Access is required to reveal this contact', "event_type: 'CONTACT_REVEAL'", 'user_id: user?.id || null'],
  },
  {
    name: 'Marketplace enquiries are private, durable and seller-manageable',
    file: 'supabase/migrations/20260829100000_marketplace_inquiry_pipeline.sql',
    required: ['marketplace_inquiries', 'enable row level security', 'revoke all on public.marketplace_inquiries from anon', 'Sellers can view enquiries for their listings', "status in ('NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM')"],
  },
  {
    name: 'Buyer enquiries fail closed on storage and preserve provider evidence',
    file: 'src/app/catalog/[id]/actions.ts',
    required: ['parseInquiry(formData)', "from('marketplace_inquiries')", 'seller_notification_provider_id', 'Provider acceptance was not confirmed.', 'Marketplace enquiry readback failed'],
  },
  {
    name: 'Buyer intent stages expose real listing drop-off without accepting arbitrary event text',
    file: 'src/utils/listing-commercial-intent.mjs',
    required: ['ENQUIRY_CTA_CLICKED', 'ENQUIRY_FORM_VIEWED', 'ENQUIRY_FORM_STARTED', 'listingCommercialIntentStages.includes(normalized)'],
    forbidden: ['buyer_email', 'visitorId'],
  },
  {
    name: 'Listing intent measurement excludes operators and owners and cannot block conversion',
    file: 'src/app/catalog/[id]/actions.ts',
    required: ['logListingCommercialIntent', 'normalizeListingCommercialIntentStage', "profile?.role === 'admin' || listing.seller_id === user?.id", 'Marketplace operators and listing owners cannot create buyer enquiries.'],
  },
  {
    name: 'High-intent listing traffic has a measurable path to the tracked enquiry form',
    file: 'src/app/catalog/[id]/BuyerInquiryForm.tsx',
    required: ['IntersectionObserver', "recordIntent('ENQUIRY_FORM_VIEWED')", "recordIntent('ENQUIRY_FORM_STARTED')", 'Commercial measurement must never block an enquiry.'],
  },
  {
    name: 'Marketplace negotiation is private, non-binding and atomically seller-authorized',
    file: 'supabase/migrations/20260829320000_inquiry_negotiation_events.sql',
    required: ['marketplace_inquiry_offer_events', 'record_initial_marketplace_offer', 'record_seller_inquiry_response', 'for update of inquiry', "grant execute on function public.record_seller_inquiry_response", 'buyer_notification_status', 'never reserves equipment, executes payment or forms a sale contract'],
    forbidden: ['charge_id', 'payment_intent', 'reservation_id'],
  },
  {
    name: 'Seller negotiation responses store before notifying and verify both results',
    file: 'src/app/dashboard/actions.ts',
    required: ['respondToBuyerInquiry', 'parseSellerInquiryResponse', "rpc('record_seller_inquiry_response'", 'The negotiation response was not confirmed by readback', 'inquiry_buyer_seller_response', 'inquiry-buyer-seller-response-${event.id}', 'The buyer notification result could not be verified'],
  },
  {
    name: 'Buyer negotiation replies are capability-bound, atomic and service-only',
    file: 'supabase/migrations/20260829420000_buyer_negotiation_loop.sql',
    required: ['responding_to_event_id', 'marketplace_inquiry_one_buyer_response_per_seller_event', 'record_buyer_inquiry_response', 'for update of inquiry', 'This negotiation link is no longer current', 'revoke all on function public.record_buyer_inquiry_response', 'grant execute on function public.record_buyer_inquiry_response', 'cannot reserve equipment, move money or form a contract'],
    forbidden: ['payment_intent', 'reservation_id'],
  },
  {
    name: 'Buyer negotiation links are private, time-limited and context-bound',
    file: 'src/utils/inquiry-buyer-capability.mjs',
    required: ['inquiryBuyerCapabilityLifetimeMs', 'inquiry-buyer-response|v1', 'createHmac', 'timingSafeEqual', 'maximumFutureLifetimeMs'],
  },
  {
    name: 'Buyers receive a private account-free deal room with bounded authority',
    file: 'src/app/inquiry/status/page.tsx',
    required: ['verifyInquiryBuyerPortalCapability', 'Private AeroTrade deal room', 'responding_to_event_id', 'signInquiryBuyerCapability', 'noarchive: true', 'No status on this page reserves equipment, moves money or creates a sale contract.'],
    forbidden: ['contact_email', 'mailto:${inquiry.buyer_email}'],
  },
  {
    name: 'Private enquiry capabilities are never cached, indexed or leaked as referrers',
    file: 'src/proxy.ts',
    required: ["request.nextUrl.pathname === '/inquiry/status'", "request.nextUrl.pathname === '/inquiry/respond'", "'Cache-Control', 'private, no-store, max-age=0'", "'Referrer-Policy', 'no-referrer'", "'X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet'"],
  },
  {
    name: 'Buyer deal-room links are inquiry and email bound for 90 days',
    file: 'src/utils/inquiry-buyer-capability.mjs',
    required: ['inquiryBuyerPortalCapabilityLifetimeMs', 'inquiry-buyer-portal|v1', 'maximumFuturePortalLifetimeMs', 'verifyInquiryBuyerPortalCapability'],
  },
  {
    name: 'Stored enquiries and seller updates issue fresh private status links',
    file: 'src/app/catalog/[id]/actions.ts',
    required: ['signInquiryBuyerPortalCapability', '/inquiry/status?id=', 'buildInquiryBuyerAcknowledgement', 'buyerPortalUrl'],
  },
  {
    name: 'Marketplace acknowledgement copy preserves the private status boundary',
    file: 'src/utils/inquiry-buyer-acknowledgement.mjs',
    required: ['private enquiry status and negotiation history', 'This private link expires after 90 days.', 'does not reserve the equipment or form a sale contract', 'escapeHtml'],
  },
  {
    name: 'Seller responses issue a buyer capability without weakening delivery evidence',
    file: 'src/app/dashboard/actions.ts',
    required: ['signInquiryBuyerCapability', 'signInquiryBuyerPortalCapability', 'capabilityExpiresAt', 'Respond securely through AeroTrade', 'This private link expires after 30 days.', 'Open the complete private enquiry history', 'This status link expires after 90 days.', 'inquiry_buyer_seller_response'],
  },
  {
    name: 'Buyer replies verify authority before atomic storage and seller notification',
    file: 'src/app/inquiry/respond/actions.ts',
    required: ['verifyInquiryBuyerCapability', "rpc('record_buyer_inquiry_response'", 'responseReadbackError', 'inquiry_seller_buyer_response', 'inquiry-seller-buyer-response-${event.id}', 'seller_notification_status'],
  },
  {
    name: 'Commercial operational emails have private durable receipts',
    file: 'supabase/migrations/20260829130000_commercial_notification_receipts.sql',
    required: ['commercial_notification_receipts', 'idempotency_key text not null unique', 'enable row level security', 'revoke all on public.commercial_notification_receipts from anon, authenticated'],
  },
  {
    name: 'Commercial closure is atomic, auditable and evidence-gated',
    file: 'supabase/migrations/20260829330000_atomic_commercial_outcomes.sql',
    required: ['commercial_outcome_events', 'record_commercial_outcome', 'for update', 'enforce_commercial_outcome_status', 'WON status requires an atomic commercial outcome', 'Outcome evidence cannot be downgraded', "p_evidence_source not in ('bank_transfer', 'stripe_payment')", 'grant execute on function public.record_commercial_outcome', 'enable row level security', 'revoke all on public.commercial_outcome_events from anon, authenticated'],
  },
  {
    name: 'New-balloon requests can become traceable operator-priced proposals',
    file: 'supabase/migrations/20260829340000_new_balloon_proposals.sql',
    required: ['new_balloon_quote_proposals', 'proposal_fingerprint text not null unique', 'accept_new_balloon_proposal_delivery', "status='QUOTE_SENT'", 'new_balloon_proposal_buyer', 'enable row level security', 'revoke all on public.new_balloon_quote_proposals from anon, authenticated'],
  },
  {
    name: 'New-balloon proposal stores before sending and advances only after provider acceptance',
    file: 'src/app/admin/actions.ts',
    required: ['sendNewBalloonProposal', 'parseNewBalloonProposal', "from('new_balloon_quote_proposals').insert", 'new_balloon_proposal_buyer', "rpc('accept_new_balloon_proposal_delivery'", 'Provider accepted the proposal, but its commercial transition was not verified'],
  },
  {
    name: 'Stored new-balloon requests acknowledge the buyer independently with durable evidence',
    file: 'src/app/new-balloon/actions.ts',
    required: ['sendCommercialReceiptEmail', 'buildNewBalloonBuyerAcknowledgement', "notificationType: 'new_balloon_buyer_ack'", "recipientRole: 'buyer'", 'new-balloon-buyer-ack-${requestId}', 'buyer acknowledgement could not be completed'],
  },
  {
    name: 'New-balloon acknowledgement copy is transactional and non-binding',
    file: 'src/utils/new-balloon-buyer-acknowledgement.mjs',
    required: ['Any initial configuration or budget range is non-binding.', 'not a factory order', 'creates no payment obligation', 'escapeHtml'],
  },
  {
    name: 'New-balloon buyer acknowledgements use a closed transactional receipt type',
    file: 'supabase/migrations/20260829430000_new_balloon_buyer_acknowledgement.sql',
    required: ['new_balloon_buyer_ack', 'commercial_notification_receipts_notification_type_check', 'not a quotation, order or marketing subscription'],
  },
  {
    name: 'Transactional email recovery has an auditable two-attempt budget',
    file: 'supabase/migrations/20260829440000_commercial_notification_retry_budget.sql',
    required: ['delivery_attempts integer not null default 0', 'delivery_attempts between 0 and 2', 'next_attempt_at', 'commercial_notification_receipts_retry_idx', 'closed budget of two attempts'],
  },
  {
    name: 'Commercial delivery claims are optimistic, idempotent and bounded',
    file: 'src/utils/commercial-notification.ts',
    required: ['getCommercialDeliveryDecision', 'getNextCommercialAttemptAt', ".eq('delivery_attempts', previousAttempts)", ".in('status', ['pending', 'failed'])", "'claim_conflict'", 'commercialDeliveryMaxAttempts'],
  },
  {
    name: 'Marketplace buyer acknowledgement retries preserve the private deal room',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ["'inquiry_buyer_ack'", 'dueMarketplaceInquiryBuyerAcknowledgementRetries', 'signInquiryBuyerPortalCapability', 'buildInquiryBuyerAcknowledgement', 'inquiry-buyer-ack-${inquiry.id}', 'Marketplace enquiry buyer acknowledgement retry failed'],
  },
  {
    name: 'Unmet buyer demand is durable, consented and private',
    file: 'supabase/migrations/20260829150000_wanted_requests.sql',
    required: ['wanted_requests', 'notify_on_match boolean not null default false', 'privacy_consent_at', 'wanted_requests_budget_order', 'submission_key text', 'enable row level security', 'revoke all on public.wanted_requests from anon, authenticated'],
  },
  {
    name: 'Wanted demand stores before notification and is de-duplicated',
    file: 'src/app/wanted/actions.ts',
    required: ['parseWantedRequest(formData)', 'createWantedSubmissionKey', "from('wanted_requests')", 'duplicateCutoff', 'rateCutoff', "from('commercial_notification_receipts')", 'Wanted request ${stored.id} notification result could not be verified'],
  },
  {
    name: 'Wanted demand records bounded source attribution without a raw visitor id',
    file: 'supabase/migrations/20260829160000_wanted_request_attribution.sql',
    required: ['referrer_host text', 'utm_source text', 'wanted_requests_attribution_idx', 'No raw visitor identifier'],
  },
  {
    name: 'Consented wanted matches have a private, durable and deduplicated dispatch ledger',
    file: 'supabase/migrations/20260829270000_wanted_match_dispatches.sql',
    required: ['wanted_match_dispatches', 'match_fingerprint text not null unique', 'cardinality(listing_ids) between 1 and 5', 'wanted_match_buyer', 'enable row level security', 'revoke all on public.wanted_match_dispatches from anon, authenticated'],
  },
  {
    name: 'Wanted-match alerts are opt-in, digest-based, retryable and never repeat the same listing',
    file: 'src/app/api/cron/wanted-match/route.ts',
    required: [".eq('notify_on_match', true)", "not('status', 'in', '(CLOSED,SPAM)')", 'getUnnotifiedWantedMatchIds', 'wantedMatchDispatchFingerprint', 'isWantedMatchDispatchRetryable', 'sendCommercialReceiptEmail', 'not a marketing campaign', 'AeroTrade will not repeat these same listings'],
  },
  {
    name: 'Listing watches are private, double-opt-in and internally consistent',
    file: 'supabase/migrations/20260829410000_listing_watchers.sql',
    required: ['listing_watchers', "status in ('PENDING_CONFIRMATION', 'ACTIVE', 'UNSUBSCRIBED', 'BLOCKED')", 'privacy_consent_at', 'listing_watchers_confirmation_state', 'listing_watch_dispatches_watcher_listing_fk', 'listing_watch_dispatches_delivery_state', 'enable row level security', 'revoke all on public.listing_watchers from anon, authenticated', 'not an enquiry, reservation, payment or marketing subscription'],
  },
  {
    name: 'Listing-watch intake stores consent before confirmation and excludes artificial demand',
    file: 'src/app/catalog/[id]/watch-actions.ts',
    required: ['parseListingWatchRequest', 'createListingWatchSubmissionKey', 'Owners and marketplace operators do not create buyer watch signals', 'Buyer Early Access is required while this promoted listing is private', "status: 'PENDING_CONFIRMATION'", "from('listing_watchers')", 'listing_watch_confirmation', 'Alerts remain inactive until you do'],
  },
  {
    name: 'Listing-watch alerts are material, idempotent, retryable and recheck consent before sending',
    file: 'src/app/api/cron/listing-watch/route.ts',
    required: [".eq('status', 'ACTIVE')", 'createListingWatchSnapshot', 'stillEarlyAccess', 'isListingWatchDispatchRetryable', 'listing_watch_update', 'listing-watch-update-${watcher.id}-${snapshot.hash}', 'Stop updates for this listing', "stillActive?.status !== 'ACTIVE'", 'last_notified_snapshot_hash'],
  },
  {
    name: 'Listing-watch decisions require an explicit POST and reconcile concurrent state changes',
    file: 'src/app/watch/actions.ts',
    required: ['verifyListingWatchAction', "watcher.status !== 'PENDING_CONFIRMATION'", "status: 'ACTIVE'", "status: 'UNSUBSCRIBED'", 'reconciled?.status'],
  },
  {
    name: 'Production marketplace evidence uses named queries rather than positional attribution',
    file: 'scripts/capture-marketplace-audit.mjs',
    required: ['const querySpecs = {', 'Object.entries(querySpecs)', 'Object.fromEntries', 'newBalloonProposals:', 'listingWatchers:', 'aerotrade-marketplace-audit-v2-read-only'],
    forbidden: ['const [\n  users,'],
  },
  {
    name: 'Catalog search gaps are private, deduplicated and PII-minimized',
    file: 'supabase/migrations/20260829170000_catalog_search_demand.sql',
    required: ['catalog_search_events', 'event_key text not null unique', 'catalog_search_zero_result_consistency', 'enable row level security', 'revoke all on public.catalog_search_events from anon, authenticated', 'no raw visitor identifier'],
  },
  {
    name: 'Catalog search instrumentation cannot block browsing',
    file: 'src/app/catalog/CatalogSearchTracker.tsx',
    required: ['sessionStorage', 'logCatalogSearch(search, getBrowserCommercialContext())', 'Analytics cannot block catalog browsing'],
  },
  {
    name: 'Transactional SEO publishes only public listings and truthful offers',
    file: 'src/utils/marketplace-seo.mjs',
    required: ['isListingPubliclyIndexable', "listing.status === 'ACTIVE_PUBLIC'", "listing.status !== 'ACTIVE_PREMIUM'", 'price <= 0', 'buildListingProductJsonLd', 'buildNewBalloonServiceJsonLd', ".replace(/</g, '\\\\u003c')"],
  },
  {
    name: 'The sitemap excludes private Premium inventory and includes listing images',
    file: 'src/app/sitemap.ts',
    required: ["export const dynamic = 'force-dynamic'", 'isListingPubliclyIndexable', '.filter((listing) => isListingPubliclyIndexable(listing))', 'images: (listing.images || [])'],
    forbidden: ["'/login'", "'/signup'"],
  },
  {
    name: 'Public URL discovery is scheduled, deduplicated and auditable without retaining URL lists',
    file: 'src/app/api/cron/indexing/route.ts',
    required: ['buildPublicIndexingUrls', 'buildIndexNowSubmission', "from('indexing_submission_receipts')", "status: accepted ? 'ACCEPTED' : 'FAILED'", 'Provider result could not be persisted', 'Retry limit reached'],
  },
  {
    name: 'Indexing receipts are private aggregate evidence',
    file: 'supabase/migrations/20260829300000_indexing_submission_receipts.sql',
    required: ['batch_key text not null unique', 'url_fingerprint text not null', 'url_count integer not null', 'enable row level security', 'revoke all on public.indexing_submission_receipts from anon, authenticated', 'stores no URL list, query, credential or personal data'],
    forbidden: ['url_list', 'search_query', 'credential text'],
  },
  {
    name: 'High-intent catalog categories use clean canonical landing pages',
    file: 'src/app/catalog/category/[category]/page.tsx',
    required: ['getCatalogCategory', 'getPublicCategoryInventory', 'isListingPubliclyIndexable', 'alternates: { canonical:', 'publicInventory > 0', '<CatalogExperience'],
  },
  {
    name: 'Manufacturer acquisition pages exist only for a closed inventory-backed set',
    file: 'src/app/catalog/manufacturer/[manufacturer]/page.tsx',
    required: ['getCatalogManufacturer', 'getPublicManufacturerInventory', 'minimumManufacturerInventoryForIndexing', 'isListingPubliclyIndexable', 'robots:', '<CatalogExperience'],
  },
  {
    name: 'Country acquisition pages exist only for a closed inventory-backed set',
    file: 'src/utils/catalog-countries.mjs',
    required: ['minimumCountryInventoryForIndexing = 2', 'getCatalogCountriesWithInventory', 'listingMatchesCatalogCountry', '/catalog/country/'],
  },
  {
    name: 'Country discovery is linked, measured and falls back to real commercial alternatives',
    file: 'src/app/catalog/page.tsx',
    required: ['Browse real inventory by location:', 'getCatalogCountryPath', 'fixedCountry', 'CatalogSearchTracker', 'Get a new-balloon estimate'],
  },
  {
    name: 'Manufacturer discovery is linked, measured and falls back to real commercial alternatives',
    file: 'src/app/catalog/page.tsx',
    required: ['publicManufacturerLinks', 'Browse real inventory by manufacturer:', 'fixedManufacturer', 'listingMatchesCatalogManufacturer', 'Get a new-balloon estimate'],
  },
  {
    name: 'Seller activation funnel is private and evidence-based',
    file: 'supabase/migrations/20260829180000_seller_activation_funnel.sql',
    required: ['seller_funnel_events', 'event_key text not null unique', 'CHECKOUT_RESUMED', 'seller_funnel_listing_stage_consistency', 'enable row level security', 'revoke all on public.seller_funnel_events from anon, authenticated', 'No password, payment data, free text, IP address or browser identifier'],
  },
  {
    name: 'Seller intent measurement is authenticated and non-blocking',
    file: 'src/components/SellForm.tsx',
    required: ["recordSellerFunnelStage('SELL_PAGE_VIEWED', sellerEntryContext)", "recordSellerFunnelStage('FORM_STARTED', sellerEntryContext)", 'formStartedRecorded', 'onChangeCapture'],
  },
  {
    name: 'Late seller authentication preserves intent before the long form is exposed',
    file: 'src/app/sell/page.tsx',
    required: ['if (!user)', 'Start without losing your work', 'redirectTo=', 'Record a private sale request', '<SellForm'],
  },
  {
    name: 'Seller acquisition source is a closed non-free-text dimension',
    file: 'src/utils/seller-acquisition.mjs',
    required: ['sellerAcquisitionSources', "'seller_seo'", "'catalog_empty'", "'assisted_conversion'", ': fallback'],
  },
  {
    name: 'Seller acquisition context remains private and migration-bounded',
    file: 'supabase/migrations/20260829360000_seller_acquisition_context.sql',
    required: ['entry_context text not null default', 'seller_funnel_events_entry_context_check', "alter column source_context set default 'direct'", 'seller_assistance_requests_source_context_check', 'no URL or campaign free text'],
  },
  {
    name: 'Missing used inventory always offers assisted sourcing or a new-balloon estimate',
    file: 'src/app/catalog/page.tsx',
    required: ['Tell us what you need', 'Get a new-balloon estimate', 'Ask us to find a used option', 'Get an approximate new-balloon budget', 'newBalloonHref'],
  },
  {
    name: 'Unready sellers have one private assisted path into the normal listing workflow',
    file: 'supabase/migrations/20260829310000_seller_assistance_requests.sql',
    required: ['seller_assistance_requests', 'privacy_consent_at', 'seller_assistance_closed_state', 'seller_assistance_listed_link', 'seller_assistance_admin_followup', 'enable row level security', 'revoke all on public.seller_assistance_requests from anon, authenticated', 'never published'],
  },
  {
    name: 'Assisted seller intake stores before notifying and remains abuse controlled',
    file: 'src/app/sell/assisted/actions.ts',
    required: ['parseSellerAssistanceRequest', 'createSellerAssistanceSubmissionKey', "from('seller_assistance_requests')", 'duplicateCutoff', 'rateCutoff', 'privacy_consent_at', 'seller_assistance_created_admin', 'was stored but its admin notification needs review'],
  },
  {
    name: 'Existing adverts enter assisted sale only as safe private transfer references',
    file: 'supabase/migrations/20260829400000_assisted_listing_transfer.sql',
    required: ['existing_listing_url text', "existing_listing_url ~* '^https?://'", 'never fetched or published automatically'],
  },
  {
    name: 'Listing distribution creates measurable channel links without automatic messaging',
    file: 'src/components/ListingShare.tsx',
    required: ["source = 'listing_share'", "urlFor('whatsapp')", "urlFor('email')", "urlFor('copy')", 'navigator.share', 'navigator.clipboard.writeText'],
    forbidden: ['sendEmail(', 'fetch(', 'SUPABASE_SERVICE_ROLE_KEY'],
  },
  {
    name: 'Assisted seller conversion must link to a matching normal listing',
    file: 'src/app/admin/actions.ts',
    required: ['updateSellerAssistanceStatus', "status === 'LISTED'", 'The selected listing does not match this seller', 'Could not persist and verify assisted-sale status'],
  },
  {
    name: 'Interrupted Premium listing checkout is safely resumable',
    file: 'src/app/dashboard/actions.ts',
    required: ["listing.status !== 'PENDING_PAYMENT'", "getStoredListingPlan(listing.details) !== 'premium'", "stage: 'CHECKOUT_RESUMED'", 'createPremiumListingCheckout', "eq('seller_id', user.id)"],
  },
  {
    name: 'Premium listing payment closes the seller activation loop',
    file: 'src/app/api/webhooks/stripe/route.ts',
    required: ["stage: 'PAYMENT_CONFIRMED'", "stage: 'LISTING_PUBLISHED'", "source: 'stripe'", 'persistSellerFunnelEvent'],
  },
  {
    name: 'Listing trust badges have an explicit non-airworthiness boundary',
    file: 'supabase/migrations/20260829110000_listing_verification.sql',
    required: ['listing_verifications', 'supporting_documents_checked', 'This is not an airworthiness inspection.', 'enable row level security'],
  },
  {
    name: 'Listing availability evidence is owner-authenticated, dated and immutable to clients',
    file: 'supabase/migrations/20260829450000_listing_availability_confirmations.sql',
    required: ['confirm_listing_availability', 'v_listing.seller_id <> v_user_id', "v_listing.status not in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')", 'unique (listing_id, confirmed_on)', 'revoke insert, update, delete', 'grant execute'],
  },
  {
    name: 'Availability confirmation requires database readback and cannot change listing state',
    file: 'src/app/dashboard/actions.ts',
    required: ["rpc('confirm_listing_availability'", "from('listing_availability_confirmations')", 'Availability confirmation was not verified by readback'],
    forbidden: ["status: 'ACTIVE_PUBLIC'", "status: 'ACTIVE_PREMIUM'"],
  },
  {
    name: 'Public availability trust appears only inside the bounded freshness window',
    file: 'src/app/catalog/[id]/page.tsx',
    required: ['getListingAvailabilityState', 'availabilityConfirmation.publiclyFresh', 'Seller confirmed availability on'],
  },
  {
    name: 'Availability requests are manual, transactional and one-per-confirmation-cycle',
    file: 'src/app/admin/actions.ts',
    required: ['requestListingAvailabilityConfirmation', 'listingAvailabilityRequestIdempotencyKey', "notificationType: 'listing_availability_request'", 'This request does not change the advert'],
  },
  {
    name: 'Listing verification decisions store only closed evidence categories and atomic audit events',
    file: 'supabase/migrations/20260829280000_listing_verification_workflow.sql',
    required: ['listing_verification_events', 'request_listing_verification', 'decide_listing_verification', 'for update', "grant execute on function public.request_listing_verification", 'stores no document copy'],
    forbidden: ['document_url', 'document_number', 'identity_document_url'],
  },
  {
    name: 'Seller verification requests require ownership, publish readiness and readback',
    file: 'src/app/dashboard/actions.ts',
    required: ['requestListingVerification', "eq('seller_id', user.id)", 'supporting_documents_available', 'assertStoredListingRequiredFields', 'assertListingHasReachableImage', "admin.rpc('request_listing_verification'", 'Verification request was not confirmed by readback', 'listing-verification-request-${result.event_id}'],
  },
  {
    name: 'Admin can decide only queued listing reviews with bounded evidence and readback',
    file: 'src/app/admin/actions.ts',
    required: ['parseListingVerificationDecision', "current.status !== 'IN_REVIEW'", "supabase.rpc('decide_listing_verification'", 'Verification decision was not confirmed by readback', 'listing-verification-decision-${result.event_id}', 'does not certify ownership, legal title, airworthiness or physical condition'],
    forbidden: [".upsert({\n      listing_id: listingId,\n      status"],
  },
  {
    name: 'Commercial events are daily-deduplicated without raw visitor ids',
    file: 'supabase/migrations/20260829120000_deduplicate_commercial_events.sql',
    required: ['event_key text', 'listing_events_event_key_unique', 'referrer_host', 'utm_source'],
  },
  {
    name: 'Buyer journeys connect acquisition to all conversion paths without a raw identifier',
    file: 'supabase/migrations/20260829290000_commercial_journey_attribution.sql',
    required: ['listing_events_journey_idx', 'catalog_search_events_journey_idx', 'marketplace_inquiries_journey_idx', 'wanted_requests_journey_idx', 'quote_requests_journey_idx', 'Daily server-HMAC journey key', 'contains no raw visitor or user identifier'],
    forbidden: ['visitor_id', 'ip_address', 'full_referrer'],
  },
  {
    name: 'New-balloon alternatives preserve marketplace demand and source context',
    file: 'src/app/new-balloon/page.tsx',
    required: ['normalizeNewBalloonDemandContext', 'normalizeNewBalloonManufacturerPreference', 'We carried your marketplace search into this request.', '<CommercialAttributionFields />', 'Request an indicative budget', '/new-balloon/pasha', '/new-balloon/schroeder'],
  },
  {
    name: 'Pasha and Schroeder acquisition paths stay non-binding and manufacturer-specific',
    file: 'src/components/NewBalloonManufacturerLanding.tsx',
    required: ['manufacturer.slug', 'Request a {manufacturer.shortName} budget', 'Any initial range is non-binding.', 'before any binding factory order or payment'],
    forbidden: ['utm_source=aerotrade', 'utm_medium=organic', 'utm_campaign=new_balloon'],
  },
  {
    name: 'New-balloon manufacturer funnel reaches proposal, outcome and settled revenue evidence',
    file: 'src/utils/new-balloon-manufacturers.mjs',
    required: ['preferredRequests', 'acceptedProposals', 'wonOutcomes', 'settledRevenueMinorByCurrency', "outcome.entity_type !== 'quote_request'", "outcome.evidence_level !== 'settled'"],
  },
  {
    name: 'Listing submissions are validated again on the server',
    file: 'src/utils/listing-submission.mjs',
    required: ['listingCategories', 'listingConditions', 'listingCurrencies', 'seller_declaration', 'supporting_documents_available', 'Serial number', 'normalizeListingCountry', 'assertStoredListingRequiredFields', 'MISSING_SERIAL'],
  },
  {
    name: 'Listing countries converge without guessing unknown locations',
    file: 'src/utils/listing-country.mjs',
    required: ['normalizeListingCountry', "['spain', 'Spain']", "['prague, czech republic', 'Czech Republic']", 'return countryAliases.get'],
  },
  {
    name: 'Broken-image quarantine requires two definitive checks and is private',
    file: 'supabase/migrations/20260829230000_listing_quality_quarantine.sql',
    required: ['listing_quality_state', "status in ('HEALTHY', 'SUSPECT', 'QUARANTINED', 'RESOLVED')", 'consecutive_failures integer not null', 'enable row level security', 'revoke all on public.listing_quality_state from anon, authenticated', 'listing_quality_quarantine'],
  },
  {
    name: 'Catalog quality checks fail safely and notify only after persisted quarantine',
    file: 'src/app/api/cron/catalog-quality/route.ts',
    required: ['getListingQualityTransition', "transition === 'QUARANTINE'", ".update({ status: 'DRAFT' })", 'Broken listing was not safely paused', 'notifyQuarantinedSeller', 'commercial_notification_receipts'],
  },
  {
    name: 'Buyer acknowledgements and opportunity follow-ups have durable private receipts',
    file: 'supabase/migrations/20260829240000_opportunity_followup_notifications.sql',
    required: ['inquiry_buyer_ack', 'inquiry_seller_followup', 'quote_admin_followup', "entity_type in ('listing', 'quote_request', 'wanted_request', 'inquiry')", "recipient_role in ('admin', 'seller', 'buyer')"],
  },
  {
    name: 'Open commercial opportunities receive one evidence-backed operational follow-up',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ['getOpportunityFollowupCutoff', 'openInquiryStatuses', 'sendCommercialReceiptEmail', 'inquiry-seller-followup-', 'quote-admin-followup-', 'premium-listing-checkout-recovery-', 'new-balloon-buyer-ack-', 'dueNewBalloonBuyerAcknowledgementRetries', 'single operational reminder'],
  },
  {
    name: 'Abandoned Premium listing checkout receives one non-destructive recovery path',
    file: 'supabase/migrations/20260829250000_premium_listing_checkout_recovery.sql',
    required: ['premium_listing_checkout_recovery', 'CHECKOUT_RECOVERY_SENT', 'stores no message body, email address', 'seller_funnel_listing_stage_consistency'],
  },
  {
    name: 'Listing publication requires a reachable image from trusted storage',
    file: 'src/utils/listing-image-quality-server.ts',
    required: ['getAllowedListingImageHosts', 'assertListingImageUrlsReachable', 'assertListingHasReachableImage', 'markListingQualityResolved'],
  },
  {
    name: 'Admin has one evidence-based commercial pipeline',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['Commercial Pipeline', 'Open opportunities', 'Won outcomes', 'Revenue evidence', 'This is not net revenue.', 'Buyer demand without a listing', 'listingMatchesWantedRequest'],
  },
  {
    name: 'New-balloon quotes fail closed unless the lead is durably stored',
    file: 'src/app/new-balloon/actions.ts',
    required: ['parseNewBalloonQuoteRequest', 'newBalloonQuoteSubmissionKey', "kind: 'duplicate'", "kind: 'rate_limited'", 'privacy_consent_at', "select('id')", 'Quote request readback did not return an id', 'aerotrade-quote-${requestId}'],
  },
  {
    name: 'New-balloon demand context is bounded, consented and abuse-controlled',
    file: 'src/utils/new-balloon-request.mjs',
    required: ['allowedEquipmentTypes', 'unsafeDemandPattern', 'privacy_consent', 'normalizeNewBalloonDemandContext', 'newBalloonQuoteSubmissionKey', "createHmac('sha256'"],
  },
  {
    name: 'New-balloon request integrity is private and stores no raw network identifiers',
    file: 'supabase/migrations/20260829260000_new_balloon_quote_integrity.sql',
    required: ['privacy_consent_at', 'submission_key text', 'quote_requests_submission_rate_idx', 'revoke all on public.quote_requests from anon, authenticated', 'never stores an IP address'],
  },
  {
    name: 'New-balloon buying is visible and source-attributed without raw URLs',
    file: 'supabase/migrations/20260829190000_new_balloon_lead_source.sql',
    required: ['source_context text not null default', 'quote_requests_source_context_check', 'contains no URL, identifier or personal data'],
  },
  {
    name: 'Listing detail image stays bounded on mobile',
    file: 'src/app/catalog/[id]/page.tsx',
    required: ['Number(b.is_primary) - Number(a.is_primary)', 'aspect-[4/3]', 'sm:h-[min(72vh,620px)]', 'object-contain'],
  },
  {
    name: 'Broken listing images fail visibly and production audit checks real files',
    file: 'src/components/SafeListingImage.tsx',
    required: ['onError={() => setFailed(true)}', 'Image temporarily unavailable', 'image unavailable'],
  },
  {
    name: 'Production audit distinguishes image rows from reachable files',
    file: 'scripts/capture-marketplace-audit.mjs',
    required: ["method: 'HEAD'", 'activeListingsWithNoReachableImage', 'inaccessibleActiveImageFiles', 'imageChecksUnknown'],
  },
  {
    name: 'Anonymous mobile navigation avoids horizontal overflow',
    file: 'src/components/Navbar.tsx',
    required: ['hidden sm:inline text-sm font-medium', 'space-x-2 sm:space-x-4', 'px-2 sm:px-4 py-2'],
  },
  {
    name: 'Newsletter has one documented bi-weekly production schedule',
    file: '.github/workflows/newsletter.yml',
    required: ["cron: '0 9 1,16 * *'", 'production-newsletter', 'dry_run', '.failedCount // .run.failed_count // 0', 'automatic retry remains blocked'],
    forbidden: ['--retry-all-errors', '--retry 3'],
  },
  {
    name: 'Duplicate newsletter runs preserve partial failure semantics',
    file: 'src/app/api/cron/newsletter/route.ts',
    required: ['duplicateNewsletterRunResult', 'duplicateResult.success ? 200 : 409'],
  },
  {
    name: 'Email delivery fails closed and tracks partial provider acceptance',
    file: 'src/utils/resend.ts',
    required: ['createMissingEmailProviderResult', 'reconcileEmailProviderDeliveries', 'success: failedCount === 0', 'newsletterBatchIdempotencyKey', 'idempotencyKey'],
    forbidden: ['mocked: true'],
  },
  {
    name: 'Newsletter recovery is manual, failed-only and environment approved',
    file: '.github/workflows/newsletter-recovery.yml',
    required: ['workflow_dispatch', 'production-newsletter', 'recover_failed_only', 'expectedContentSha256', '.sentCount == $expected and .failedCount == 0 and .contentSha256 == $expectedSha'],
    forbidden: ['schedule:', '--retry-all-errors', '--retry 3'],
  },
  {
    name: 'Newsletter recovery dry-run cannot mutate stale recovery state',
    file: 'src/app/api/cron/newsletter/route.ts',
    required: ['shouldReconcileStaleRecoveries(parsed.request.dryRun)', "select('id, status, dry_run, test_email, sent_count, failed_count, subject, html_body, content_sha256')", 'Recovery plan verified; no email or database mutation was performed.'],
  },
  {
    name: 'Newsletter recovery requires immutable content and a durable recipient ledger',
    file: 'supabase/migrations/20260801160000_newsletter_selective_recovery.sql',
    required: ['content_sha256', 'provider_dispatch_started_at', 'audit_uncertain', 'newsletter_recovery_runs', 'newsletter_recovery_recipients', "status in ('running', 'sent', 'partial', 'failed', 'audit_uncertain', 'abandoned')"],
  },
  {
    name: 'Partial email runs block unsafe automatic retries',
    file: 'supabase/migrations/20260731170000_track_partial_email_delivery.sql',
    required: ["status in ('running', 'sent', 'partial')", "status in ('running', 'sent', 'partial', 'failed', 'skipped')"],
  },
  {
    name: 'Social scheduler uses the protected unified endpoint',
    file: 'netlify/functions/social-scheduled.mjs',
    required: ['CRON_SECRET', '/api/cron/social?limit=1'],
  },
  {
    name: 'Social publishing classifies provider failures and exposes credential preflight',
    file: 'src/app/api/cron/instagram/route.ts',
    required: ['classifyMetaError', 'getMetaCredentialHealth', 'providerCheck', 'status: failures.length > 0 ? 502 : 200'],
  },
  {
    name: 'Meta credential fallback cannot repeat timed-out publications',
    file: 'src/utils/meta-social.ts',
    required: ['shouldTryNextMetaCredential', 'if (!shouldTryNextMetaCredential(error))'],
  },
  {
    name: 'Public contact uses the configured real support address',
    file: 'src/utils/site.ts',
    required: ['NEXT_PUBLIC_SUPPORT_EMAIL', 'support@aerotrade.app'],
    forbidden: ['aerotrade.example.com'],
  },
]

for (const check of checks) {
  const contents = read(check.file)
  for (const expected of check.required) {
    assert.ok(contents.includes(expected), `${check.name}: missing "${expected}" in ${check.file}`)
  }
  for (const forbidden of check.forbidden || []) {
    assert.ok(!contents.includes(forbidden), `${check.name}: found forbidden "${forbidden}" in ${check.file}`)
  }
  console.log(`OK - ${check.name}`)
}

const sourceFiles = [
  'src/app/login/actions.ts',
  'src/app/pricing/actions.ts',
  'src/app/sell/actions.ts',
  'src/app/catalog/[id]/actions.ts',
  'src/app/dashboard/actions.ts',
]

for (const file of sourceFiles) {
  assert.ok(
    !read(file).includes("headersList.get('origin') ||"),
    `${file} trusts the request Origin header directly`,
  )
}

console.log(`OK - ${checks.length + 1} operational contracts verified`)
