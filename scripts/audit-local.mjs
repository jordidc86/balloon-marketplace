import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const checks = [
  {
    name: 'Runtime dependencies are pinned to the audited release line',
    file: 'package.json',
    required: ['"next": "16.3.3"', '"eslint-config-next": "16.3.3"', '"resend": "6.25.0"'],
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
    name: 'Premium checkout validates current entitlement and uses trusted returns',
    file: 'src/app/pricing/actions.ts',
    required: ["select('is_premium, stripe_customer_id')", 'getApplicationOrigin', "type: 'premium_subscription'"],
  },
  {
    name: 'Premium listing fee is independent from buyer membership',
    file: 'src/app/sell/actions.ts',
    required: ['getInitialListingPublication(listingPlan)', "type: 'listing_fee'", 'parseListingImageUrls'],
    forbidden: ['shouldStartPremiumWindow'],
  },
  {
    name: 'Seller contact uses active-listing visibility rules',
    file: 'src/app/catalog/[id]/actions.ts',
    required: ['canRevealSellerContact', 'Premium access is required to reveal this contact', "event_type: 'CONTACT_REVEAL'", 'user_id: user?.id || null'],
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
    name: 'Commercial operational emails have private durable receipts',
    file: 'supabase/migrations/20260829130000_commercial_notification_receipts.sql',
    required: ['commercial_notification_receipts', 'idempotency_key text not null unique', 'enable row level security', 'revoke all on public.commercial_notification_receipts from anon, authenticated'],
  },
  {
    name: 'Commercial outcomes separate reported value from settled revenue',
    file: 'supabase/migrations/20260829140000_commercial_outcomes.sql',
    required: ['commercial_outcomes', "evidence_level in ('reported', 'documented', 'settled')", 'aerotrade_revenue_minor <= gross_amount_minor', 'enable row level security', 'revoke all on public.commercial_outcomes from anon, authenticated'],
  },
  {
    name: 'Listing trust badges have an explicit non-airworthiness boundary',
    file: 'supabase/migrations/20260829110000_listing_verification.sql',
    required: ['listing_verifications', 'supporting_documents_checked', 'This is not an airworthiness inspection.', 'enable row level security'],
  },
  {
    name: 'Commercial events are daily-deduplicated without raw visitor ids',
    file: 'supabase/migrations/20260829120000_deduplicate_commercial_events.sql',
    required: ['event_key text', 'listing_events_event_key_unique', 'referrer_host', 'utm_source'],
  },
  {
    name: 'Listing submissions are validated again on the server',
    file: 'src/utils/listing-submission.mjs',
    required: ['listingCategories', 'listingConditions', 'listingCurrencies', 'seller_declaration', 'supporting_documents_available', 'Serial number'],
  },
  {
    name: 'Admin has one evidence-based commercial pipeline',
    file: 'src/app/admin/commercial/page.tsx',
    required: ['Commercial Pipeline', 'Open opportunities', 'Won outcomes', 'Revenue evidence', 'This is not net revenue.'],
  },
  {
    name: 'New-balloon quotes fail closed unless the lead is durably stored',
    file: 'src/app/new-balloon/actions.ts',
    required: ["select('id')", 'Quote request readback did not return an id', 'aerotrade-quote-${requestId}'],
  },
  {
    name: 'Listing detail image stays bounded on mobile',
    file: 'src/app/catalog/[id]/page.tsx',
    required: ['Number(b.is_primary) - Number(a.is_primary)', 'aspect-[4/3]', 'sm:h-[min(72vh,620px)]', 'object-contain'],
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
