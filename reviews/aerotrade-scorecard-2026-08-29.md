# AeroTrade evidence-based scorecard — 2026-08-29

## Method

Each category is assessed against five gates: the capability exists, works under validation, persists durably, is measurable, and fails safely or can be operated autonomously. Partial evidence receives partial credit. A feature is not treated as commercially proven merely because its code exists.

Authoritative evidence used:

- Read-only production snapshot: `reviews/marketplace-audit-2026-08-29.json`.
- Read-only live Stripe reconciliation: `reviews/stripe-commercial-audit-2026-08-29.json`.
- Production database migrations through `20260829250000` with RLS and post-write verification.
- Public production smoke checks against `https://aerotrade.app`.
- 56 automated tests, 56 operational contracts, lint, production build and dependency audit.
- Netlify production deployment and Supabase migration history.

## Scores

| # | Category | Initial | Current | Evidence now | Principal remaining gap |
|---|---|---:|---:|---|---|
| 1 | Value proposition, business model and unit economics | 45% | 65% | Gross outcome value and AeroTrade revenue are separated by evidence level. Live Stripe confirms one successful 9.99 EUR gross charge in 90 days with no refund; it is not counted as net or assigned to a product without metadata. | No closed marketplace outcome or settled intermediation revenue exists; pricing and take-rate economics remain commercially unproven. |
| 2 | Seller acquisition and onboarding | 55% | 79% | Self-service publication, image safeguards, server-side validation, private stage-by-stage seller funnel, evidence-backed recovery queue, one-time abandoned-checkout recovery and secure resumption. One real seller has now entered the measured recovery stage. | Only 5 sellers currently have active listings; 11 of 16 accounts have no listing, and no seller acquisition campaign has been run. |
| 3 | Listing quality, verification and trust | 45% | 82% | Required flight fields, seller-declared documents and inspection date, controlled document-review badge, real image-file probes and a two-check quarantine with durable seller notification. The confirmed broken listing is now non-public and the fresh production audit reports 0 inaccessible active files. | 0 listings have completed verification and 2 of 8 active flight listings still lack a historical serial number; those records cannot be guessed and cannot be republished without correction. |
| 4 | Catalogue, search and buyer experience | 70% | 90% | Search, canonical country filter, sorting, result counts, mobile-safe images and explicit paths from missing inventory to a private wanted request or an indicative new Pasha/Schroeder quote. | Inventory remains narrow and concentrated: 12 active listings, with 83.3% held by the three largest sellers. |
| 5 | Buyer-to-seller conversion and opportunity tracking | 25% | 89% | Durable enquiries and unmet-demand requests, buyer acknowledgement, deduplication, rate limiting, delivery receipts, status pipelines, basic supply matching and evidence-based outcome closure. | 60 views produced 0 tracked contacts in the measured period; neither production funnel has yet produced a live lead. |
| 6 | Premium, subscriptions, payments and revenue traceability | 72% | 90% | Stripe confirms 5 checkouts in 90 days, 1 completed/paid and 4 expired. New membership attempts enter a private ledger and listing-payment abandonment now produces one idempotent operational recovery. The real pending listing was cross-checked against Stripe: one expired session and 0 paid sessions. | The accepted recovery has not yet converted to payment or free publication; the one historical charge predates the current payment-receipt ledger and checkout completion remains 20% historically. |
| 7 | New-balloon requests and intermediation | 45% | 90% | Buying factory-new is a first-class path in navigation, catalogue, zero-result, listing and wanted journeys. Requests fail closed unless stored, retain a bounded source, persist notification acceptance, enter the central pipeline and trigger one operational reminder if still untouched after 24 hours. | No real quote request or manufacturer proposal has yet exercised the production path, so response time and close rate remain unproven. |
| 8 | SEO, content, international acquisition and demand measurement | 60% | 82% | Canonicals, metadata, sitemap, robots, searchable catalogue, bounded UTM/referrer attribution and private daily-deduplicated catalog/zero-result measurement without retaining raw visitor IDs. | The new search ledger starts at zero; there is still no current evidence of search impressions, qualified international acquisition or category-specific content performance. |
| 9 | Commercial automation, communications and recovery | 60% | 87% | Newsletter and Premium-alert ledgers, partial-failure semantics, selective recovery, durable operational receipts, buyer acknowledgement and daily one-time follow-up for unattended enquiries, new-balloon quotes and Premium listing checkout. The first real recovery was provider-accepted and a repeated run was deduplicated. | Historical newsletter runs include 2 partial results and Premium alerts include 1 failure; live buyer-opportunity follow-up has no real lead volume yet. |
| 10 | Analytics, Control Tower and operational insight | 45% | 94% | One commercial dashboard joins views, catalog searches, seller activation, zero-result supply gaps, contacts, opportunities, outcomes and notification failures. Reproducible PII-free database, image-availability and live Stripe audits expose cross-system gaps. | Cohort and source-to-outcome reporting needs real search, enquiry and outcome volume before it can be validated. |
| 11 | Security, privacy, anti-fraud and data integrity | 75% | 93% | Private RLS tables, anonymous access denied, no raw visitor IDs, daily event deduplication, bounded inputs, honeypot, pseudonymous rate limiting, explicit consent and private notification receipts with zero authenticated-user privileges. | No independent penetration test; seller and buyer identity assurance is still operational rather than automated. |
| 12 | Production, deployment, persistence, tests and recovery | 88% | 97% | Main branch consolidation discipline, migrations registered and read back, public route health, protected-route enforcement, daily scheduled follow-up, 56 tests and 56 contracts. Recovery was verified against live Stripe state, provider acceptance, database receipt, funnel event and duplicate execution. | Synthetic monitoring is not yet exercising a full safe commercial transaction; Next.js reports an Edge runtime deprecation warning. |

**Weighted equally: 57.1% initial → 86.5% current.**

## Interpretation

The platform can receive either a listing-specific enquiry or unmet buying demand, preserve it if email fails, acknowledge the buyer, compare unmet demand with active supply, route a buyer toward a new-balloon quote and remind the responsible operator once after 24 hours. It also measures searches without inventory and records evidence-qualified outcomes without pretending that reported value is settled revenue. A confirmed broken listing has been quarantined after two independent checks; a post-action production audit shows 12 active listings, 88 active image files checked, 0 inaccessible files and 0 active listings without a reachable image. Stripe proved the only recoverable Premium listing had one expired checkout and no paid checkout. AeroTrade sent exactly one operational recovery, persisted provider acceptance and the seller-funnel event, retained the listing unchanged, and deduplicated a second execution. The remaining constraint is validated marketplace liquidity and whether this recovery actually converts to publication or payment.

## Next highest-value block

Use the new seller and buyer ledgers to distinguish acquisition failure from onboarding abandonment, then address the measured 80% checkout abandonment before recruiting relevant sellers against recurring zero-result demand. Keep the used-or-new journey prominent, but do not launch outreach or match campaigns without approval and real opt-in evidence.
