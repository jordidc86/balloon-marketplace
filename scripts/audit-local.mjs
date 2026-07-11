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
    name: 'Newsletter has one documented bi-weekly production schedule',
    file: '.github/workflows/newsletter.yml',
    required: ["cron: '0 9 1,16 * *'", 'production-newsletter', 'dry_run'],
  },
  {
    name: 'Social scheduler uses the protected unified endpoint',
    file: 'netlify/functions/social-scheduled.mjs',
    required: ['CRON_SECRET', '/api/cron/social?limit=1'],
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
