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
    name: 'Netlify production builds require one explicit release marker',
    file: 'scripts/netlify-ignore-build.mjs',
    required: ['CACHED_COMMIT_REF', 'COMMIT_REF', "spawnSync('git', ['diff', '--name-only'", "netlifyProductionReleaseMarker = 'release/netlify-production.json'", '!shouldRunNetlifyBuild(files)', 'production release marker is unchanged', 'explicit production release marker changed', 'process.exit(0)', 'process.exit(1)'],
  },
  {
    name: 'Netlify executes the reviewed build gate before consuming a build',
    file: 'netlify.toml',
    required: ['[build]', 'ignore = "node scripts/netlify-ignore-build.mjs"'],
  },
  {
    name: 'Netlify release gate is rehearsed against real Git ranges without external deployment',
    file: 'scripts/rehearse-netlify-release-gate.mjs',
    required: ['merge-base', 'release/netlify-production.json', 'Candidate should request exactly one Netlify build', 'A later evidence-only commit should not create another Netlify build', 'productionAccessed: false', 'netlifyApiAccessed: false', 'netlifyDeploysCreated: 0', 'rmSync(tempRoot'],
    forbidden: ["'deploy'", 'netlify api', 'NETLIFY_AUTH_TOKEN'],
  },
  {
    name: 'Production promotion is fast-forward, marker-bound and explicit',
    file: 'scripts/lib/production-release.mjs',
    required: ['fast-forward descendant of production', 'productionBaseCommit', 'expectedProductionDeploys', 'requiresExplicitApproval', 'release/netlify-production.json', 'explicit production release marker changed'],
  },
  {
    name: 'Production branch movement requires an exact release approval and full local verification',
    file: 'scripts/promote-netlify-production.mjs',
    required: ['origin/production', 'origin/main', 'Worktree must be clean', 'CONFIRM_AEROTRADE_PRODUCTION_RELEASE', 'verify:production-release', 'refs/heads/production', 'ls-remote', 'netlifyDeploysRequested: 1'],
    forbidden: ['netlify deploy', 'netlify api', 'NETLIFY_AUTH_TOKEN'],
  },
  {
    name: 'Release operations are documented as one consolidated production deploy',
    file: 'docs/aerotrade-production-release.md',
    required: ['only from the remote `production` branch', 'pushing `main` must not create a production deploy', 'requests zero Netlify deploys', 'CONFIRM_AEROTRADE_PRODUCTION_RELEASE', 'one Git production event'],
  },
  {
    name: 'Database recovery rehearsal is disposable, local-only and checksum-bound',
    file: 'scripts/rehearse-database-recovery.mjs',
    required: [
      "manifest.kind, 'shared_public_schema_recovery_baseline'",
      "createHash('sha256')",
      'mkdtempSync(tempPrefix)',
      "'migration', 'repair'",
      "'--local'",
      'supabase_migrations.schema_migrations',
      'productionAccessed: false',
      'productionMutated: false',
      'rmSync(tempRoot, { recursive: true, force: true })',
    ],
    forbidden: ["'--linked'", "'db', 'push'", "'deploy'"],
  },
  {
    name: 'Database recovery baseline is declared schema-only and credential-free',
    file: 'supabase/recovery/manifest.json',
    required: [
      '"kind": "shared_public_schema_recovery_baseline"',
      '"containsTableRows": false',
      '"containsCredentials": false',
      '"sharedSchema": true',
      '"historicalMigrationsSatisfiedBySnapshot"',
      '"20260731170000"',
      '"baselineMigration": "20260829480000"',
      '"snapshotSha256": "185e3894973527e9d944e150c0c1005511d48d861e39e9db3606ea07ead02b5d"',
    ],
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
    name: 'Seller promotion checkout is single-live, seller-bound and private',
    file: 'supabase/migrations/20260831620000_paid_listing_checkout_traceability.sql',
    required: ['listing_checkout_intents', 'listing_checkout_intents_one_live_per_listing', "where status = 'STARTED'", 'v_listing.seller_id <> p_user_id', "v_listing.status not in ('DRAFT', 'PENDING_PAYMENT')", "v_listing.details->>'listing_plan'", 'revoke all', 'grant execute'],
  },
  {
    name: 'Seller promotion checkout preserves entity metadata and expires if audit registration fails',
    file: 'src/utils/listing-checkout.ts',
    required: ['payment_intent_data: { metadata }', 'client_reference_id: listingId', 'register_listing_checkout_intent', 'checkout.sessions.expire(session.id)', 'Seller Launch Promotion checkout could not be audited', "currentSession.status === 'open'", 'expireOpenStripeListingSessions', 'retireListingCheckoutBeforeFreePublication'],
  },
  {
    name: 'Concurrent listing checkout registration reuses the exact live provider session',
    file: 'supabase/migrations/20260831630000_idempotent_listing_checkout_registration.sql',
    required: ['for update', 'where stripe_session_id = p_stripe_session_id', "v_intent.status <> 'STARTED'", 'return v_intent', 'grant execute'],
  },
  {
    name: 'Paid seller fulfillment verifies lifecycle, delivery and durable completion',
    file: 'src/app/api/webhooks/stripe/route.ts',
    required: ['getStoredListingPlan(currentListing.details)', "['STARTED', 'COMPLETED']", 'Seller Launch Promotion confirmation was not accepted', 'Paid Premium alert is not fully fulfilled', "from('listing_checkout_intents')", 'Listing checkout completion readback failed'],
    forbidden: ['Failed to send premium listing alert after listing payment'],
  },
  {
    name: 'Premium alert dispatch is provider-idempotent and receipt-readback bound',
    file: 'src/utils/premium-alerts.ts',
    required: ['premium-alert/${listingId}', 'Premium alert recipient readback failed', 'Premium alert run result did not persist'],
  },
  {
    name: 'Newsletter gives unfulfilled paid promotions priority and rotates exposure',
    file: 'src/utils/newsletter-listing-rotation.mjs',
    required: ['inclusionCounts', '=== 0', 'countDifference', 'neverIncludedCount'],
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
    name: 'Buyer Early Access recovery selects only the latest buyer-initiated expired checkout',
    file: 'supabase/migrations/20260829520000_buyer_early_access_checkout_recovery.sql',
    required: ['due_buyer_early_access_checkout_recoveries', 'select distinct on (intent.user_id)', "latest.status = 'EXPIRED'", "latest.source in ('signup', 'pricing', 'dashboard')", 'users.is_premium = false', "receipt.status = 'accepted'", 'receipt.delivery_attempts >= 2', 'grant execute on function public.due_buyer_early_access_checkout_recoveries(timestamp with time zone) to service_role', 'no checkout or charge is created'],
  },
  {
    name: 'Buyer Early Access recovery is dry-run safe, bounded and never creates payment',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ["supabase.rpc('due_buyer_early_access_checkout_recoveries'", 'dueBuyerEarlyAccessCheckoutRecoveries', 'if (!commit) return NextResponse.json(result)', "notificationType: 'buyer_early_access_checkout_recovery'", "entityType: 'premium_checkout_intent'", 'This email creates no checkout and makes no charge.', 'You can ignore this message', 'buyer-early-access-checkout-recovery-${intent.intent_id}'],
    forbidden: ['stripe.checkout', 'checkout.sessions.create(', "from('payment_notification_receipts').insert"],
  },
  {
    name: 'Control Tower exposes Buyer Early Access recovery outcomes without PII',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['buyerEarlyAccessCheckoutRecoveries', 'acceptedBuyerEarlyAccessCheckoutRecoveries', 'failedBuyerEarlyAccessCheckoutRecoveries', 'exhaustedBuyerEarlyAccessCheckoutRecoveries', 'Buyer Early Access checkout recovery:'],
  },
  {
    name: 'Control Tower distinguishes current Stripe entitlements from historical receipt coverage',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['is_premium,premium_source,stripe_subscription_id', 'stripePremiumEntitlements', 'stripePremiumEntitlementsWithSubscription', 'Historical entitlements may predate the receipt and checkout-intent ledgers and are not treated as new revenue.'],
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
    name: 'Mobile buyers retain a visible tracked enquiry action without obscuring the form',
    file: 'src/app/catalog/[id]/MobileBuyerAction.tsx',
    required: ['IntersectionObserver', 'formVisible', 'BuyerIntentLink', '#buyer-enquiry', 'no account required'],
  },
  {
    name: 'Buyer conversion rates exclude incompatible pre-instrumentation traffic',
    file: 'src/utils/buyer-funnel.mjs',
    required: ['buyerFunnelMeasurementStartedAt', 'comparableFrom', 'excludedEarlierEvents', 'viewToCta', 'formStartToStoredInquiry'],
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
    required: ['sellerDeliveryAccepted', 'seller email has not yet been confirmed as delivered', "will not claim that the seller received it", 'private enquiry status and negotiation history', 'This private link expires after 90 days.', 'does not reserve the equipment or form a sale contract', 'escapeHtml'],
  },
  {
    name: 'Seller responses issue a buyer capability without weakening delivery evidence',
    file: 'src/app/dashboard/actions.ts',
    required: ['signInquiryBuyerCapability', 'signInquiryBuyerPortalCapability', 'capabilityExpiresAt', 'buildSellerResponseBuyerNotification', 'inquiry_buyer_seller_response'],
  },
  {
    name: 'Negotiation message builders preserve private links and non-binding boundaries',
    file: 'src/utils/inquiry-negotiation-notifications.mjs',
    required: ['Respond securely through AeroTrade', 'This private link expires after 30 days.', 'Open the complete private enquiry history', 'This status link expires after 90 days.', 'invitations to negotiate only', 'does not reserve equipment, execute payment or form a sale contract', 'parseNegotiationNotificationEventId'],
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
    name: 'Unit-economics input is complete, evidence-consistent and never infers missing costs',
    file: 'src/utils/commercial-economics.mjs',
    required: ['parseCommercialEconomics', 'commercialContributionMinor', 'return null', "evidenceLevel === 'reported'", "evidenceLevel === 'documented'", "evidenceLevel === 'settled'", "'stripe_balance_transaction', 'bank_statement'"],
  },
  {
    name: 'Unit economics extend outcomes atomically with immutable evidence and negative-margin support',
    file: 'supabase/migrations/20260829500000_commercial_unit_economics.sql',
    required: ['contribution_margin_minor bigint generated always as', 'commercial_unit_economics_events', 'extensions.uuid_generate_v4()', 'record_commercial_unit_economics', 'for update', 'Unit economics evidence cannot be downgraded', 'prevent_untracked_economics_basis_change', 'direct_cost_minor is null', 'grant execute on function public.record_commercial_unit_economics', 'enable row level security', 'revoke all on public.commercial_unit_economics_events from anon, authenticated'],
    forbidden: ['contribution_margin_minor bigint not null check (contribution_margin_minor >= 0)'],
  },
  {
    name: 'Control Tower records and verifies complete unit economics without treating unknown costs as zero',
    file: 'src/app/admin/actions.ts',
    required: ['recordCommercialUnitEconomics', 'parseCommercialEconomics', "rpc('record_commercial_unit_economics'", "from('commercial_unit_economics_events')", 'Could not persist and verify unit economics', 'The unit-economics audit event was not confirmed by readback'],
  },
  {
    name: 'Commercial reporting separates missing, evidenced and settled contribution',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['outcomesMissingEconomics', 'evidencedContributionByCurrency', 'settledContributionByCurrency', 'Missing costs remain unmeasured and are never converted to zero.', 'Contribution may legitimately be negative.', 'CommercialEconomicsEditor'],
  },
  {
    name: 'Listing closure is atomic, owner-authorized and cannot invent revenue',
    file: 'supabase/migrations/20260829470000_listing_lifecycle_closure.sql',
    required: ['listing_lifecycle_events', 'listing_id uuid not null references public.listings(id) on delete restrict unique', 'close_listing_by_actor', 'for update', "v_listing.seller_id <> v_actor and not v_is_admin", "event_type in ('SOLD', 'WITHDRAWN')", "sale_channel in ('AEROTRADE', 'OTHER_CHANNEL', 'NOT_DISCLOSED')", 'A seller report never creates revenue or changes an enquiry outcome.'],
    forbidden: ['insert into public.commercial_outcomes', 'update public.marketplace_inquiries', 'payment_intent'],
  },
  {
    name: 'Seller listing closure validates intent and verifies the immutable write',
    file: 'src/app/dashboard/actions.ts',
    required: ['closeListingBySeller', 'parseListingClosure', "rpc('close_listing_by_actor'", "from('listing_lifecycle_events')", 'Listing closure was not verified by readback'],
    forbidden: ["update({ status: 'SOLD' })"],
  },
  {
    name: 'Seller listing closure UI makes the AeroTrade evidence choice explicit',
    file: 'src/app/dashboard/SellerListingClosureForm.tsx',
    required: ["saleChannel === 'AEROTRADE'", 'Which AeroTrade enquiry led to the sale?', 'This records your report for review.', 'window.confirm', 'router.refresh()'],
  },
  {
    name: 'Administrative sold actions use the same audited lifecycle boundary',
    file: 'src/app/admin/actions.ts',
    required: ['markListingSold', "sessionSupabase.rpc('close_listing_by_actor'", "p_sale_channel: 'NOT_DISCLOSED'", 'Administrative listing closure was not verified by readback'],
  },
  {
    name: 'Undisclosed sale clarification is append-only, admin-only and cannot invent revenue or reopen inventory',
    file: 'supabase/migrations/20260831700000_listing_sale_clarification.sql',
    required: ['listing_sale_clarifications', 'extensions.uuid_generate_v4()', 'lifecycle_event_id uuid not null unique', "actor_role text not null check (actor_role = 'ADMIN')", "sale_channel text not null check (sale_channel in ('AEROTRADE', 'OTHER_CHANNEL'))", 'prevent_listing_sale_clarification_mutation', 'Listing sale clarifications are append-only', 'clarify_listing_sale_by_admin', 'for update', "v_event.sale_channel <> 'NOT_DISCLOSED'", "status <> 'SPAM'", 'An AeroTrade clarification requires a matching non-spam enquiry', 'never creates a commercial outcome or revenue'],
    forbidden: ['insert into public.commercial_outcomes', 'update public.listings set', 'update public.listing_lifecycle_events'],
  },
  {
    name: 'Administrative sale clarification verifies the append-only record and unchanged closure',
    file: 'src/app/admin/actions.ts',
    required: ['clarifyListingSale', 'parseListingSaleClarification', "rpc('clarify_listing_sale_by_admin'", "from('listing_sale_clarifications')", "original?.sale_channel !== 'NOT_DISCLOSED'", "listingReadback?.status !== 'SOLD'", 'Sale clarification was not verified by readback'],
    forbidden: ["update({ sale_channel: clarification.sale_channel", "update({ status: 'SOLD' })"],
  },
  {
    name: 'Control Tower applies clarified attribution without obscuring the immutable original',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['effectiveLifecycleEvents', 'clarificationByLifecycleEvent', 'Clarify sale channel', 'The original closure remains unchanged.', 'It does not create revenue, a commercial outcome or reopen the listing.', 'Store immutable clarification'],
  },
  {
    name: 'Control Tower turns seller sale reports into review, never automatic revenue',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['pendingReportedSaleReview', 'closureSuggestionByInquiry', 'Review seller-reported AeroTrade sale', 'These fields are only a review aid: verify them before saving.', 'AeroTrade revenue remains 0 until you enter supported evidence.'],
    forbidden: ['aerotrade_revenue_minor: event.gross_amount_minor'],
  },
  {
    name: 'New-balloon requests can become traceable operator-priced proposals',
    file: 'supabase/migrations/20260829340000_new_balloon_proposals.sql',
    required: ['new_balloon_quote_proposals', 'proposal_fingerprint text not null unique', 'accept_new_balloon_proposal_delivery', "status='QUOTE_SENT'", 'new_balloon_proposal_buyer', 'enable row level security', 'revoke all on public.new_balloon_quote_proposals from anon, authenticated'],
  },
  {
    name: 'New-balloon proposal stores before sending and advances only after provider acceptance',
    file: 'src/app/admin/actions.ts',
    required: ['sendNewBalloonProposal', 'parseNewBalloonProposal', "from('new_balloon_quote_proposals').insert", 'new_balloon_proposal_buyer', "rpc('accept_new_balloon_proposal_delivery'", 'Provider accepted the proposal, but its commercial transition was not verified', 'signNewBalloonProposalCapability', '/new-balloon/proposal', 'buildNewBalloonProposalBuyerNotification'],
  },
  {
    name: 'Failed new-balloon proposal deliveries recover without resending stale commercial state',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ['dueNewBalloonProposalDeliveryRetries', 'newBalloonProposalDeliveriesSuperseded', 'latestNewBalloonProposalByQuote', 'getNewBalloonProposalDeliveryRecoveryDecision', 'signNewBalloonProposalCapability', 'buildNewBalloonProposalBuyerNotification', "rpc('accept_new_balloon_proposal_delivery'", 'Recovered proposal delivery transition was not verified'],
  },
  {
    name: 'Provider-accepted proposal delivery is reconcilable by service role without reopening closed work',
    file: 'supabase/migrations/20260831640000_new_balloon_proposal_delivery_recovery.sql',
    required: ["auth.jwt() ->> 'role'", "grant execute on function public.accept_new_balloon_proposal_delivery(uuid,text) to authenticated, service_role", "status not in ('WON', 'LOST')", 'records provider-confirmed proposal delivery'],
  },
  {
    name: 'New-balloon buyer responses are immutable, idempotent and non-binding',
    file: 'supabase/migrations/20260829510000_new_balloon_proposal_responses.sql',
    required: ['new_balloon_proposal_response_events', 'extensions.uuid_generate_v4()', "response_type in ('INTERESTED', 'QUESTION', 'DECLINED')", 'proposal_id uuid not null unique', 'record_new_balloon_proposal_response', 'A different response is already recorded', 'grant execute on function public.record_new_balloon_proposal_response(uuid,text,text,text) to service_role', "set status = 'BUYER_RESPONDED'", 'commercial closure remains administrator-only', 'never creates an order, reservation, payment or contract'],
    forbidden: ["set status = 'WON'", "set status = 'LOST'", 'insert into public.commercial_outcomes'],
  },
  {
    name: 'New-balloon response capability binds proposal, quote, buyer and expiry',
    file: 'src/utils/new-balloon-proposal-capability.mjs',
    required: ['new-balloon-proposal-response|v1', 'proposalId', 'quoteRequestId', 'buyerEmail', 'expiresAt', 'timingSafeEqual', 'maximumFutureLifetimeMs'],
  },
  {
    name: 'Public new-balloon response action re-reads trusted data and verifies persistence',
    file: 'src/app/new-balloon/proposal/actions.ts',
    required: ['verifyNewBalloonProposalCapability', 'parseNewBalloonProposalResponse', "rpc('record_new_balloon_proposal_response'", "from('new_balloon_proposal_response_events')", "quoteReadback?.status !== 'BUYER_RESPONDED'", 'Your response was processed, but AeroTrade could not verify its complete state.', 'new_balloon_proposal_response_admin'],
    forbidden: ['quote.email =', 'commercial_outcomes', 'payment_intent'],
  },
  {
    name: 'Failed new-balloon response notifications recover from immutable response evidence',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ['dueNewBalloonResponseAdminNotificationRetries', 'parseNewBalloonProposalResponseNotificationEventId', 'getNewBalloonResponseNotificationRecoveryDecision', 'buildNewBalloonProposalResponseAdminNotification', 'newBalloonResponseNotificationsSuperseded', 'New-balloon response notification retry readback failed'],
  },
  {
    name: 'Private proposal response page is non-indexable and makes the legal boundary explicit',
    file: 'src/app/new-balloon/proposal/page.tsx',
    required: ["robots: { index: false, follow: false, noarchive: true }", "referrer: 'no-referrer'", 'verifyNewBalloonProposalCapability', 'not a binding factory quotation, reservation, order or sale contract'],
  },
  {
    name: 'Stored new-balloon requests acknowledge the buyer independently with durable evidence',
    file: 'src/app/new-balloon/actions.ts',
    required: ['sendCommercialReceiptEmail', 'buildNewBalloonBuyerAcknowledgement', "notificationType: 'new_balloon_buyer_ack'", "recipientRole: 'buyer'", 'new-balloon-buyer-ack-${requestId}', 'buyer acknowledgement could not be completed'],
  },
  {
    name: 'New-balloon buyer responses receive one bounded operational follow-up',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: [".eq('status', 'BUYER_RESPONDED')", 'dueNewBalloonProposalResponses', 'new_balloon_proposal_response_followup', 'new-balloon-proposal-response-followup-${quote.id}', 'does not create an order, reservation, payment or contract'],
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
    name: 'Wanted buyers receive one durable transactional acknowledgement without marketing consent',
    file: 'src/app/wanted/actions.ts',
    required: ['buildWantedBuyerAcknowledgement', "notificationType: 'wanted_buyer_ack'", "entityType: 'wanted_request'", "recipientRole: 'buyer'", 'wanted-buyer-ack-${stored.id}', 'buyer acknowledgement could not be completed'],
  },
  {
    name: 'Failed wanted-buyer acknowledgements rebuild current evidence and retry safely',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ["'wanted_buyer_ack'", 'dueWantedBuyerAcknowledgementRetries', "from('wanted_requests')", 'buildWantedBuyerAcknowledgement', 'wanted-buyer-ack-${wanted.id}', 'Wanted-equipment buyer acknowledgement retry failed'],
  },
  {
    name: 'Wanted-buyer acknowledgement extends the closed private delivery vocabulary',
    file: 'supabase/migrations/20260831720000_wanted_buyer_acknowledgement.sql',
    required: ['wanted_buyer_ack', 'Closed transactional vocabulary', 'it grants no marketing consent'],
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
    name: 'Terminal listing closure retires watchers only after the final accepted update',
    file: 'src/app/api/cron/listing-watch/route.ts',
    required: ['isListingWatchTerminalListingStatus', "status: 'LISTING_CLOSED'", 'closed_at: completedAt', "eq('status', 'ACTIVE')", 'delivery.success'],
  },
  {
    name: 'Late watch confirmation cannot reactivate sold or withdrawn inventory',
    file: 'src/app/watch/actions.ts',
    required: ['confirm_listing_watch_by_service', "outcome === 'LISTING_CLOSED'", 'This listing is no longer available, so updates cannot be activated.'],
  },
  {
    name: 'Watch confirmation and terminal listing state are serialized atomically',
    file: 'supabase/migrations/20260829480000_listing_watch_terminal_closure.sql',
    required: ['for update of watcher, listing', "v_listing_status in ('SOLD', 'ARCHIVED')", "status = 'LISTING_CLOSED'", 'grant execute on function public.confirm_listing_watch_by_service(uuid) to service_role'],
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
    name: 'Listing-watch decisions require an explicit POST, atomic confirmation and safe unsubscribe reconciliation',
    file: 'src/app/watch/actions.ts',
    required: ['verifyListingWatchAction', 'confirm_listing_watch_by_service', "outcome === 'ACTIVATED'", ".in('status', ['PENDING_CONFIRMATION', 'ACTIVE'])", "reconciled?.status === 'UNSUBSCRIBED'"],
  },
  {
    name: 'Production marketplace evidence uses named queries rather than positional attribution',
    file: 'scripts/capture-marketplace-audit.mjs',
    required: ['const querySpecs = {', 'Object.entries(querySpecs)', 'Object.fromEntries', 'newBalloonProposals:', 'listingWatchers:', 'optionalQuerySpecs', 'optionalRows', 'isOptionalSupabaseSchemaError', 'releaseCandidateDatasets', 'aerotrade-marketplace-audit-v2-read-only'],
    forbidden: ['const [\n  users,'],
  },
  {
    name: 'Production audit tolerates only explicitly missing candidate schema',
    file: 'src/utils/audit-schema-compatibility.mjs',
    required: ["'PGRST204'", "'PGRST205'", "'42P01'", "'42703'", "message.includes('could not find')", "message.includes('schema cache')"],
    forbidden: ['42501', 'PGRST301', 'return true //'],
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
    name: 'Localized buyer demand extends the existing private catalogue ledger',
    file: 'supabase/migrations/20260829570000_catalog_demand_entry_context.sql',
    required: ['catalog_search_events', 'entry_context text not null default', 'catalog_search_events_entry_context_check', "'buyer_landing_en'", "'buyer_landing_de'", "'buyer_landing_fr'", "'buyer_landing_es'", 'contains no URL, search text, visitor identifier or personal data'],
  },
  {
    name: 'Control Tower separates localized acquisition from search gaps and downstream intent',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['European buyer acquisition (30d)', 'localizedBuyerEntryEvents', 'localizedBuyerListingViewJourneys', 'localizedBuyerHighIntentJourneys', "event.entry_context === 'catalog_search'", 'Page code and internal operator visits do not count as commercial proof.'],
  },
  {
    name: 'Transactional SEO publishes only public listings and truthful offers',
    file: 'src/utils/marketplace-seo.mjs',
    required: ['isListingPubliclyIndexable', "listing.status === 'ACTIVE_PUBLIC'", "listing.status === 'SOLD'", "listing.status !== 'ACTIVE_PREMIUM'", 'price <= 0', 'buildListingProductJsonLd', "'https://schema.org/SoldOut'", 'buildNewBalloonServiceJsonLd', ".replace(/</g, '\\\\u003c')"],
  },
  {
    name: 'Sold public listings recover demand without reopening seller contact',
    file: 'src/app/catalog/[id]/page.tsx',
    required: ["typedListing.status === 'SOLD'", 'This equipment has been sold', "source: isSoldListing ? 'sold-listing' : 'listing'", "utm_source: 'sold_listing'", 'Find another used option', 'Price a new balloon', '!isSoldListing && !isOwner && !isAdmin', 'sold={isSoldListing}'],
  },
  {
    name: 'Control Tower separates sold-inventory recovery from active listing conversion',
    file: 'src/app/admin/commercial/page.tsx',
    required: ["event.event_type === 'SOLD_VIEW'", "quote.source_context === 'sold-listing'", "request.utm_source === 'sold_listing'", 'Demand recovered from sold inventory (30d)', 'A sold-page view is not an active listing view'],
  },
  {
    name: 'The sitemap excludes private Premium inventory, refreshes sold recovery pages and includes listing images',
    file: 'src/app/sitemap.ts',
    required: ["export const dynamic = 'force-dynamic'", 'isListingPubliclyIndexable', 'getListingSearchLastModified', ".in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM', 'SOLD'])", "from('listing_lifecycle_events')", "event_type', 'SOLD'", 'const publicListings =', 'const activeListings =', "listing.status !== 'SOLD'", 'images: (listing.images || [])'],
    forbidden: ["'/login'", "'/signup'"],
  },
  {
    name: 'Every listing mutation refreshes search and operational freshness evidence',
    file: 'supabase/migrations/20260831710000_listing_updated_at_integrity.sql',
    required: ['create trigger set_listings_updated_at', 'before update on public.listings', 'public.set_updated_at()', "event_type = 'SOLD'", 'greatest(listing.updated_at, lifecycle.created_at)'],
  },
  {
    name: 'Public URL discovery is scheduled, deduplicated and auditable without retaining URL lists',
    file: 'src/app/api/cron/indexing/route.ts',
    required: ['buildPublicIndexingUrls', 'buildIndexNowSubmission', ".in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM', 'SOLD'])", "from('indexing_submission_receipts')", "status: accepted ? 'ACCEPTED' : 'FAILED'", 'Provider result could not be persisted', 'Retry limit reached'],
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
    name: 'An unpaid seller can choose free publication from the dashboard without bypassing payment state',
    file: 'src/app/dashboard/page.tsx',
    required: ['publishListingFree.bind(null, item.id)', 'Resume €5 payment', 'Publish free instead'],
  },
  {
    name: 'Free publication retires checkout risk and verifies both listing and funnel evidence',
    file: 'src/app/catalog/[id]/actions.ts',
    required: ['retireListingCheckoutBeforeFreePublication', 'sellerFunnelEventKey', "rpc('publish_pending_listing_free'", "from('seller_funnel_events')", 'Free listing publication was not verified by readback'],
  },
  {
    name: 'Pending-to-free recovery is atomic, seller-bound and never performs an economic action',
    file: 'supabase/migrations/20260831660000_pending_listing_free_recovery.sql',
    required: ['publish_pending_listing_free', "auth.jwt() ->> 'role'", 'for update', "v_listing.seller_id <> p_seller_id", "v_listing.status not in ('DRAFT', 'PENDING_PAYMENT')", "status = 'ACTIVE_PUBLIC'", "'LISTING_PUBLISHED'", "'free'", "'recovery'", 'on conflict (event_key) do nothing', 'grant execute on function public.publish_pending_listing_free(uuid, uuid, text) to service_role', 'never creates, completes, cancels, refunds or charges a payment'],
    forbidden: ['to authenticated', 'stripe.checkout', 'payment_intent'],
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
    name: 'One explicit seller action can confirm every owned active listing with per-listing evidence',
    file: 'supabase/migrations/20260829540000_bulk_listing_availability_confirmation.sql',
    required: ['confirm_all_listing_availability', 'auth.uid()', "listing.seller_id = v_user_id", "listing.status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')", 'for update', 'listing_availability_confirmations', 'on conflict (listing_id, confirmed_on) do nothing', 'revoke all on function', 'grant execute'],
    forbidden: ['update public.listings', 'delete from public.listings'],
  },
  {
    name: 'Bulk availability confirmation is authenticated and fully verified by readback',
    file: 'src/app/dashboard/actions.ts',
    required: ['confirmAllListingAvailability', "rpc('confirm_all_listing_availability')", 'Bulk availability confirmation returned duplicate evidence', "from('listing_availability_confirmations')", 'activeIds.size !== confirmations.length', 'Bulk availability confirmation was not verified by readback'],
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
    name: 'Seller availability digests extend the existing private delivery ledger',
    file: 'supabase/migrations/20260829550000_seller_availability_digest.sql',
    required: ["'seller_availability_digest'", "'user'", 'commercial_notification_receipts_notification_type_check', 'commercial_notification_receipts_entity_type_check', 'never changes an advert'],
  },
  {
    name: 'One grouped seller request is cycle-bound, anti-churn and provider-audited',
    file: 'src/app/admin/actions.ts',
    required: ['requestSellerAvailabilityDigest', 'sellerAvailabilityDigestIdempotencyKey', 'changedSellerAvailabilityDigestIsCoolingDown', 'sellerAvailabilityDigestRequestKey', 'buildSellerAvailabilityDigestNotification', "notificationType: 'seller_availability_digest'", "entityType: 'user'", 'Seller availability digest acceptance was not verified by readback'],
  },
  {
    name: 'Control Tower explains seller outreach readiness before an operator can send',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['sellerAvailabilityDigestIdempotencyKey', 'sellerAvailabilityDigestReadiness', 'latestAvailabilityRowsByListing', "readiness.status === 'cooling_down'", 'readiness.actionable'],
  },
  {
    name: 'Expired grouped seller authority can be explicitly reissued without changing its inventory scope',
    file: 'src/utils/seller-availability-digest.mjs',
    required: ['sellerAvailabilityDigestRequestLifetimeMs', 'sellerAvailabilityDigestInventoryKey', 'sellerAvailabilityDigestRequestKey', 'current.toISOString()', 'latestReceipt.status'],
  },
  {
    name: 'Dated availability reissues remain seller-bound, scanner safe and database constrained',
    file: 'supabase/migrations/20260831650000_seller_availability_digest_reissue.sql',
    required: ['confirm_listing_availability_from_seller_digest', "(-[0-9]{8})?", "receipt.status = 'accepted'", "interval '15 days'", 'on conflict on constraint listing_availability_confirmations_listing_id_confirmed_on_key do nothing', 'grant execute on function public.confirm_listing_availability_from_seller_digest(uuid, text, uuid[]) to service_role'],
    forbidden: ['update public.listings', 'delete from public.listings'],
  },
  {
    name: 'Failed seller availability delivery retries only the exact initiated current inventory request',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: [".eq('notification_type', 'seller_availability_digest')", 'dueSellerAvailabilityDigestRetries', 'sellerAvailabilityDigestInventoryKey', 'sellerAvailabilityDigestIdempotencyKey', 'Seller availability recovery was superseded by current seller inventory.', 'buildSellerAvailabilityDigestNotification', 'signSellerAvailabilityCapability', 'sellerAvailabilityDigestsAccepted', 'sellerAvailabilityDigestsSuperseded', 'if (!commit) return NextResponse.json(result)'],
  },
  {
    name: 'Seller availability email authority is private, short-lived and scanner safe',
    file: 'src/app/seller/availability/page.tsx',
    required: ['verifySellerAvailabilityCapability', "receipt?.status === 'accepted'", 'sellerAvailabilityDigestInventoryKey(digestKey) !== currentDigestKey', "robots: { index: false", 'Opening this page has not confirmed anything', 'SellerAvailabilityConfirmationForm'],
  },
  {
    name: 'Seller availability capability headers cannot leak or cache the signed URL',
    file: 'src/proxy.ts',
    required: ["request.nextUrl.pathname === '/seller/availability'", "'Cache-Control', 'private, no-store, max-age=0'", "'Referrer-Policy', 'no-referrer'", "'X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet'"],
  },
  {
    name: 'Seller email confirmation is scope-bound, explicit and fully read back',
    file: 'src/app/seller/availability/actions.ts',
    required: ["availability_confirmation') !== 'yes'", 'confirm_listing_availability_from_seller_digest', 'sellerAvailabilityDigestInventoryKey(digestKey) !== currentDigestKey', 'readbackById.size !== confirmations.length', 'Nothing was confirmed'],
  },
  {
    name: 'Seller email confirmation uses the existing immutable availability evidence',
    file: 'supabase/migrations/20260829560000_seller_availability_email_capability.sql',
    required: ["'SELLER_EMAIL_CAPABILITY'", "receipt.status = 'accepted'", 'receipt.provider_message_id is not null', "interval '15 days'", 'p_listing_ids uuid[]', 'grant execute on function public.confirm_listing_availability_from_seller_digest', 'to service_role'],
  },
  {
    name: 'Seller confirmation converts trust into voluntary measurable distribution',
    file: 'src/app/seller/availability/SellerAvailabilityConfirmationForm.tsx',
    required: ['Availability confirmed', 'Put the confirmed listings in front of buyers', 'Nothing is sent automatically', 'ListingShare', 'source="seller_share"'],
    forbidden: ['sendEmail', 'sendCommercialReceiptEmail', 'fetch('],
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
    name: 'Verification requests provide a measured external evidence handoff without retaining documents',
    file: 'src/app/dashboard/actions.ts',
    required: ['buildListingVerificationEvidenceInstructions', "notificationType: 'listing_verification_evidence_instructions'", 'replyTo: instructions.replyTo', 'listingVerificationEvidenceInstructionKey(result.event_id)', 'Document copies remain outside the marketplace database'],
  },
  {
    name: 'Failed verification evidence instructions retry only for the exact open review event',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ["eq('notification_type', 'listing_verification_evidence_instructions')", 'parseListingVerificationEvidenceInstructionKey', "event.event_type === 'REQUESTED'", "currentVerification?.status === 'IN_REVIEW'", "notificationType: 'listing_verification_evidence_instructions'", 'listingVerificationInstructionsSuperseded', 'replyTo: instructions.replyTo'],
  },
  {
    name: 'Verification evidence notification type retains a closed non-document vocabulary',
    file: 'supabase/migrations/20260831690000_listing_verification_evidence_handoff.sql',
    required: ['listing_verification_evidence_instructions', 'no evidence copy, document number or link is stored'],
    forbidden: ['document_url', 'document_number text', 'evidence_url'],
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
    name: 'European high-intent acquisition reuses real inventory and existing conversion paths',
    file: 'src/components/EuropeanBuyerLanding.tsx',
    required: ['CatalogSearchTracker', 'buyer_landing_', "isListingPubliclyIndexable", "href=\"/catalog\"", "'/wanted?category=complete'", "'/new-balloon?source=catalog&category=complete'", 'buildBuyerAcquisitionCollectionJsonLd'],
    forbidden: ['utm_source=aerotrade', 'certified airworthy', 'guaranteed airworthy'],
  },
  {
    name: 'European acquisition locales are closed, reciprocal and indexable',
    file: 'src/utils/european-buyer-landings.mjs',
    required: ['/used-hot-air-balloons-for-sale', '/de/gebrauchte-heissluftballons', '/fr/montgolfieres-occasion', '/es/globos-aerostaticos-segunda-mano', 'europeanBuyerLandingAlternates', "['x-default', europeanBuyerLandings[0].path]"],
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
    name: 'Listing recovery promotes the verified reachable image before declaring the advert healthy',
    file: 'src/app/api/cron/catalog-quality/route.ts',
    required: ['assessment.reachableUrl', 'ensureReachableListingPrimaryImage', 'primaryImagesRepaired', "select('id,seller_id,title,status,images(id,url,is_primary)')"],
  },
  {
    name: 'Operational listing repair notices go to the authenticated seller account',
    file: 'src/app/api/cron/catalog-quality/route.ts',
    required: ["from('users').select('id,email')", 'sellerEmailById', 'seller_account_email'],
    forbidden: ['listing.contact_email,'],
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
    name: 'Failed negotiation updates recover in both directions without reviving stale messages',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ["'inquiry_buyer_seller_response', 'inquiry_seller_buyer_response'", 'parseNegotiationNotificationEventId', 'dueNegotiationNotificationRetries', 'latestNegotiationEventByInquiry', 'Notification superseded by later negotiation state.', 'buildSellerResponseBuyerNotification', 'buildBuyerResponseSellerNotification', 'negotiationNotificationsAccepted', 'negotiationNotificationsSuperseded', 'Buyer negotiation notification retry readback failed', 'Seller negotiation notification retry readback failed'],
  },
  {
    name: 'Unanswered seller enquiries escalate internally only after an accepted reminder ages 48 hours',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ['getSellerEnquiryEscalationCutoff', "notification_type', 'inquiry_seller_followup'", "notificationType: 'inquiry_seller_escalation'", 'dueSellerEnquiryEscalations', 'inquiry-seller-escalation-${inquiry.id}', 'This internal escalation sends nothing to the buyer', 'retryDeferred'],
  },
  {
    name: 'Seller-response escalation extends the existing closed private delivery ledger',
    file: 'supabase/migrations/20260829580000_inquiry_seller_escalation.sql',
    required: ['commercial_notification_receipts', 'inquiry_seller_escalation', 'one internal admin signal', 'never contacts the buyer'],
  },
  {
    name: 'Control Tower counts unresolved seller responses as attention without exposing them publicly',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['stalledSellerInquiryIds', 'sellerReminderByInquiry', 'sellerEscalationByInquiry', 'Seller response overdue after an accepted reminder', 'seller response overdue'],
  },
  {
    name: 'Listing availability RPCs resolve daily uniqueness without PL/pgSQL ambiguity',
    file: 'supabase/migrations/20260829590000_fix_listing_availability_conflict.sql',
    required: ['confirm_listing_availability', 'confirm_all_listing_availability', 'confirm_listing_availability_from_seller_digest', 'scope.scoped_listing_id', 'on conflict on constraint listing_availability_confirmations_listing_id_confirmed_on_key do nothing', 'grant execute on function public.confirm_listing_availability(uuid) to authenticated', 'grant execute on function public.confirm_all_listing_availability() to authenticated', 'grant execute on function public.confirm_listing_availability_from_seller_digest(uuid, text, uuid[]) to service_role', 'never changes publication, price, payment or ownership'],
    forbidden: ['drop table', 'delete from public.listing_availability_confirmations', 'on conflict (listing_id, confirmed_on)', 'count(distinct listing_id)'],
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
    name: 'Sold-listing demand reaches the existing new-balloon ledger without free-form attribution',
    file: 'supabase/migrations/20260831610000_sold_listing_new_balloon_source.sql',
    required: ['quote_requests_source_context_check', "'sold-listing'", 'contains no URL, listing identifier or personal data'],
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
    name: 'Newsletter listing links preserve non-personal campaign attribution into the commercial journey',
    file: 'src/utils/newsletter-links.mjs',
    required: ["source: 'newsletter'", "medium: 'email'", "campaignPrefix: 'biweekly_marketplace'", "url.searchParams.set('utm_source'", "url.searchParams.set('utm_medium'", "url.searchParams.set('utm_campaign'", 'periodKeyPattern', 'listingIdPattern'],
    forbidden: ['recipient', 'emailAddress', 'userId'],
  },
  {
    name: 'Newsletter dispatch uses the canonical campaign period rather than its suffixed audit key',
    file: 'src/app/api/cron/newsletter/route.ts',
    required: ['const newsletterPeriodKey = periodKey;', 'generateNewsletterHtml(recentListings, periodKey)', 'buildNewsletterListingUrl({', 'utmCampaign: buildNewsletterCampaign(newsletterPeriodKey)'],
    forbidden: ['generateNewsletterHtml(recentListings, activeRun.periodKey)'],
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
    name: 'Newsletter marketing requires explicit owner-controlled consent',
    file: 'supabase/migrations/20260829530000_newsletter_consent.sql',
    required: ["default 'NOT_REQUESTED'", "newsletter_consent_status in ('NOT_REQUESTED', 'ACTIVE', 'UNSUBSCRIBED')", 'auth.uid()', 'set_own_newsletter_consent', 'when p_enabled then v_now', 'revoke all on function', 'grant execute on function'],
    forbidden: ["default 'ACTIVE'", "update public.users set newsletter_consent_status = 'ACTIVE'"],
  },
  {
    name: 'Newsletter dispatch and recovery recheck live consent and include a signed stop control',
    file: 'src/app/api/cron/newsletter/route.ts',
    required: [".eq('newsletter_consent_status', 'ACTIVE')", 'buildNewsletterRecipients', 'signNewsletterUnsubscribeCapability', 'newsletterUnsubscribePlaceholder', 'eligibleRecoveryRecipients', 'excludedAfterConsentRecheck', 'predates explicit consent and unsubscribe controls'],
    forbidden: ["select('email');", 'because you are a registered user'],
  },
  {
    name: 'Newsletter unsubscribe is signed, purpose-bound and requires explicit POST',
    file: 'src/app/newsletter/unsubscribe/actions.ts',
    required: ['verifyNewsletterUnsubscribeCapability', "newsletter_consent_status: 'UNSUBSCRIBED'", 'newsletter_unsubscribed_at', "updated?.newsletter_consent_status !== 'UNSUBSCRIBED'"],
  },
  {
    name: 'Registered users control the optional newsletter separately from account access',
    file: 'src/app/dashboard/actions.ts',
    required: ['updateNewsletterPreference', "rpc('set_own_newsletter_consent'", "const expectedStatus = enabled ? 'ACTIVE' : 'UNSUBSCRIBED'", 'Newsletter preference was not verified by readback'],
  },
  {
    name: 'Newsletter consent invitation is one-time, preference-only and excludes decided accounts',
    file: 'src/app/api/cron/newsletter-consent-invitation/route.ts',
    required: [".eq('newsletter_consent_status', 'NOT_REQUESTED')", ".neq('role', 'admin')", 'SEND_ONE_TIME_CONSENT_INVITATIONS', 'newsletter-consent-invitation-v1-', "Date.parse('2026-09-28T23:59:59Z')", 'This invitation does not subscribe you by itself.', 'sent once and expires within 30 days'],
    forbidden: ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM', 'View Listing'],
  },
  {
    name: 'Opening a newsletter consent invitation cannot activate marketing',
    file: 'src/app/newsletter/subscribe/actions.ts',
    required: ['verifyNewsletterConsentInvitationCapability', "receipt?.status === 'accepted'", "profile.newsletter_consent_status !== 'NOT_REQUESTED'", ".eq('newsletter_consent_status', 'NOT_REQUESTED')", "newsletter_consent_status: 'ACTIVE'", 'could not verify your newsletter preference safely'],
  },
  {
    name: 'Consent invitation delivery is part of the closed private receipt vocabulary',
    file: 'supabase/migrations/20260829600000_newsletter_consent_invitation.sql',
    required: ["'newsletter_consent_invitation'", 'Opening the link is read-only', 'does not activate consent on delivery or link open'],
  },
  {
    name: 'Public newsletter consent is private, double-opt-in and abuse controlled',
    file: 'supabase/migrations/20260831670000_public_newsletter_double_opt_in.sql',
    required: ['newsletter_public_subscriptions', "status in ('PENDING','ACTIVE','UNSUBSCRIBED')", 'email_hash text not null unique', 'request_key text', 'enable row level security', 'revoke all on public.newsletter_public_subscriptions from public, anon, authenticated', 'begin_public_newsletter_optin', 'confirm_public_newsletter_optin', "receipt.status = 'accepted'", 'provider_message_id is not null', 'grant execute on function public.begin_public_newsletter_optin(text, text, text) to service_role', 'never activates consent'],
    forbidden: ['grant insert', 'grant update', 'ip_address', 'user_agent text'],
  },
  {
    name: 'Public newsletter request is generic, explicit and creates no consent on delivery',
    file: 'src/app/newsletter/actions.ts',
    required: ['parsePublicNewsletterOptIn', 'publicNewsletterEmailHash', 'publicNewsletterSubmissionKey', 'normalizeCommercialContext', 'commercialJourneyKey', "rpc('begin_public_newsletter_optin'", 'p_source_context', 'p_journey_key', 'buildPublicNewsletterConfirmation', "notificationType: 'newsletter_public_optin_confirmation'", 'Nothing is subscribed until you confirm it'],
  },
  {
    name: 'Public newsletter form reuses the existing commercial attribution fields',
    file: 'src/components/PublicNewsletterSignup.tsx',
    required: ['CommercialAttributionFields', "sourceContext: 'home' | 'catalog'", 'name="source_context"', 'value={sourceContext}'],
  },
  {
    name: 'Public newsletter acquisition extends the existing privacy-minimized journey',
    file: 'supabase/migrations/20260831680000_public_newsletter_attribution.sql',
    required: ['source_context text', "source_context in ('home','catalog','unknown')", 'journey_key text', 'referrer_host text', 'utm_source text', 'p_source_context text', 'p_journey_key text', 'Backward-compatible service-only request claim', 'grant execute on function public.begin_public_newsletter_optin(text, text, text, text, text, text, text, text, text) to service_role', 'contains no raw visitor identifier'],
    forbidden: ['visitor_id text', 'raw_url', 'ip_address'],
  },
  {
    name: 'Public newsletter confirmation and stop links require explicit signed POST and readback',
    file: 'src/app/newsletter/subscribe/actions.ts',
    required: ['confirmPublicNewsletterConsent', 'verifyPublicNewsletterConfirmation', "receipt?.status === 'accepted'", "rpc('confirm_public_newsletter_optin'", "readback?.status !== 'ACTIVE'"],
  },
  {
    name: 'Public newsletter stop action is signed, idempotent and independently read back',
    file: 'src/app/newsletter/unsubscribe/actions.ts',
    required: ['unsubscribePublicNewsletter', 'verifyPublicNewsletterUnsubscribe', "rpc('unsubscribe_public_newsletter'", "result?.subscription_status !== 'UNSUBSCRIBED'", "readback?.status !== 'UNSUBSCRIBED'"],
  },
  {
    name: 'Public newsletter dispatch and recovery deduplicate and recheck live consent',
    file: 'src/app/api/cron/newsletter/route.ts',
    required: ['buildNewsletterRecipients', "kind: 'account' | 'public' | 'test'", 'signPublicNewsletterUnsubscribe', "from('newsletter_public_subscriptions')", 'currentlyConsentedPublic', 'currentRecipientPlan', 'eligibleRecoveryRecipients'],
  },
  {
    name: 'Failed public confirmation delivery retries only the exact current consent cycle',
    file: 'src/app/api/cron/opportunity-followup/route.ts',
    required: ["notification_type', 'newsletter_public_optin_confirmation'", 'parsePublicNewsletterConfirmationIdempotencyKey', "subscription.status === 'PENDING'", 'subscription.confirmation_cycle === parsedKey.confirmationCycle', 'buildPublicNewsletterConfirmation', 'publicNewsletterConfirmationsSuperseded'],
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
    name: 'Social publication evidence is private, placement-specific and fails closed',
    file: 'supabase/migrations/20260829490000_social_publication_receipts.sql',
    required: ['social_publication_receipts', 'publication_key text not null unique', "content_kind in ('listing', 'brand')", "network in ('instagram', 'facebook')", "status in ('pending', 'accepted', 'failed')", 'attempt_count between 0 and 2', 'provider_id is not null', 'enable row level security', 'revoke all on public.social_publication_receipts from public, anon, authenticated', 'from public.users', "and role = 'admin'"],
    forbidden: ['public.is_admin(auth.uid())'],
  },
  {
    name: 'Each social placement is claimed before publishing and accepted by provider ID',
    file: 'src/utils/social-publication-receipt.ts',
    required: ['buildSocialPublicationKey', 'getSocialPublicationDecision', "status: 'pending'", 'attempt_count: attemptNumber', 'const providerId', "status: 'accepted'", 'do not retry automatically', 'isSocialPublicationRetrySafe'],
  },
  {
    name: 'Scheduled social acquisition uses attributable links and durable per-placement receipts',
    file: 'src/app/api/cron/instagram/route.ts',
    required: ['getAttributedSocialUrl', 'publishSocialPlacement', 'publishTracked', "contentKind: 'listing'", "contentKind: 'brand'", "network: 'instagram'", "network: 'facebook'"],
  },
  {
    name: 'Future social creatives expose AeroTrade itself as the buyer destination',
    file: 'src/app/api/social-brand-card/[slug]/route.tsx',
    required: ['getBrandSocialSourceImagePath', 'Browse current balloon equipment', 'aerotrade.app', 'Cache-Control'],
    forbidden: ['@balloonconsulting'],
  },
  {
    name: 'Listing social cards direct buyers to the marketplace domain',
    file: 'src/app/api/social-card/[id]/route.tsx',
    required: ['aerotrade.app'],
    forbidden: ['@balloonconsulting'],
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
  {
    name: 'Account recovery is self-service, enumeration-safe and session-bound',
    file: 'src/app/forgot-password/actions.ts',
    required: ['neutralSuccessMessage', 'signAccountRecoveryCapability', 'sendCommercialReceiptEmail', "notificationType: 'account_password_recovery'", 'accountRecoveryRequestCooldownMs'],
    forbidden: ['resetPasswordForEmail', 'generateLink'],
  },
  {
    name: 'Account recovery email links reset in one scanner-safe, one-time, cross-device submission',
    file: 'src/app/account/recovery/actions.ts',
    required: ['validateAccountPasswordChange', 'verifyAccountRecoveryCapability', ".eq('idempotency_key', requestId)", ".is('consumed_at', null)", '!claimed?.id', '!claimed.consumed_at', 'admin.auth.admin.updateUserById', "update({ consumed_at: null })", "redirect('/login?message='"],
  },
  {
    name: 'Account recovery delivery extends the closed private receipt vocabulary',
    file: 'supabase/migrations/20260831600000_account_password_recovery.sql',
    required: ["'account_password_recovery'", 'consumed_at timestamp with time zone', 'Opening an email link is read-only', 'no email address or token is stored'],
  },
  {
    name: 'Recovered passwords require an authenticated recovery session and end it after use',
    file: 'src/app/reset-password/actions.ts',
    required: ['validateAccountPasswordChange', 'supabase.auth.getUser()', 'supabase.auth.updateUser', 'supabase.auth.signOut()'],
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
