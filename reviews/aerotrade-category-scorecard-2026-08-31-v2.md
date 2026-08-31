# AeroTrade category scorecard — 2026-08-31 v2

This update is based on the read-only production snapshots `marketplace-audit-2026-08-31-v3.json` and `stripe-commercial-audit-2026-08-31-v2.json`, the paid-product, negotiation and new-balloon delivery verification receipts, the deployed database migrations and the local release gates. It contains no personal data.

## Method

- **Technical readiness (70%)** measures whether the complete path exists, is guarded, auditable, tested and recoverable.
- **Production/commercial proof (30%)** measures whether real users and providers have completed the path recently.
- **Maturity** is `technical readiness × 0.70 + production/commercial proof × 0.30`, rounded to a whole percentage.
- No historical payment, lead, transaction or provider delivery is reconstructed by inference.

| # | Category | Technical | Proof | Maturity | Current evidence and principal gap |
|---|---|---:|---:|---:|---|
| 1 | Value proposition, business model and unit economics | 92 | 30 | 73 | The 9.99 EUR annual buyer product and 5 EUR per-listing seller product now have distinct provider metadata and entitlement links. One real recent buyer charge exists; no closed marketplace transaction has evidenced economics. |
| 2 | Seller acquisition, onboarding and activation | 91 | 42 | 76 | 12 active listings from 6 sellers and one pending-payment listing. Assisted and self-service paths work; recent seller activation remains sparse. |
| 3 | Listing quality, trust, verification and availability | 93 | 35 | 76 | 84/84 active image files were reachable and aircraft fields are strong. Zero document-verified listings and 11/12 active listings lack a current seller availability confirmation. |
| 4 | Catalogue, search and buyer experience | 96 | 30 | 76 | Public catalogue, bounded search, mobile routes, international landings and sold-listing recovery are live. Genuine attributable buyer demand remains low. |
| 5 | Buyer conversion, enquiry and marketplace closing | 97 | 5 | 69 | Account-free enquiry, negotiation, follow-up and closure paths are implemented. Buyer receipts distinguish accepted delivery from stored recovery, and failed negotiation updates now retry safely in both directions without reviving superseded messages. The comparable funnel still has no real stored enquiry or closed transaction. |
| 6 | Premium, payments and monetisation | 99 | 70 | 90 | New Seller Launch checkouts are single-live, seller/listing-bound and fail closed if the ledger cannot persist. Signed Stripe fulfillment verifies entitlement, seller confirmation, Premium alert and readback. Future charge receipts link to the exact user/listing. The one historical payment predates this ledger and remains truthfully unlinked. |
| 7 | New-balloon sales: Pasha and Schroeder | 97 | 0 | 68 | Request, proposal, buyer response, outcome and settlement evidence paths exist. Failed proposal and internal response deliveries now retry from trusted stored evidence, reconcile provider acceptance without resending, and retire expired or superseded work. Production still has zero genuine requests or proposals, so proof remains zero. |
| 8 | SEO, international acquisition and distribution | 93 | 20 | 71 | Localised acquisition, structured data, IndexNow and measured social distribution exist. Four social placements were accepted, but no attributable landing journey has converted. |
| 9 | Automation, communications and follow-up | 98 | 70 | 90 | Paid alerts, used-equipment negotiations and new-balloon proposals are provider-idempotent, bounded and receipt-readback bound. Accepted provider deliveries can be reconciled without a duplicate email, while stale commercial state is never revived. Newsletter selection prioritises every never-included paid promotion before rotating by exposure. |
| 10 | Analytics, Control Tower and commercial evidence | 99 | 60 | 87 | Control Tower now distinguishes gross receipt evidence, exact paid entitlement links and Seller Launch intent state. Historic pre-ledger payment evidence is intentionally not backfilled. |
| 11 | Security, privacy and transactional integrity | 99 | 90 | 96 | A delayed or superseded checkout cannot publish the wrong listing; seller, plan and lifecycle are re-read before fulfillment. Private ledgers remain inaccessible to clients and unsigned webhooks fail closed. |
| 12 | Deployment, production reliability and operability | 98 | 85 | 94 | 180 tests and 193 contracts pass. The new-balloon recovery migration matches production, the service-role boundary was verified with a safe negative case, the protected production dry-run passed and Netlify deploy `6a956ca416850d00084abd6b` was read back as ready. The remaining build warning is the non-outage Edge Runtime deprecation. |

## Aggregate

- Mean technical readiness: **96%**.
- Mean production/commercial proof: **45%**.
- Mean evidence-weighted maturity: **81%**.
- This release raises operational delivery reliability, but deliberately does not raise demand or transaction proof without external users.

## Next highest-value constraint

The marketplace machinery is ahead of its commercial proof. The next safe technical work should focus on offer freshness and conversion evidence, while the first external action requiring Jordi's specific approval remains the grouped availability request: 11 listings across 5 sellers. Without those confirmations, AeroTrade cannot claim that most of its supply is currently available. No availability email was sent during this release.
