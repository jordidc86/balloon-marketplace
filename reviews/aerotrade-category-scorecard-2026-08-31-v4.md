# AeroTrade category scorecard — 2026-08-31 v4

This update is based on the read-only production snapshot `marketplace-audit-2026-08-31-v4.json`, Stripe readback, the production verification receipts, deployed database migrations and local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- No historical payment, lead, transaction, availability or provider delivery is reconstructed by inference.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 92 | 30 | 73 | The 9.99 EUR annual buyer product and 5 EUR per-listing seller product have distinct provider metadata and entitlement links. One real recent buyer charge exists; no closed marketplace transaction has evidenced economics. |
| 2 | Seller acquisition, onboarding and activation | 93 | 42 | 78 | 12 active listings from 6 sellers and one pending-payment listing. The accepted recovery now leads to both promised choices: resume the 5 EUR promotion or publish free. Free publication rejects completed payments, closes open matching sessions, atomically records publication and requires readback. The seller has not yet chosen either path. |
| 3 | Listing quality, trust, verification and availability | 95 | 35 | 77 | All 84 active image files are reachable and aircraft fields are strong. Availability requests can be reissued after expiry and failed initiated deliveries retry safely. Zero document-verified listings and 11/12 active listings still lack current seller confirmation. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Genuine attributable buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. Delivery recovery cannot revive superseded messages. The comparable funnel still has no real stored enquiry or closed transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | Seller Launch checkouts are single-live, seller/listing-bound and fail closed if their ledger cannot persist. Free fallback checks historical Stripe state and cannot override a completed payment. The one historical buyer payment remains truthfully separated from seller promotion revenue. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, buyer response, outcome and settlement evidence paths exist. Failed deliveries recover from trusted stored evidence. Production still has zero genuine requests or proposals. |
| 8 | SEO, international acquisition and distribution | 93 | 20 | 71 | Localised acquisition, structured data, IndexNow and measured social distribution exist. Four social placements were accepted, but no attributable landing journey has converted. |
| 9 | Automation, communications and follow-up | 99 | 70 | 90 | Paid alerts, negotiations, new-balloon proposals and seller-availability recovery are provider-idempotent, bounded and receipt-readback bound. Recovery never invents a seller decision. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower distinguishes gross receipt evidence, exact paid entitlement links, seller activation stages and availability age. Free fallback now records `LISTING_PUBLISHED` in the same atomic transition. Historic pre-ledger evidence is not backfilled. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | Late payment, wrong owner, wrong lifecycle, invalid quality state and unverified image state fail closed. Private ledgers remain inaccessible to clients and unsigned webhooks fail closed. |
| 12 | Deployment, production reliability and operability | 98 | 85 | 94 | 184 tests and 199 contracts pass. Migration `20260831660000` matches production, the wrong-seller negative case produced zero writes and Netlify deploy `6a957851e1114d000808cde2` is ready. The remaining build warning is the non-outage Edge Runtime deprecation. |

## Aggregate

- Mean technical readiness: **96%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- Reliability improved, but proof is unchanged because AeroTrade did not publish the pending advert or make a seller decision on the owner's behalf.

## Next highest-value constraints

1. **Supply freshness:** 11 listings across 5 sellers need real owner confirmation. This requires Jordi's explicit approval for one grouped transactional email per seller.
2. **Seller activation:** the historical unpaid listing now has a truthful self-service choice, but remains private until its owner chooses payment or free publication.
3. **Commercial proof:** no comparable buyer enquiry, new-balloon request or closed marketplace transaction exists yet. The next gains depend more on qualified demand and real seller responses than on additional internal machinery.
