import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const checks = [
  {
    name: 'Stripe webhook verifies signatures and audits idempotency',
    file: 'src/app/api/webhooks/stripe/route.ts',
    required: ['stripe.webhooks.constructEvent', "from('stripe_webhook_events')", "finishWebhookEvent(supabaseAdmin, event.id, 'processed')"],
  },
  {
    name: 'Stripe event audit migration exists and is private',
    file: 'supabase/migrations/20260711120000_audit_stripe_webhook_events.sql',
    required: ['event_id text primary key', 'enable row level security', 'revoke all'],
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
    required: ['canRevealSellerContact', 'Premium access is required to reveal this contact'],
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
    required: ['workflow_dispatch', 'production-newsletter', 'recover_failed_only', '.sentCount == $expected and .failedCount == 0'],
    forbidden: ['schedule:', '--retry-all-errors', '--retry 3'],
  },
  {
    name: 'Newsletter recovery dry-run cannot mutate stale recovery state',
    file: 'src/app/api/cron/newsletter/route.ts',
    required: ['shouldReconcileStaleRecoveries(parsed.request.dryRun)', 'Recovery plan verified; no email or database mutation was performed.'],
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
