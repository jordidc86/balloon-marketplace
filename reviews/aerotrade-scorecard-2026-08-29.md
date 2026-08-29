# AeroTrade evidence-based scorecard — 2026-08-29

## Method

Each category is assessed against five gates: the capability exists, works under validation, persists durably, is measurable, and fails safely or can be operated autonomously. Partial evidence receives partial credit. A feature is not treated as commercially proven merely because its code exists.

Authoritative evidence used:

- Read-only production snapshot: `reviews/marketplace-audit-2026-08-29.json`.
- Read-only live Stripe reconciliation: `reviews/stripe-commercial-audit-2026-08-29.json`.
- Production database migrations through `20260829240000` with RLS and post-write verification.
- Public production smoke checks against `https://aerotrade.app`.
- 54 automated tests, 55 operational contracts, lint, production build and dependency audit.
- Netlify production deployment and Supabase migration history.

## Scores

| # | Category | Initial | Current | Evidence now | Principal remaining gap |
|---|---|---:|---:|---|---|
| 1 | Value proposition, business model and unit economics | 45% | 65% | Gross outcome value and AeroTrade revenue are separated by evidence level. Live Stripe confirms one successful 9.99 EUR gross charge in 90 days with no refund; it is not counted as net or assigned to a product without metadata. | No closed marketplace outcome or settled intermediation revenue exists; pricing and take-rate economics remain commercially unproven. |
| 2 | Seller acquisition and onboarding | 55% | 76% | Self-service publication, image safeguards, server-side validation, private stage-by-stage seller funnel, evidence-backed recovery queue and secure resumption for interrupted Premium checkout. | Only 5 sellers currently have active listings; 11 of 16 accounts have no listing, funnel measurement starts at zero, and no seller acquisition campaign has been run. |
| 3 | Listing quality, verification and trust | 45% | 82% | Required flight fields, seller-declared documents and inspection date, controlled document-review badge, real image-file probes and a two-check quarantine with durable seller notification. The confirmed broken listing is now non-public and the fresh production audit reports 0 inaccessible active files. | 0 listings have completed verification and 2 of 8 active flight listings still lack a historical serial number; those records cannot be guessed and cannot be republished without correction. |
| 4 | Catalogue, search and buyer experience | 70% | 90% | Search, canonical country filter, sorting, result counts, mobile-safe images and explicit paths from missing inventory to a private wanted request or an indicative new Pasha/Schroeder quote. | Inventory remains narrow and concentrated: 12 active listings, with 83.3% held by the three largest sellers. |
| 5 | Buyer-to-seller conversion and opportunity tracking | 25% | 89% | Durable enquiries and unmet-demand requests, buyer acknowledgement, deduplication, rate limiting, delivery receipts, status pipelines, basic supply matching and evidence-based outcome closure. | 60 views produced 0 tracked contacts in the measured period; neither production funnel has yet produced a live lead. |
| 6 | Premium, subscriptions, payments and revenue traceability | 72% | 88% | Stripe confirms 5 checkouts in 90 days, 1 completed/paid and 4 expired. New Premium attempts now enter a private ledger, reuse an open Stripe session, replace an expired one safely, remain recoverable from the owner dashboard and close through signed webhook readback. A fail-closed test-mode exercise exists. | The one historical live charge predates the receipt ledger and cannot be safely attributed to a product; the recovery path has not yet been exercised by a live customer and no real Stripe test key is configured, so checkout completion remains 20% historically. |
| 7 | New-balloon requests and intermediation | 45% | 90% | Buying factory-new is a first-class path in navigation, catalogue, zero-result, listing and wanted journeys. Requests fail closed unless stored, retain a bounded source, persist notification acceptance, enter the central pipeline and trigger one operational reminder if still untouched after 24 hours. | No real quote request or manufacturer proposal has yet exercised the production path, so response time and close rate remain unproven. |
| 8 | SEO, content, international acquisition and demand measurement | 60% | 82% | Canonicals, metadata, sitemap, robots, searchable catalogue, bounded UTM/referrer attribution and private daily-deduplicated catalog/zero-result measurement without retaining raw visitor IDs. | The new search ledger starts at zero; there is still no current evidence of search impressions, qualified international acquisition or category-specific content performance. |
| 9 | Commercial automation, communications and recovery | 60% | 84% | Newsletter and Premium-alert ledgers, partial-failure semantics, selective recovery, durable operational receipts, buyer acknowledgement and daily one-time follow-up for unattended seller enquiries and new-balloon quotes. | Historical newsletter runs include 2 partial results and Premium alerts include 1 failure; live opportunity follow-up has no real lead volume yet. |
| 10 | Analytics, Control Tower and operational insight | 45% | 94% | One commercial dashboard joins views, catalog searches, seller activation, zero-result supply gaps, contacts, opportunities, outcomes and notification failures. Reproducible PII-free database, image-availability and live Stripe audits expose cross-system gaps. | Cohort and source-to-outcome reporting needs real search, enquiry and outcome volume before it can be validated. |
| 11 | Security, privacy, anti-fraud and data integrity | 75% | 93% | Private RLS tables, anonymous access denied, no raw visitor IDs, daily event deduplication, bounded inputs, honeypot, pseudonymous rate limiting, explicit consent and private notification receipts with zero authenticated-user privileges. | No independent penetration test; seller and buyer identity assurance is still operational rather than automated. |
| 12 | Production, deployment, persistence, tests and recovery | 88% | 96% | Main branch consolidation discipline, migrations registered and read back, public route health, protected-route enforcement, daily scheduled follow-up, 54 tests and 55 contracts. | Synthetic monitoring is not yet exercising a full safe commercial transaction; Next.js reports an Edge runtime deprecation warning. |

**Weighted equally: 57.1% initial → 85.8% current.**

## Interpretation

The platform can receive either a listing-specific enquiry or unmet buying demand, preserve it if email fails, acknowledge the buyer, compare unmet demand with active supply, route a buyer toward a new-balloon quote and remind the responsible operator once after 24 hours. It also measures searches without inventory, recovers interrupted seller checkout and records evidence-qualified outcomes without pretending that reported value is settled revenue. A confirmed broken listing has been quarantined after two independent checks; a post-action production audit now shows 12 active listings, 88 active image files checked, 0 inaccessible files and 0 active listings without a reachable image. Stripe still proves that checkout abandonment is material: four of five sessions expired. The remaining constraint is validated marketplace liquidity, acquisition and checkout completion. Scores for acquisition and economics must not rise materially until real searches, sellers, enquiries, wanted requests, quotes and outcomes exercise the paths.

## Next highest-value block

Use the new seller and buyer ledgers to distinguish acquisition failure from onboarding abandonment, then address the measured 80% checkout abandonment before recruiting relevant sellers against recurring zero-result demand. Keep the used-or-new journey prominent, but do not launch outreach or match campaigns without approval and real opt-in evidence.
