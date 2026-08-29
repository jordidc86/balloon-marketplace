# AeroTrade evidence-based scorecard — 2026-08-29

## Method

Each category is assessed against five gates: the capability exists, works under validation, persists durably, is measurable, and fails safely or can be operated autonomously. Partial evidence receives partial credit. A feature is not treated as commercially proven merely because its code exists.

Authoritative evidence used:

- Read-only production snapshot: `reviews/marketplace-audit-2026-08-29.json`.
- Production database migrations through `20260829140000` with RLS and post-write verification.
- Public production smoke checks against `https://aerotrade.app`.
- 30 automated tests, 30 operational contracts, lint, production build and dependency audit.
- Netlify production deployment and Supabase migration history.

## Scores

| # | Category | Initial | Current | Evidence now | Principal remaining gap |
|---|---|---:|---:|---|---|
| 1 | Value proposition, business model and unit economics | 45% | 62% | Gross outcome value and AeroTrade revenue can now be recorded separately with reported/documented/settled evidence. Stripe evidence remains separate. | No closed outcomes or settled marketplace revenue exist yet; pricing and take-rate economics remain commercially unproven. |
| 2 | Seller acquisition and onboarding | 55% | 68% | Self-service publication, image safeguards, required seller declaration, server-side validation and durable admin notification receipts. | Only 6 active sellers and 1 new user in 30 days; no measured seller acquisition campaign or abandoned-onboarding recovery. |
| 3 | Listing quality, verification and trust | 45% | 78% | Required flight fields, seller-declared documents and inspection date, controlled document-review badge with separate identity/document gates and explicit non-airworthiness boundary. | 0 listings have completed verification; 2 of 9 flight listings still lack a serial number in historical data. |
| 4 | Catalogue, search and buyer experience | 70% | 82% | Search, country filter, sorting, result counts, canonical pages, mobile-safe listing images and 13 active listings with valid primary images. | Inventory breadth and country taxonomy are weak; country values contain variants that reduce filtering quality. |
| 5 | Buyer-to-seller conversion and opportunity tracking | 25% | 82% | Durable enquiries, deduplication, seller delivery receipt, seller/admin pipeline, contact details, status progression and evidence-based outcome closure. | 60 views produced 0 tracked contacts in the measured period; the new production funnel has not yet produced a live lead. |
| 6 | Premium, subscriptions, payments and revenue traceability | 72% | 78% | Stripe webhook idempotency, entitlement readback, durable payment notification receipts and separate settled-revenue evidence. | 8 Premium users include 6 legacy grants and only 2 Stripe-managed users; no live payment receipt or live gross evidence exists in the current ledger. |
| 7 | New-balloon requests and intermediation | 45% | 78% | Requests fail closed unless stored, admin notification acceptance is persisted, status is managed centrally and outcomes can record gross and AeroTrade revenue. | No real quote request has yet exercised the production path. |
| 8 | SEO, content, international acquisition and demand measurement | 60% | 70% | Canonicals, metadata, sitemap, robots, searchable catalogue and bounded UTM/referrer attribution. | No current evidence of search impressions, qualified international acquisition or category-specific content performance. |
| 9 | Commercial automation, communications and recovery | 60% | 72% | Newsletter and Premium-alert ledgers, partial-failure semantics, selective recovery and durable operational notification receipts. | Historical newsletter runs include 2 partial results and Premium alerts include 1 failure; opportunity follow-up is still manual. |
| 10 | Analytics, Control Tower and operational insight | 45% | 88% | One commercial dashboard now joins views, contacts, enquiries, quotes, outcomes, notification failures and verified payment evidence. A reproducible PII-free production audit exists. | Cohort and source-to-outcome reporting needs real enquiry/outcome volume before it can be validated. |
| 11 | Security, privacy, anti-fraud and data integrity | 75% | 90% | Private RLS tables, anonymous access denied, no raw visitor IDs, daily event deduplication, bounded inputs, honeypot/consent and explicit verification limits. | No independent penetration test; seller and buyer identity assurance is still operational rather than automated. |
| 12 | Production, deployment, persistence, tests and recovery | 88% | 92% | Main branch consolidated, migrations registered and read back, Netlify deployment live, public routes healthy, protected routes redirect unauthenticated users, 30 tests and 30 contracts pass. | Synthetic monitoring is not yet exercising a full safe commercial transaction; Next.js reports an Edge runtime deprecation warning. |

**Weighted equally: 57.1% initial → 78.3% current.**

## Interpretation

The platform is now technically capable of receiving an enquiry, preserving it if email fails, exposing it to the seller, progressing it through a commercial pipeline and recording an evidence-qualified outcome without pretending that reported value is settled revenue. The remaining constraint is no longer missing infrastructure; it is validated marketplace liquidity and acquisition. Scores for acquisition and economics must not rise materially until real sellers, enquiries, quotes and outcomes exercise the new paths.

## Next highest-value block

Build demand capture for buyers who do not find suitable inventory, match that demand to present and future listings, and measure source-to-enquiry conversion. Activate communications only for explicit user opt-ins and do not launch campaigns without approval.
