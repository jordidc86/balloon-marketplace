# AeroTrade category scorecard — 2026-08-31

This scorecard is based on the production snapshots in `marketplace-audit-2026-08-31.json` and `stripe-commercial-audit-2026-08-31.json`, the production account-recovery rehearsal, and the local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether recent production evidence proves that people and providers have completed the path. Missing demand is not silently scored as a technical failure, and missing evidence is never converted to zero revenue or an invented outcome.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- A score above 90 means both the machinery and its production evidence are strong. A technically complete path with no real users remains below 90.

| # | Category | Technical | Proof | Maturity | Production evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 90 | 30 | 72 | Distinct buyer/seller products and evidence-gated economics exist. One recent EUR 9.99 Premium charge is real; no closed marketplace outcome has complete economics yet. |
| 2 | Seller acquisition, onboarding and activation | 91 | 42 | 76 | 12 active listings from 6 sellers; assisted and self-service paths exist. Only 1 seller generated recent activation evidence and one listing remains pending payment. |
| 3 | Listing quality, trust, verification and availability | 93 | 35 | 76 | 84/84 checked active image files were reachable and aircraft identity coverage is high. Zero listings are document-verified and 11/12 active listings have never had an availability confirmation. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public categories, countries, manufacturers, mobile routes and truthful SEO are live. Sold-listing recovery now preserves inbound traffic without reopening seller contact; buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 94 | 5 | 67 | Enquiry, negotiation, account-free status and closure controls exist. The comparable funnel has only 1.84 observed days and no views, enquiries or closed transactions yet. |
| 6 | Premium, payments and monetisation | 96 | 70 | 88 | Stripe live webhook covers every required event and the latest annual Premium payment produced an active entitlement through 2027. Four recent checkouts expired and the successful historical charge predates the payment-receipt migration. |
| 7 | New-balloon sales: Pasha and Schroeder | 94 | 0 | 66 | Source-attributed request, proposal, response and outcome paths exist. Production has zero requests, proposals, responses or won outcomes. |
| 8 | SEO, international acquisition and distribution | 93 | 20 | 71 | Localised acquisition pages, structured data, IndexNow and attributable social links exist. Four social placements were provider-accepted, but there are no attributed landing visits and legacy views are not comparable. |
| 9 | Automation, communications and follow-up | 92 | 70 | 85 | 21/22 commercial notifications and four social publications were accepted. Newsletter has three successful live runs, but only one current active marketing consent. |
| 10 | Analytics, Control Tower and commercial evidence | 97 | 60 | 86 | Named PII-free production queries, journey keys, receipts and unit-economics boundaries are live. Recent traffic is too young to yield conversion rates, and the pre-migration Premium payment has no retroactive receipt. |
| 11 | Security, privacy and transactional integrity | 98 | 90 | 96 | Account recovery is one-time, scanner-safe, receipt-bound and passed a disposable production rehearsal including replay rejection and cleanup. Commercial writes fail closed and private ledgers remain non-public. |
| 12 | Deployment, production reliability and operability | 96 | 85 | 93 | 166 tests and 182 local operational contracts pass, production uses explicit release markers, and runtime deployments have rehearsed gates. The remaining warning is Next.js Edge Runtime deprecation, not a current outage. |

## Current aggregate

- Mean technical readiness: **94%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **79%**.
- Strongest chapters: security/integrity, production reliability, Premium/payments.
- Largest value gaps: real buyer conversion, new-balloon demand, current listing availability evidence and attributed acquisition.

## Next bottleneck selected

The first intervention is sold-inventory demand recovery. Previously, a public listing closed as sold became a 404, wasting Google, social and shared-link traffic. The new path keeps only previously public sold listings accessible, marks them `SoldOut`, closes all seller-contact/enquiry/watch actions, proposes comparable active inventory, and routes unmet demand to the existing wanted or new-balloon funnels with bounded attribution. Sold traffic is measured separately as `SOLD_VIEW`, so it cannot inflate the active-listing conversion funnel.
