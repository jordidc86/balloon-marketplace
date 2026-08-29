# AeroTrade evidence-based scorecard — 2026-08-29

## Method

Each category is assessed against five gates: the capability exists, works under validation, persists durably, is measurable, and fails safely or can be operated autonomously. Partial evidence receives partial credit. A feature is not treated as commercially proven merely because its code exists.

Authoritative evidence used:

- Read-only production snapshot: `reviews/marketplace-audit-2026-08-29.json`.
- Production database migrations through `20260829160000` with RLS and post-write verification.
- Public production smoke checks against `https://aerotrade.app`.
- 35 automated tests, 33 operational contracts, lint, production build and dependency audit.
- Netlify production deployment and Supabase migration history.

## Scores

| # | Category | Initial | Current | Evidence now | Principal remaining gap |
|---|---|---:|---:|---|---|
| 1 | Value proposition, business model and unit economics | 45% | 62% | Gross outcome value and AeroTrade revenue can now be recorded separately with reported/documented/settled evidence. Stripe evidence remains separate. | No closed outcomes or settled marketplace revenue exist yet; pricing and take-rate economics remain commercially unproven. |
| 2 | Seller acquisition and onboarding | 55% | 68% | Self-service publication, image safeguards, required seller declaration, server-side validation and durable admin notification receipts. | Only 6 active sellers and 1 new user in 30 days; no measured seller acquisition campaign or abandoned-onboarding recovery. |
| 3 | Listing quality, verification and trust | 45% | 76% | Required flight fields, seller-declared documents and inspection date, controlled document-review badge with separate identity/document gates, explicit non-airworthiness boundary and real image-file probes. Broken files now render a safe fallback. | 0 listings have completed verification; 2 of 9 flight listings lack a serial number, and 1 active listing currently has no reachable image file (8 inaccessible image rows). |
| 4 | Catalogue, search and buyer experience | 70% | 87% | Search, country filter, sorting, result counts, canonical pages, mobile-safe listing images and explicit paths from missing inventory to a private wanted request or a new Pasha/Schroeder quote. | Inventory breadth and country taxonomy are weak; country values contain variants that reduce filtering quality. |
| 5 | Buyer-to-seller conversion and opportunity tracking | 25% | 87% | Durable enquiries and unmet-demand requests, deduplication, rate limiting, delivery receipts, status pipelines, basic supply matching and evidence-based outcome closure. | 60 views produced 0 tracked contacts in the measured period; neither production funnel has yet produced a live lead. |
| 6 | Premium, subscriptions, payments and revenue traceability | 72% | 78% | Stripe webhook idempotency, entitlement readback, durable payment notification receipts and separate settled-revenue evidence. | 8 Premium users include 6 legacy grants and only 2 Stripe-managed users; no live payment receipt or live gross evidence exists in the current ledger. |
| 7 | New-balloon requests and intermediation | 45% | 83% | Requests fail closed unless stored, admin notification acceptance is persisted, status is managed centrally, and used-equipment dead ends now offer an approximate new Pasha/Schroeder quote. | No real quote request has yet exercised the production path. |
| 8 | SEO, content, international acquisition and demand measurement | 60% | 76% | Canonicals, metadata, sitemap, robots, searchable catalogue and bounded UTM/referrer attribution now include wanted-equipment conversions without retaining raw visitor IDs. | No current evidence of search impressions, qualified international acquisition or category-specific content performance. |
| 9 | Commercial automation, communications and recovery | 60% | 75% | Newsletter and Premium-alert ledgers, partial-failure semantics, selective recovery, durable operational receipts and opt-in match intent. No match campaign has been activated. | Historical newsletter runs include 2 partial results and Premium alerts include 1 failure; wanted-request follow-up remains deliberately manual until real demand validates it. |
| 10 | Analytics, Control Tower and operational insight | 45% | 90% | One commercial dashboard now joins views, contacts, enquiries, wanted demand, current supply matches, quotes, outcomes, notification failures and verified payment evidence. A reproducible PII-free production audit exists. | Cohort and source-to-outcome reporting needs real enquiry/outcome volume before it can be validated. |
| 11 | Security, privacy, anti-fraud and data integrity | 75% | 92% | Private RLS tables, anonymous access denied, no raw visitor IDs, daily event deduplication, bounded inputs, honeypot, pseudonymous rate limiting, explicit consent and verification limits. | No independent penetration test; seller and buyer identity assurance is still operational rather than automated. |
| 12 | Production, deployment, persistence, tests and recovery | 88% | 93% | Main branch consolidation discipline, migrations registered and read back, public route health, protected-route enforcement, 35 tests and 33 contracts. | Synthetic monitoring is not yet exercising a full safe commercial transaction; Next.js reports an Edge runtime deprecation warning. |

**Weighted equally: 57.1% initial → 80.6% current.**

## Interpretation

The platform can receive either a listing-specific enquiry or unmet buying demand, preserve it if email fails, compare the latter with active supply, route a buyer toward a new-balloon quote, progress opportunities and record evidence-qualified outcomes without pretending that reported value is settled revenue. The remaining constraint is validated marketplace liquidity and acquisition. Scores for acquisition and economics must not rise materially until real sellers, enquiries, wanted requests, quotes and outcomes exercise the paths.

## Next highest-value block

Use the new demand ledger to identify supply gaps and recruit relevant sellers by category and geography, while measuring source-to-opportunity conversion. Do not launch outreach or match campaigns without approval and real opt-in evidence.
